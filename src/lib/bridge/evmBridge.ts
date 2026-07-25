/**
 * Pure, dependency-injected core of the EVM → BOT / BOT → EVM bridge flow.
 *
 * The UI (src/App.tsx) only supplies wallet + RPC callbacks; all of the
 * ordering rules that users hit in production live here so they can be
 * covered by end-to-end tests:
 *
 *  1. the wallet must really be on the source chain before signing
 *  2. the ERC-20 approval must be MINED and VISIBLE before the deposit
 *  3. the deposit is simulated before the user is asked to sign
 *  4. success is only reported after the receipt confirms
 */

export type Hex = `0x${string}`;

export interface BridgeReadClient {
  readAllowance(args: { token: Hex; owner: Hex; spender: Hex }): Promise<bigint>;
  readBalance(args: { token: Hex; owner: Hex }): Promise<bigint>;
  waitForReceipt(hash: Hex): Promise<{ status: 'success' | 'reverted' }>;
  simulateDeposit(args: {
    account: Hex;
    bridge: Hex;
    abi: unknown;
    functionName: string;
    args: unknown[];
  }): Promise<void>;
}

export interface BridgeDeps {
  /** RPC reader bound to the source chain. */
  client: BridgeReadClient;
  /** Sends an unlimited ERC-20 approval, returns the tx hash. */
  sendApproval(args: { token: Hex; spender: Hex; chainId: number }): Promise<Hex>;
  /** Sends the bridge deposit, returns the tx hash. */
  sendDeposit(args: {
    bridge: Hex;
    abi: unknown;
    functionName: string;
    args: unknown[];
    chainId: number;
    gas: bigint;
  }): Promise<Hex>;
  /** Current wallet chain id. */
  getChainId(): number | undefined;
  switchChain(chainId: number): Promise<void>;
  /** Waits for the required confirmations; false = on-chain failure. */
  confirm(hash: Hex, chainId: number): Promise<boolean>;
  onStep?(step: 'switching_network' | 'approving_usdt' | 'bridging_usdt'): void;
  sleep?(ms: number): Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const ALLOWANCE_POLL_ATTEMPTS = 10;
export const ALLOWANCE_POLL_INTERVAL_MS = 1500;
export const CHAIN_SWITCH_POLL_ATTEMPTS = 10;
export const CHAIN_SWITCH_POLL_INTERVAL_MS = 400;

/** Make sure the wallet is really on `chainId` — some mobile wallets ignore the hint. */
export async function ensureSourceChain(deps: BridgeDeps, chainId: number): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  if (deps.getChainId() === chainId) return;

  deps.onStep?.('switching_network');
  await deps.switchChain(chainId);

  for (let i = 0; i < CHAIN_SWITCH_POLL_ATTEMPTS; i++) {
    if (deps.getChainId() === chainId) return;
    await sleep(CHAIN_SWITCH_POLL_INTERVAL_MS);
  }
  throw new Error(
    'Your wallet is still on the wrong network. Switch it to the source chain manually, then tap bridge again — no funds were sent.',
  );
}

/** Approve (unlimited) and block until the allowance is actually readable on-chain. */
export async function ensureBridgeAllowance(
  deps: BridgeDeps,
  opts: { chainId: number; token: Hex; owner: Hex; spender: Hex; needed: bigint },
): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  const read = () =>
    deps.client
      .readAllowance({ token: opts.token, owner: opts.owner, spender: opts.spender })
      .catch(() => 0n);

  if ((await read()) >= opts.needed) return;

  deps.onStep?.('approving_usdt');
  const hash = await deps.sendApproval({ token: opts.token, spender: opts.spender, chainId: opts.chainId });

  const receipt = await deps.client.waitForReceipt(hash);
  if (receipt.status !== 'success') {
    throw new Error('The token approval transaction failed. No funds were moved — please try the approval again.');
  }

  for (let i = 0; i < ALLOWANCE_POLL_ATTEMPTS; i++) {
    if ((await read()) >= opts.needed) return;
    await sleep(ALLOWANCE_POLL_INTERVAL_MS);
  }
  throw new Error('Approval is not visible on-chain yet. Wait a few seconds and tap bridge again — no funds were sent.');
}

/** Balance + simulation guard: fail with a friendly message instead of signing a doomed tx. */
export async function preflightBridgeDeposit(
  deps: BridgeDeps,
  opts: {
    token: Hex;
    owner: Hex;
    amount: bigint;
    bridge: Hex;
    abi: unknown;
    functionName: string;
    args: unknown[];
    symbol?: string;
  },
): Promise<void> {
  const balance = await deps.client
    .readBalance({ token: opts.token, owner: opts.owner })
    .catch(() => null);
  if (balance !== null && balance < opts.amount) {
    throw new Error(
      `Not enough ${opts.symbol ?? 'USDT'} in your wallet for this bridge. Lower the amount and try again.`,
    );
  }

  try {
    await deps.client.simulateDeposit({
      account: opts.owner,
      bridge: opts.bridge,
      abi: opts.abi,
      functionName: opts.functionName,
      args: opts.args,
    });
  } catch (err: any) {
    const msg = String(err?.shortMessage || err?.details || err?.message || '');
    if (/insufficient funds|gas required|exceeds balance/i.test(msg)) {
      throw new Error('Not enough gas on the source chain to pay for this bridge transaction.');
    }
    throw new Error(
      'The bridge rejected this transfer before sending, so no funds left your wallet. Check the amount (minimum $10), that the destination chain is supported, and try again in a moment.',
    );
  }
}

export interface EvmBridgeRequest {
  chainId: number;
  token: Hex;
  owner: Hex;
  bridge: Hex;
  abi: unknown;
  functionName: string;
  args: unknown[];
  amount: bigint;
  gas: bigint;
  symbol?: string;
}

export interface EvmBridgeResult {
  hash: Hex;
  confirmed: boolean;
}

/** Full ordered pipeline: chain switch → allowance → preflight → deposit → confirmation. */
export async function executeEvmBridgeDeposit(
  deps: BridgeDeps,
  req: EvmBridgeRequest,
): Promise<EvmBridgeResult> {
  await ensureSourceChain(deps, req.chainId);

  await ensureBridgeAllowance(deps, {
    chainId: req.chainId,
    token: req.token,
    owner: req.owner,
    spender: req.bridge,
    needed: req.amount,
  });

  deps.onStep?.('bridging_usdt');
  await preflightBridgeDeposit(deps, {
    token: req.token,
    owner: req.owner,
    amount: req.amount,
    bridge: req.bridge,
    abi: req.abi,
    functionName: req.functionName,
    args: req.args,
    symbol: req.symbol,
  });

  const hash = await deps.sendDeposit({
    bridge: req.bridge,
    abi: req.abi,
    functionName: req.functionName,
    args: req.args,
    chainId: req.chainId,
    gas: req.gas,
  });

  const confirmed = await deps.confirm(hash, req.chainId);
  return { hash, confirmed };
}
