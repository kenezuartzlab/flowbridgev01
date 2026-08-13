import { describe, expect, it, vi } from 'vitest';
import { encodeEventTopics, encodeAbiParameters, maxUint256, parseUnits } from 'viem';
import { BRIDGE_ADAPTER_ABI } from './adapterAbi';
import {
  ADAPTER_DEADLINE_SECONDS,
  AdapterExecutionError,
  ensureExactAllowance,
  executeAdapterBridge,
  parseBridgeRequestedNonce,
  resolveAdapterExecutionRoute,
  type AdapterExecutionDeps,
} from './adapterExecution';
import { ADAPTER_CHAIN_IDS, ADAPTER_TOKENS } from './adapterConfig';
import type { PreviewSourceTuple } from './adapterPreview';

const USER = '0x1111111111111111111111111111111111111111' as const;
const RECIPIENT = '0x2222222222222222222222222222222222222222' as const;
const ZERO = '0x0000000000000000000000000000000000000000' as const;
const GATEWAY = '0x9999999999999999999999999999999999999999';

const tuple = (
  refundable: bigint,
  opts: { bridgePaused?: boolean; tokenPaused?: boolean; min?: bigint; max?: bigint } = {},
): PreviewSourceTuple => [
  1n,
  refundable,
  30n,
  0n,
  opts.min ?? 0n,
  opts.max ?? 0n,
  opts.bridgePaused ?? false,
  opts.tokenPaused ?? false,
];

const bridgeRequestedLog = (nonce: bigint) => {
  const topics = encodeEventTopics({
    abi: BRIDGE_ADAPTER_ABI,
    eventName: 'BridgeRequested',
    args: { gatewayNonce: nonce, sender: USER, destinationRecipient: RECIPIENT },
  });
  const data = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }],
    [USER, 100n, 97n, 3n, false],
  );
  return { topics, data };
};

function makeDeps(over: Partial<AdapterExecutionDeps> = {}, preview = tuple(97n)) {
  const deps: AdapterExecutionDeps = {
    readPreviewSource: vi.fn(async () => preview),
    readBlockTimestamp: vi.fn(async () => 1_700_000_000n),
    readAllowance: vi.fn(async () => 0n),
    writeApprove: vi.fn(async () => '0xapprove' as `0x${string}`),
    waitForReceipt: vi.fn(async () => ({ logs: [bridgeRequestedLog(42n)] })),
    simulateBridge: vi.fn(async () => ({})),
    writeBridge: vi.fn(async () => '0xbridge' as `0x${string}`),
    parseBridgeRequested: vi.fn((logs) => parseBridgeRequestedNonce(logs)),
    ...over,
  };
  return deps;
}

const bnbToBot = {
  sourceChainId: ADAPTER_CHAIN_IDS.bnbTestnet,
  destinationChainId: ADAPTER_CHAIN_IDS.botTestnet,
  destinationRecipient: RECIPIENT,
  refundRecipient: USER,
  owner: USER,
  flagEnabled: true,
  executionFlagEnabled: true,
};

const botToBnb = {
  ...bnbToBot,
  sourceChainId: ADAPTER_CHAIN_IDS.botTestnet,
  destinationChainId: ADAPTER_CHAIN_IDS.bnbTestnet,
};

describe('gates', () => {
  it('flag OFF → rejected before any write', async () => {
    const deps = makeDeps();
    await expect(
      executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n, flagEnabled: false }),
    ).rejects.toThrow(/flag is disabled/i);
    expect(deps.writeBridge).not.toHaveBeenCalled();
    expect(deps.writeApprove).not.toHaveBeenCalled();
    expect(deps.readPreviewSource).not.toHaveBeenCalled();
  });

  it('inactive/unsupported route (Sepolia, mainnet) → rejected', () => {
    for (const src of [ADAPTER_CHAIN_IDS.sepolia, 56, 677]) {
      expect(() =>
        resolveAdapterExecutionRoute({
          ...bnbToBot,
          sourceChainId: src,
          destinationChainId: ADAPTER_CHAIN_IDS.botTestnet,
          amountWei: 1n,
        }),
      ).toThrow(/No active adapter route/);
    }
  });

  it('wrong source chain for the direction → rejected', () => {
    expect(() =>
      resolveAdapterExecutionRoute({
        ...bnbToBot,
        sourceChainId: ADAPTER_CHAIN_IDS.botTestnet,
        destinationChainId: ADAPTER_CHAIN_IDS.botTestnet,
        amountWei: 1n,
      }),
    ).toThrow(AdapterExecutionError);
  });

  it('zero / negative amount → rejected', () => {
    for (const amt of [0n, -1n]) {
      expect(() => resolveAdapterExecutionRoute({ ...bnbToBot, amountWei: amt })).toThrow(/greater than zero/);
    }
  });

  it('zero recipient or refund address → rejected', () => {
    expect(() =>
      resolveAdapterExecutionRoute({ ...bnbToBot, amountWei: 1n, destinationRecipient: ZERO }),
    ).toThrow(/Destination recipient/);
    expect(() => resolveAdapterExecutionRoute({ ...bnbToBot, amountWei: 1n, refundRecipient: ZERO })).toThrow(
      /Refund recipient/,
    );
    expect(() =>
      resolveAdapterExecutionRoute({ ...bnbToBot, amountWei: 1n, destinationRecipient: 'nope' }),
    ).toThrow(/Destination recipient/);
  });

  it('paused bridge → rejected, no writes', async () => {
    const deps = makeDeps({}, tuple(97n, { bridgePaused: true }));
    await expect(executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n })).rejects.toThrow(
      /Bridge is paused/,
    );
    expect(deps.writeApprove).not.toHaveBeenCalled();
    expect(deps.writeBridge).not.toHaveBeenCalled();
  });

  it('paused token → rejected, no writes', async () => {
    const deps = makeDeps({}, tuple(97n, { tokenPaused: true }));
    await expect(executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n })).rejects.toThrow(
      /Token is paused/,
    );
    expect(deps.writeBridge).not.toHaveBeenCalled();
  });

  it('below live minimum / above live maximum → rejected (USD bounds vs token units)', async () => {
    const oneToken = 10n ** 18n;
    // min = 500 USD, sending 100 USDT
    const low = makeDeps({}, tuple(97n, { min: 500n }));
    await expect(executeAdapterBridge(low, { ...bnbToBot, amountWei: 100n * oneToken })).rejects.toThrow(
      /below the live minimum/,
    );
    // max = 50 USD, sending 100 USDT
    const high = makeDeps({}, tuple(97n, { max: 50n }));
    await expect(executeAdapterBridge(high, { ...bnbToBot, amountWei: 100n * oneToken })).rejects.toThrow(
      /above the live maximum/,
    );
    // within bounds → allowed
    const ok = makeDeps({}, tuple(97n, { min: 10n, max: 50_000n }));
    await expect(executeAdapterBridge(ok, { ...bnbToBot, amountWei: 20n * oneToken })).resolves.toBeTruthy();
  });
});

describe('execution sequence', () => {
  it('uses the fresh preview refundableAmount as minRefundableAmount', async () => {
    const deps = makeDeps({}, tuple(1234n));
    const res = await executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n });
    expect(res.minRefundableAmount).toBe(1234n);
    expect((deps.writeBridge as any).mock.calls[0][0].minRefundableAmount).toBe(1234n);
    expect(deps.readPreviewSource).toHaveBeenCalledTimes(1);
  });

  it('derives a 20-minute deadline from the chain block timestamp, not local clock', async () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const chainTs = 1_600_000_000n;
    const deps = makeDeps({ readBlockTimestamp: vi.fn(async () => chainTs) });
    const res = await executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n });
    expect(res.deadline).toBe(chainTs + ADAPTER_DEADLINE_SECONDS);
    expect(res.deadline).not.toBe(now + ADAPTER_DEADLINE_SECONDS);
  });

  it('zero allowance → single exact approval', async () => {
    const deps = makeDeps({ readAllowance: vi.fn(async () => 0n) });
    const amount = parseUnits('25', 18);
    await executeAdapterBridge(deps, { ...bnbToBot, amountWei: amount });
    expect(deps.writeApprove).toHaveBeenCalledTimes(1);
    expect((deps.writeApprove as any).mock.calls[0][0].amount).toBe(amount);
  });

  it('stale non-exact allowance → approve 0 then exact', async () => {
    const deps = makeDeps({ readAllowance: vi.fn(async () => 5n) });
    const amount = parseUnits('25', 18);
    await executeAdapterBridge(deps, { ...bnbToBot, amountWei: amount });
    const calls = (deps.writeApprove as any).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].amount).toBe(0n);
    expect(calls[1][0].amount).toBe(amount);
  });

  it('exact existing allowance → no extra approval', async () => {
    const amount = parseUnits('25', 18);
    const deps = makeDeps({ readAllowance: vi.fn(async () => amount) });
    await executeAdapterBridge(deps, { ...bnbToBot, amountWei: amount });
    expect(deps.writeApprove).not.toHaveBeenCalled();
  });

  it('never requests unlimited approval and always uses the adapter as spender', async () => {
    const deps = makeDeps({ readAllowance: vi.fn(async () => 1n) });
    const amount = parseUnits('25', 18);
    const res = await executeAdapterBridge(deps, { ...bnbToBot, amountWei: amount });
    for (const [args] of (deps.writeApprove as any).mock.calls) {
      expect(args.amount).not.toBe(maxUint256);
      expect(args.spender.toLowerCase()).toBe(res.adapterAddress.toLowerCase());
      expect(args.spender.toLowerCase()).not.toBe(GATEWAY.toLowerCase());
      expect(args.token.toLowerCase()).toBe(ADAPTER_TOKENS.usdtBnbTestnet.toLowerCase());
    }
    await expect(
      ensureExactAllowance(deps, {
        token: ADAPTER_TOKENS.usdtBnbTestnet,
        owner: USER,
        adapter: res.adapterAddress,
        chainId: 97,
        amount: maxUint256,
      }),
    ).rejects.toThrow(/Unlimited approval/);
  });

  it('failed simulation → no bridge() write', async () => {
    const deps = makeDeps({
      simulateBridge: vi.fn(async () => {
        throw new Error('execution reverted');
      }),
    });
    await expect(executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n })).rejects.toThrow(
      /simulation failed/i,
    );
    expect(deps.writeBridge).not.toHaveBeenCalled();
  });

  it('successful simulation → exactly one adapter bridge() write', async () => {
    const deps = makeDeps();
    await executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n });
    expect(deps.simulateBridge).toHaveBeenCalledTimes(1);
    expect(deps.writeBridge).toHaveBeenCalledTimes(1);
  });

  it('parses gatewayNonce from the mined receipt and never predicts it', async () => {
    const deps = makeDeps({ waitForReceipt: vi.fn(async () => ({ logs: [bridgeRequestedLog(7777n)] })) });
    const res = await executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n });
    expect(res.gatewayNonce).toBe(7777n);
    // no pre-transaction nonce read exists in the dependency surface at all
    expect(Object.keys(deps)).not.toContain('readGatewayNonce');
    // source only: destination delivery is not claimed
    expect(res.sourceConfirmed).toBe(true);
    expect(res.destinationConfirmed).toBe(false);
  });

  it('returns null nonce when no BridgeRequested log is present', async () => {
    const deps = makeDeps({ waitForReceipt: vi.fn(async () => ({ logs: [] })) });
    const res = await executeAdapterBridge(deps, { ...bnbToBot, amountWei: 10n ** 18n });
    expect(res.gatewayNonce).toBeNull();
  });
});

describe('decimals fidelity', () => {
  it('6-decimal BOT source amount preserved exactly', async () => {
    const deps = makeDeps();
    const amount = parseUnits('12.345678', 6);
    const res = await executeAdapterBridge(deps, { ...botToBnb, amountWei: amount });
    expect(res.amount).toBe(12_345_678n);
    expect((deps.readPreviewSource as any).mock.calls[0][0].amountWei).toBe(12_345_678n);
    expect((deps.writeBridge as any).mock.calls[0][0].amount).toBe(12_345_678n);
    expect(res.sourceChainId).toBe(968);
  });

  it('18-decimal BNB source amount preserved exactly', async () => {
    const deps = makeDeps();
    const amount = parseUnits('12.345678901234567891', 18);
    const res = await executeAdapterBridge(deps, { ...bnbToBot, amountWei: amount });
    expect(res.amount).toBe(12_345_678_901_234_567_891n);
    expect((deps.writeBridge as any).mock.calls[0][0].amount).toBe(12_345_678_901_234_567_891n);
    expect(res.sourceChainId).toBe(97);
  });
});
