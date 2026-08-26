/**
 * V8-R Final Correction — swap method selection policy (fail-closed).
 *
 * On a canonical Router V4 target the hardened `*Safe` entry points, which bind
 * `maxProtocolFee` to a value the user's client actually read, are the ONLY
 * acceptable swap methods. If `computeRouterFee` / `getFeeConfig` cannot be read
 * we FAIL CLOSED before any approval or write — we never silently downgrade to a
 * legacy V3-compatible call, because that would drop the fee bound.
 *
 * A legacy V3-compatible call is selectable ONLY on an explicitly legacy
 * execution target (`routerVersion === 'v3-legacy'`), never as a fallback for an
 * explicitly resolved V4 route.
 */
import type { FlowBridgeExecutionTarget } from './executionRegistry';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';

export type SwapMethodMode =
  | { mode: 'safe' }
  | { mode: 'legacy' }
  | { mode: 'fail-closed'; reason: string };

export class FlowBridgeFeeReadUnavailableError extends Error {
  readonly chainId: number;
  constructor(chainId: number) {
    super(
      'Protocol fee could not be read from FlowBridgeRouter V4, so this swap was not submitted. ' +
        'This is a safety stop — no approval or transaction was sent. Please retry in a moment.',
    );
    this.name = 'FlowBridgeFeeReadUnavailableError';
    this.chainId = chainId;
  }
}

export function resolveSwapMethodMode(args: {
  target: Pick<FlowBridgeExecutionTarget, 'chainId' | 'routerVersion' | 'supportsSafeSwaps'>;
  feeKnown: boolean;
}): SwapMethodMode {
  const { target, feeKnown } = args;
  if (target.routerVersion === 'v4') {
    if (!target.supportsSafeSwaps) {
      return {
        mode: 'fail-closed',
        reason: `Router V4 target on chain ${target.chainId} does not expose fee-bound safe swaps`,
      };
    }
    if (!feeKnown) {
      return {
        mode: 'fail-closed',
        reason: `protocol fee read failed on chain ${target.chainId}`,
      };
    }
    return { mode: 'safe' };
  }
  // V30.1B.1: the size-safe mainnet Router candidate has no legacy swap
  // wrappers at all, so a legacy call on BOT Mainnet can never succeed.
  if (target.chainId === BOT_MAINNET_CHAIN_ID) {
    return {
      mode: 'fail-closed',
      reason: `legacy swap calls do not exist on the BOT Mainnet Router candidate (chain ${target.chainId})`,
    };
  }
  // Explicitly legacy target: legacy-compatible calls are intentionally supported.
  return { mode: 'legacy' };
}

/** Throws on fail-closed; returns true when the hardened `*Safe` calls must be used. */
export function requireSafeSwapDecision(args: {
  target: Pick<FlowBridgeExecutionTarget, 'chainId' | 'routerVersion' | 'supportsSafeSwaps'>;
  feeKnown: boolean;
}): boolean {
  const decision = resolveSwapMethodMode(args);
  if (decision.mode === 'fail-closed') {
    throw new FlowBridgeFeeReadUnavailableError(args.target.chainId);
  }
  return decision.mode === 'safe';
}
