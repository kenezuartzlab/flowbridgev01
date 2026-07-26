import { describe, expect, it, vi } from 'vitest';
import { parseUnits } from 'viem';
import {
  ALLOWANCE_POLL_ATTEMPTS,
  executeEvmBridgeDeposit,
  type BridgeDeps,
  type Hex,
} from './evmBridge';

const OWNER = '0x1111111111111111111111111111111111111111' as Hex;
const USDT_BNB = '0x55d398326f99059fF775485246999027B3197955' as Hex;
const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Hex;
const BNB_BRIDGE = '0x3cd6000000000000000000000000000000004b55' as Hex;
const ETH_BRIDGE = '0x4444000000000000000000000000000000004444' as Hex;
const APPROVE_HASH = '0xaaaa' as Hex;
const DEPOSIT_HASH = '0xbbbb' as Hex;

const BSC = 56;
const ETH_MAINNET = 1;
const BOT = 677;

const DEPOSIT_ABI = [
  {
    inputs: [
      { name: 'destinationChainId', type: 'uint256' },
      { name: 'resourceId', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

const RESOURCE_ID = '0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d' as Hex;

interface HarnessOptions {
  /** Sequence of allowance reads (last value repeats). */
  allowances?: bigint[];
  balance?: bigint;
  approvalStatus?: 'success' | 'reverted';
  simulateError?: Error;
  /** Wallet chain ids over time (last value repeats); starts on the wrong chain by default. */
  chainIds?: (number | undefined)[];
  switchFails?: boolean;
  confirmed?: boolean;
}

function harness(opts: HarnessOptions = {}) {
  const allowances = [...(opts.allowances ?? [0n])];
  const chainIds = [...(opts.chainIds ?? [BSC])];
  const calls: string[] = [];

  const next = <T,>(queue: T[]): T => (queue.length > 1 ? (queue.shift() as T) : queue[0]);

  const deps: BridgeDeps = {
    client: {
      readAllowance: vi.fn(async () => {
        calls.push('readAllowance');
        return next(allowances);
      }),
      readBalance: vi.fn(async () => {
        calls.push('readBalance');
        return opts.balance ?? parseUnits('1000000', 18);
      }),
      waitForReceipt: vi.fn(async () => {
        calls.push('waitForReceipt');
        return { status: opts.approvalStatus ?? ('success' as const) };
      }),
      simulateDeposit: vi.fn(async () => {
        calls.push('simulateDeposit');
        if (opts.simulateError) throw opts.simulateError;
      }),
    },
    sendApproval: vi.fn(async () => {
      calls.push('sendApproval');
      return APPROVE_HASH;
    }),
    sendDeposit: vi.fn(async () => {
      calls.push('sendDeposit');
      return DEPOSIT_HASH;
    }),
    getChainId: vi.fn(() => next(chainIds)),
    switchChain: vi.fn(async () => {
      calls.push('switchChain');
      if (opts.switchFails) throw new Error('User rejected the request.');
    }),
    confirm: vi.fn(async () => {
      calls.push('confirm');
      return opts.confirmed ?? true;
    }),
    onStep: vi.fn((step: string) => calls.push(`step:${step}`)),
    // Deterministic: never actually wait in tests.
    sleep: vi.fn(async () => {}),
  };

  return { deps, calls };
}

const bnbRequest = (amount = parseUnits('100', 18), functionName = 'deposit') => ({
  chainId: BSC,
  token: USDT_BNB,
  owner: OWNER,
  bridge: BNB_BRIDGE,
  abi: DEPOSIT_ABI,
  functionName,
  args: [BigInt(BOT), RESOURCE_ID, OWNER, amount],
  amount,
  gas: 1_000_000n,
});

const ethRequest = (amount = parseUnits('50', 6), functionName = 'deposit') => ({
  chainId: ETH_MAINNET,
  token: USDT_ETH,
  owner: OWNER,
  bridge: ETH_BRIDGE,
  abi: DEPOSIT_ABI,
  functionName,
  args: [BigInt(BOT), RESOURCE_ID, OWNER, amount],
  amount,
  gas: 600_000n,
});

describe('BNB → BOT bridging', () => {
  it('completes: approves, waits for the mined allowance, simulates, deposits, confirms', async () => {
    const amount = parseUnits('100', 18);
    const { deps, calls } = harness({ allowances: [0n, amount] });

    const result = await executeEvmBridgeDeposit(deps, bnbRequest(amount));

    expect(result).toEqual({ hash: DEPOSIT_HASH, confirmed: true });
    expect(calls).toEqual([
      'readAllowance',
      'step:approving_usdt',
      'sendApproval',
      'waitForReceipt',
      'readAllowance',
      'step:bridging_usdt',
      'readBalance',
      'simulateDeposit',
      'sendDeposit',
      'confirm',
    ]);
  });

  it('never broadcasts the deposit before the approval receipt is mined', async () => {
    const amount = parseUnits('100', 18);
    const { deps, calls } = harness({ allowances: [0n, amount] });

    await executeEvmBridgeDeposit(deps, bnbRequest(amount));

    expect(calls.indexOf('waitForReceipt')).toBeLessThan(calls.indexOf('sendDeposit'));
    expect(calls.indexOf('simulateDeposit')).toBeLessThan(calls.indexOf('sendDeposit'));
  });

  it('skips the approval when the allowance is already sufficient', async () => {
    const amount = parseUnits('100', 18);
    const { deps } = harness({ allowances: [parseUnits('500', 18)] });

    await executeEvmBridgeDeposit(deps, bnbRequest(amount));

    expect(deps.sendApproval).not.toHaveBeenCalled();
    expect(deps.sendDeposit).toHaveBeenCalledTimes(1);
  });

  it('tolerates lagging RPC nodes by polling the allowance until it is visible', async () => {
    const amount = parseUnits('100', 18);
    const { deps } = harness({ allowances: [0n, 0n, 0n, amount] });

    await executeEvmBridgeDeposit(deps, bnbRequest(amount));

    expect(deps.client.readAllowance).toHaveBeenCalledTimes(4);
    expect(deps.sendDeposit).toHaveBeenCalledTimes(1);
  });

  it('aborts with a no-funds-moved message when the allowance never appears', async () => {
    const { deps } = harness({ allowances: [0n] });

    await expect(executeEvmBridgeDeposit(deps, bnbRequest())).rejects.toThrow(/no funds were sent/i);
    expect(deps.client.readAllowance).toHaveBeenCalledTimes(1 + ALLOWANCE_POLL_ATTEMPTS);
    expect(deps.sendDeposit).not.toHaveBeenCalled();
  });

  it('aborts when the approval transaction reverts', async () => {
    const { deps } = harness({ allowances: [0n], approvalStatus: 'reverted' });

    await expect(executeEvmBridgeDeposit(deps, bnbRequest())).rejects.toThrow(/approval transaction failed/i);
    expect(deps.sendDeposit).not.toHaveBeenCalled();
  });

  it('blocks the deposit when the USDT balance is short', async () => {
    const amount = parseUnits('100', 18);
    const { deps } = harness({ allowances: [amount], balance: parseUnits('9', 18) });

    await expect(executeEvmBridgeDeposit(deps, bnbRequest(amount))).rejects.toThrow(/not enough usdt/i);
    expect(deps.sendDeposit).not.toHaveBeenCalled();
  });

  it('translates a reverting simulation (e.g. below the $10 minimum) into guidance', async () => {
    const amount = parseUnits('5', 18);
    const { deps } = harness({
      allowances: [amount],
      simulateError: Object.assign(new Error('execution reverted'), { shortMessage: 'execution reverted' }),
    });

    await expect(executeEvmBridgeDeposit(deps, bnbRequest(amount))).rejects.toThrow(/no funds left your wallet/i);
    expect(deps.sendDeposit).not.toHaveBeenCalled();
  });

  it('reports a gas problem when the simulation fails for insufficient funds', async () => {
    const amount = parseUnits('100', 18);
    const { deps } = harness({
      allowances: [amount],
      simulateError: Object.assign(new Error('x'), { shortMessage: 'insufficient funds for gas * price + value' }),
    });

    await expect(executeEvmBridgeDeposit(deps, bnbRequest(amount))).rejects.toThrow(/not enough gas/i);
  });

  it('supports the "receive BOT for gas" variant', async () => {
    const amount = parseUnits('100', 18);
    const { deps } = harness({ allowances: [amount] });

    await executeEvmBridgeDeposit(deps, bnbRequest(amount, 'depositWithBotGas'));

    expect(deps.sendDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'depositWithBotGas', bridge: BNB_BRIDGE, gas: 1_000_000n }),
    );
  });

  it('reports an unconfirmed result when the deposit fails on-chain', async () => {
    const amount = parseUnits('100', 18);
    const { deps } = harness({ allowances: [amount], confirmed: false });

    await expect(executeEvmBridgeDeposit(deps, bnbRequest(amount))).resolves.toEqual({
      hash: DEPOSIT_HASH,
      confirmed: false,
    });
  });
});

describe('chain switching', () => {
  it('switches to BSC and verifies the wallet followed before signing anything', async () => {
    const amount = parseUnits('100', 18);
    const { deps, calls } = harness({ allowances: [amount], chainIds: [BOT, BOT, BSC] });

    await executeEvmBridgeDeposit(deps, bnbRequest(amount));

    expect(deps.switchChain).toHaveBeenCalledWith(BSC);
    expect(calls.indexOf('switchChain')).toBeLessThan(calls.indexOf('readAllowance'));
    expect(calls.indexOf('switchChain')).toBeLessThan(calls.indexOf('sendDeposit'));
  });

  it('does not switch when the wallet is already on the source chain', async () => {
    const amount = parseUnits('50', 6);
    const { deps } = harness({ allowances: [amount], chainIds: [ETH_MAINNET] });

    await executeEvmBridgeDeposit(deps, ethRequest(amount));

    expect(deps.switchChain).not.toHaveBeenCalled();
  });

  it('fails before any signature when the wallet stays on the wrong chain', async () => {
    const { deps } = harness({ allowances: [parseUnits('100', 18)], chainIds: [BOT] });

    await expect(executeEvmBridgeDeposit(deps, bnbRequest())).rejects.toThrow(/wrong network/i);
    expect(deps.sendApproval).not.toHaveBeenCalled();
    expect(deps.sendDeposit).not.toHaveBeenCalled();
  });

  it('propagates a rejected network switch without touching the token', async () => {
    const { deps } = harness({ allowances: [parseUnits('100', 18)], chainIds: [BOT], switchFails: true });

    await expect(executeEvmBridgeDeposit(deps, bnbRequest())).rejects.toThrow(/rejected/i);
    expect(deps.sendApproval).not.toHaveBeenCalled();
  });
});

describe('ETH → BOT bridging', () => {
  it('completes with 6-decimal USDT amounts and the Ethereum gas limit', async () => {
    const amount = parseUnits('50', 6);
    const { deps, calls } = harness({ allowances: [0n, amount], chainIds: [ETH_MAINNET] });

    const result = await executeEvmBridgeDeposit(deps, ethRequest(amount));

    expect(result.confirmed).toBe(true);
    expect(deps.sendApproval).toHaveBeenCalledWith({
      token: USDT_ETH,
      spender: ETH_BRIDGE,
      chainId: ETH_MAINNET,
      amount,
    });
    expect(deps.sendDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ bridge: ETH_BRIDGE, chainId: ETH_MAINNET, gas: 600_000n }),
    );
    expect(deps.confirm).toHaveBeenCalledWith(DEPOSIT_HASH, ETH_MAINNET);
    expect(calls.indexOf('waitForReceipt')).toBeLessThan(calls.indexOf('sendDeposit'));
  });

  it('waits out a lagging allowance on Ethereum instead of reverting the deposit', async () => {
    const amount = parseUnits('50', 6);
    const { deps } = harness({ allowances: [0n, 0n, amount], chainIds: [ETH_MAINNET] });

    await executeEvmBridgeDeposit(deps, ethRequest(amount));

    expect(deps.sendApproval).toHaveBeenCalledTimes(1);
    expect(deps.sendDeposit).toHaveBeenCalledTimes(1);
  });

  it('switches from BOT Chain to Ethereum before approving', async () => {
    const amount = parseUnits('50', 6);
    const { deps, calls } = harness({ allowances: [0n, amount], chainIds: [BOT, ETH_MAINNET] });

    await executeEvmBridgeDeposit(deps, ethRequest(amount));

    expect(deps.switchChain).toHaveBeenCalledWith(ETH_MAINNET);
    expect(calls.indexOf('switchChain')).toBeLessThan(calls.indexOf('sendApproval'));
  });

  it('supports depositWithBotGas for gas top-ups on arrival', async () => {
    const amount = parseUnits('50', 6);
    const { deps } = harness({ allowances: [amount], chainIds: [ETH_MAINNET] });

    await executeEvmBridgeDeposit(deps, ethRequest(amount, 'depositWithBotGas'));

    expect(deps.sendDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'depositWithBotGas' }),
    );
  });

  it('blocks the deposit when the wallet cannot cover the amount', async () => {
    const amount = parseUnits('50', 6);
    const { deps } = harness({ allowances: [amount], balance: parseUnits('10', 6), chainIds: [ETH_MAINNET] });

    await expect(executeEvmBridgeDeposit(deps, ethRequest(amount))).rejects.toThrow(/not enough usdt/i);
    expect(deps.sendDeposit).not.toHaveBeenCalled();
  });
});
