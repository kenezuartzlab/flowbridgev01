/**
 * FlowBridge BridgeAdapter — Phase 4A ISOLATED execution helper.
 *
 * NOTHING in the app imports this yet. It is deliberately dependency-injected
 * (no wagmi, no viem client construction here) so it can be unit-tested with
 * mocked reads/writes and never touches a public chain from Lovable.
 *
 * Supported: BNB Testnet (97) <-> BOT Testnet (968) active adapter routes only.
 * Not supported: mainnet, Sepolia (beta/inactive), BOT-gas top-ups.
 */
import { isAddress, maxUint256 } from 'viem';
import {
  BRIDGE_ADAPTER_ROUTES,
  isBridgeAdapterTestnetEnabled,
  type BridgeAdapterRoute,
  type Hex,
} from './adapterConfig';
import { mapAdapterPreview, type AdapterPreview, type PreviewSourceTuple } from './adapterPreview';

/** Deadline horizon: 20 minutes past the source chain's latest block timestamp. */
export const ADAPTER_DEADLINE_SECONDS = 20n * 60n;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface AdapterExecutionDeps {
  /** Fresh, non-debounced previewSource read. */
  readPreviewSource: (args: { adapter: Hex; chainId: number; amountWei: bigint }) => Promise<PreviewSourceTuple>;
  /** Latest block timestamp (seconds) on the SOURCE chain. */
  readBlockTimestamp: (args: { chainId: number }) => Promise<bigint>;
  /** ERC-20 allowance owner -> adapter. */
  readAllowance: (args: { token: Hex; owner: Hex; spender: Hex; chainId: number }) => Promise<bigint>;
  /** ERC-20 approve write; must resolve with the tx hash. */
  writeApprove: (args: { token: Hex; spender: Hex; amount: bigint; chainId: number }) => Promise<Hex>;
  /** Wait for a tx receipt; returns logs for event parsing. */
  waitForReceipt: (args: { hash: Hex; chainId: number }) => Promise<{ logs: readonly unknown[] }>;
  /** viem simulateContract for adapter bridge(); must throw when it would revert. */
  simulateBridge: (args: AdapterBridgeCall) => Promise<unknown>;
  /** Real adapter bridge() write; resolves with the tx hash. */
  writeBridge: (args: AdapterBridgeCall) => Promise<Hex>;
  /** Decode BridgeRequested from receipt logs; returns the gatewayNonce. */
  parseBridgeRequested: (logs: readonly unknown[]) => bigint | null;
}

export interface AdapterBridgeCall {
  adapter: Hex;
  chainId: number;
  destinationRecipient: Hex;
  refundRecipient: Hex;
  amount: bigint;
  minRefundableAmount: bigint;
  deadline: bigint;
}

export interface AdapterExecutionInput {
  sourceChainId: number;
  destinationChainId: number;
  /** amount already encoded in SOURCE token decimals */
  amountWei: bigint;
  destinationRecipient: string;
  refundRecipient: string;
  /** override only for tests; defaults to the env feature flag */
  flagEnabled?: boolean;
}

export interface AdapterExecutionResult {
  txHash: Hex;
  gatewayNonce: bigint | null;
  amount: bigint;
  officialFeeAmount: bigint;
  refundableAmount: bigint;
  feeBps: number;
  minRefundableAmount: bigint;
  deadline: bigint;
  sourceChainId: number;
  destinationChainId: number;
  adapterAddress: Hex;
  destinationRecipient: Hex;
  refundRecipient: Hex;
  approvals: Hex[];
  /** Source tx is mined only. Destination delivery is NOT tracked in this phase. */
  sourceConfirmed: true;
  destinationConfirmed: false;
}

export class AdapterExecutionError extends Error {
  constructor(
    public code:
      | 'FLAG_DISABLED'
      | 'ROUTE_UNSUPPORTED'
      | 'WRONG_SOURCE_CHAIN'
      | 'INVALID_AMOUNT'
      | 'INVALID_RECIPIENT'
      | 'INVALID_REFUND_RECIPIENT'
      | 'BRIDGE_PAUSED'
      | 'TOKEN_PAUSED'
      | 'BELOW_MINIMUM'
      | 'ABOVE_MAXIMUM'
      | 'SIMULATION_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'AdapterExecutionError';
  }
}

const isNonZeroAddress = (value: string): boolean =>
  typeof value === 'string' && isAddress(value) && value.toLowerCase() !== ZERO_ADDRESS;

/** Static gate: resolves the route, or throws with a precise reason. */
export function resolveAdapterExecutionRoute(input: AdapterExecutionInput): BridgeAdapterRoute {
  const flagEnabled = input.flagEnabled ?? isBridgeAdapterTestnetEnabled();
  if (!flagEnabled) throw new AdapterExecutionError('FLAG_DISABLED', 'BridgeAdapter testnet flag is disabled.');

  const route = BRIDGE_ADAPTER_ROUTES.find(
    (r) =>
      r.active &&
      r.sourceChainId === input.sourceChainId &&
      r.destinationChainId === input.destinationChainId,
  );
  if (!route) throw new AdapterExecutionError('ROUTE_UNSUPPORTED', 'No active adapter route for this direction.');
  // Redundant but explicit: the connected/source chain must match the route source.
  if (route.sourceChainId !== input.sourceChainId) {
    throw new AdapterExecutionError('WRONG_SOURCE_CHAIN', 'Connected chain is not the route source chain.');
  }
  if (typeof input.amountWei !== 'bigint' || input.amountWei <= 0n) {
    throw new AdapterExecutionError('INVALID_AMOUNT', 'Amount must be greater than zero.');
  }
  if (!isNonZeroAddress(input.destinationRecipient)) {
    throw new AdapterExecutionError('INVALID_RECIPIENT', 'Destination recipient is invalid.');
  }
  if (!isNonZeroAddress(input.refundRecipient)) {
    throw new AdapterExecutionError('INVALID_REFUND_RECIPIENT', 'Refund recipient is invalid.');
  }
  return route;
}

/** Checks live pause flags and USD-agnostic min/max bounds against the amount. */
export function assertPreviewAllowsExecution(preview: AdapterPreview, amountWei: bigint): void {
  if (preview.bridgePaused) throw new AdapterExecutionError('BRIDGE_PAUSED', 'Bridge is paused on-chain.');
  if (preview.tokenPaused) throw new AdapterExecutionError('TOKEN_PAUSED', 'Token is paused on-chain.');
  if (preview.minAmountUsd > 0n && amountWei < preview.minAmountUsd) {
    throw new AdapterExecutionError('BELOW_MINIMUM', 'Amount is below the live minimum.');
  }
  if (preview.maxAmountUsd > 0n && amountWei > preview.maxAmountUsd) {
    throw new AdapterExecutionError('ABOVE_MAXIMUM', 'Amount is above the live maximum.');
  }
}

/**
 * Exact-approval policy. Never requests unlimited allowance; the adapter is
 * always the spender (never the official gateway).
 */
export async function ensureExactAllowance(
  deps: Pick<AdapterExecutionDeps, 'readAllowance' | 'writeApprove' | 'waitForReceipt'>,
  args: { token: Hex; owner: Hex; adapter: Hex; chainId: number; amount: bigint },
): Promise<Hex[]> {
  const { token, owner, adapter, chainId, amount } = args;
  const hashes: Hex[] = [];
  const allowance = await deps.readAllowance({ token, owner, spender: adapter, chainId });

  if (allowance === amount) return hashes;

  if (allowance !== 0n) {
    // Reset stale, non-exact allowance first and wait for confirmation.
    const resetHash = await deps.writeApprove({ token, spender: adapter, amount: 0n, chainId });
    hashes.push(resetHash);
    await deps.waitForReceipt({ hash: resetHash, chainId });
  }

  if (amount === maxUint256) {
    throw new AdapterExecutionError('INVALID_AMOUNT', 'Unlimited approval is not permitted.');
  }
  const approveHash = await deps.writeApprove({ token, spender: adapter, amount, chainId });
  hashes.push(approveHash);
  await deps.waitForReceipt({ hash: approveHash, chainId });
  return hashes;
}

/**
 * Full Phase 4A execution sequence. Isolated: no UI, no status tracking.
 */
export async function executeAdapterBridge(
  deps: AdapterExecutionDeps,
  input: AdapterExecutionInput & { owner: string },
): Promise<AdapterExecutionResult> {
  const route = resolveAdapterExecutionRoute(input);
  const destinationRecipient = input.destinationRecipient as Hex;
  const refundRecipient = input.refundRecipient as Hex;
  const owner = input.owner as Hex;
  const amount = input.amountWei;

  // 2/3. Fresh preview immediately before execution (never the debounced UI one).
  const tuple = await deps.readPreviewSource({
    adapter: route.adapter,
    chainId: route.sourceChainId,
    amountWei: amount,
  });
  const preview = mapAdapterPreview(tuple, route.sourceDecimals);
  assertPreviewAllowsExecution(preview, amount);

  // 4. Execution bound comes from the fresh preview.
  const minRefundableAmount = preview.refundableAmount;

  // 5. Deadline from the source chain block timestamp.
  const blockTimestamp = await deps.readBlockTimestamp({ chainId: route.sourceChainId });
  const deadline = blockTimestamp + ADAPTER_DEADLINE_SECONDS;

  // 6. Exact ERC-20 approval, adapter as spender.
  const approvals = await ensureExactAllowance(deps, {
    token: route.sourceToken,
    owner,
    adapter: route.adapter,
    chainId: route.sourceChainId,
    amount,
  });

  const call: AdapterBridgeCall = {
    adapter: route.adapter,
    chainId: route.sourceChainId,
    destinationRecipient,
    refundRecipient,
    amount,
    minRefundableAmount,
    deadline,
  };

  // 7. Simulate before writing.
  try {
    await deps.simulateBridge(call);
  } catch (err) {
    throw new AdapterExecutionError(
      'SIMULATION_FAILED',
      `Adapter bridge simulation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 8/9. Write, then wait for the SOURCE receipt only.
  const txHash = await deps.writeBridge(call);
  const receipt = await deps.waitForReceipt({ hash: txHash, chainId: route.sourceChainId });
  const gatewayNonce = deps.parseBridgeRequested(receipt.logs ?? []);

  return {
    txHash,
    gatewayNonce,
    amount,
    officialFeeAmount: preview.officialFeeAmount,
    refundableAmount: preview.refundableAmount,
    feeBps: preview.feeBps,
    minRefundableAmount,
    deadline,
    sourceChainId: route.sourceChainId,
    destinationChainId: route.destinationChainId,
    adapterAddress: route.adapter,
    destinationRecipient,
    refundRecipient,
    approvals,
    sourceConfirmed: true,
    destinationConfirmed: false,
  };
}
