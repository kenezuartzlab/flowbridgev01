// V1.15 preview-only injected-wallet REVIEW DRY-RUN. No transport, calldata, signer or transaction submission.
import { reviewBnbSwap, type QuoteEvidence, type ReviewContext, type ReviewInput, type ReviewReason, type ReviewResult } from './executionReviewPolicy';

export const WALLET_REVIEW_POLICY = 'Preview review only: the user-supplied quote snapshot is not a verified oracle; sandwich loss within the approved floor remains possible. On-chain checks are separate and BNB execution is disabled.';
export const SUPPORTED_DRY_RUN_WALLETS = ['MetaMask', 'TokenPocket', 'Rabby'] as const;
export type DryRunWalletName = typeof SUPPORTED_DRY_RUN_WALLETS[number];
export type Eip1193Request = { method: string; params?: unknown };
export type Eip1193Provider = { request: (request: Eip1193Request) => Promise<unknown> };
export type DryRunQuote = Omit<QuoteEvidence, 'quotedNetOut'> & { quotedGrossOut: bigint };
export type DryRunReason = ReviewReason | 'WALLET_DISCONNECTED' | 'SLIPPAGE_NOT_ACKNOWLEDGED' | 'WALLET_REQUEST_REJECTED';
export type GasDisplay =
  | { status: 'UNAVAILABLE'; label: 'Gas not estimated'; gasUnits: null }
  | { status: 'SIMULATED_ESTIMATE'; label: 'Simulated gas estimate — not a wallet quote'; gasUnits: bigint };

const FORBIDDEN_METHODS = new Set(['eth_sign', 'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'eth_signTransaction', 'eth_sendTransaction', 'eth_sendRawTransaction']);
const hex = (value: number) => `0x${value.toString(16)}`;

/** Simulated EIP-1193 provider for unit/browser acceptance. It has no network and cannot sign or send. */
export function createSimulatedInjectedProvider(options: {
  wallet: DryRunWalletName;
  account?: string;
  chainId?: number;
  blockNumber?: number;
  rejectConnect?: boolean;
}) {
  let connected = false;
  let account = options.account ?? '0x00000000000000000000000000000000000000a1';
  let chainId = options.chainId ?? 56;
  let blockNumber = options.blockNumber ?? 500;
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }: Eip1193Request) {
      calls.push(method);
      if (FORBIDDEN_METHODS.has(method)) throw new Error(`DRY_RUN_FORBIDS_${method}`);
      if (method === 'eth_requestAccounts') {
        if (options.rejectConnect) throw Object.assign(new Error('User rejected the request'), { code: 4001 });
        connected = true;
        return [account];
      }
      if (method === 'eth_accounts') return connected ? [account] : [];
      if (method === 'eth_chainId') return hex(chainId);
      if (method === 'eth_blockNumber') return hex(blockNumber);
      throw new Error(`UNSUPPORTED_DRY_RUN_METHOD_${method}`);
    },
  };
  return {
    provider,
    calls,
    setAccount(next: string) { account = next; },
    setChainId(next: number) { chainId = next; },
    setBlockNumber(next: number) { blockNumber = next; },
    disconnect() { connected = false; },
  };
}

/** Explicit user action is required before eth_requestAccounts; this function never requests a signature. */
export async function connectDryRunWallet(provider: Eip1193Provider) {
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') throw new Error('Wallet returned no account');
  return accounts[0];
}

export type WalletDryRunInput = {
  provider: Eip1193Provider;
  quote: DryRunQuote;
  current: ReviewContext;
  nowSec: number;
  currentBlock: number;
  approvedMinNetOut: bigint | null;
  slippageBps: number;
  slippageAcknowledged: boolean;
  feeBps: 0 | 5 | 10;
  gasUnits?: bigint | null;
};

export async function reviewInjectedWalletDryRun(input: WalletDryRunInput): Promise<{
  mode: 'NON_EXECUTABLE_REVIEW';
  review: ReviewResult;
  reasons: DryRunReason[];
  canSign: false;
  canSubmit: false;
  fee: { bps: number; grossOut: bigint; feeAmount: bigint; netOut: bigint; chosen: false };
  gas: GasDisplay;
  policy: typeof WALLET_REVIEW_POLICY;
}> {
  const feeAmount = input.quote.quotedGrossOut * BigInt(input.feeBps) / 10_000n;
  const netOut = input.quote.quotedGrossOut - feeAmount;
  const reasons: DryRunReason[] = [];
  let accounts: unknown = [];
  let chainHex: unknown = '0x0';
  try {
    [accounts, chainHex] = await Promise.all([
      input.provider.request({ method: 'eth_accounts' }),
      input.provider.request({ method: 'eth_chainId' }),
    ]);
  } catch {
    reasons.push('WALLET_REQUEST_REJECTED');
  }
  const account = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;
  if (!account) reasons.push('WALLET_DISCONNECTED');
  const chainId = typeof chainHex === 'string' && /^0x[0-9a-f]+$/i.test(chainHex) ? Number.parseInt(chainHex, 16) : 0;
  const quote: QuoteEvidence = { ...input.quote, quotedNetOut: netOut };
  const current: ReviewContext = { ...input.current, account: account ?? input.current.account, chainId };
  const reviewInput: ReviewInput = {
    quote, current, nowSec: input.nowSec, currentBlock: input.currentBlock,
    approvedMinNetOut: input.approvedMinNetOut, slippageBps: input.slippageBps,
  };
  const review = reviewBnbSwap(reviewInput);
  reasons.push(...review.reasons);
  if (!input.slippageAcknowledged) reasons.push('SLIPPAGE_NOT_ACKNOWLEDGED');
  const gas: GasDisplay = input.gasUnits == null
    ? { status: 'UNAVAILABLE', label: 'Gas not estimated', gasUnits: null }
    : { status: 'SIMULATED_ESTIMATE', label: 'Simulated gas estimate — not a wallet quote', gasUnits: input.gasUnits };
  return {
    mode: 'NON_EXECUTABLE_REVIEW', review, reasons: [...new Set(reasons)], canSign: false, canSubmit: false,
    fee: { bps: input.feeBps, grossOut: input.quote.quotedGrossOut, feeAmount, netOut, chosen: false }, gas,
    policy: WALLET_REVIEW_POLICY,
  };
}
