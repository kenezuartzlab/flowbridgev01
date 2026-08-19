/**
 * V8.1 — server-side decoding of the ONE approved FlowBridgeRouterV4 safe
 * entrypoint calldata for verified swap attribution.
 *
 * Only the exact approved selector is accepted. Legacy V3-compatible
 * entrypoints (`swapV2`, `swapV3Single`, …) are rejected for verified-swap
 * rewards even though they can execute on chain, because they carry no
 * user-bound `maxProtocolFee`.
 */
import { decodeFunctionData } from 'viem';
import type { Hex } from './activityIntent';
import { FLOW_BRIDGE_ROUTER_V4_ABI } from '../flowbridge/routerV4Abi';
import type { VerifiedSwapPath } from '../swap/verifiedSwapConfig';

export interface DecodedSafeSwapCalldata {
  selector: Hex;
  functionName: string;
  routerId: bigint;
  swapAmount: bigint;
  amountOutMin: bigint;
  path: readonly Hex[];
  to: Hex;
  deadline: bigint;
  maxProtocolFee: bigint;
}

export type SafeSwapCalldataDecode =
  | { ok: true; calldata: DecodedSafeSwapCalldata }
  | { ok: false; reason: string };

const selectorOf = (input: string): Hex => input.slice(0, 10).toLowerCase() as Hex;

/**
 * Decode the approved `swapV2Safe` calldata for the given frozen path.
 * Deterministic: a non-matching selector or a non-decodable body fails closed.
 */
export function decodeApprovedSafeSwapCalldata(
  input: string,
  path: VerifiedSwapPath,
): SafeSwapCalldataDecode {
  if (typeof input !== 'string' || !input.startsWith('0x') || input.length < 10) {
    return { ok: false, reason: 'source transaction calldata is missing or malformed' };
  }
  const selector = selectorOf(input);
  if (selector !== path.safeSelector.toLowerCase()) {
    return {
      ok: false,
      reason: `transaction did not call the approved verified-swap entrypoint ${path.safeFunctionName}`,
    };
  }

  let decoded: { functionName: string; args?: readonly unknown[] };
  try {
    decoded = decodeFunctionData({
      abi: FLOW_BRIDGE_ROUTER_V4_ABI,
      data: input as Hex,
    }) as { functionName: string; args?: readonly unknown[] };
  } catch {
    return { ok: false, reason: 'approved safe swap calldata could not be decoded' };
  }
  if (decoded.functionName !== path.safeFunctionName) {
    return { ok: false, reason: 'decoded function is not the approved verified-swap entrypoint' };
  }
  const args = decoded.args ?? [];
  if (args.length !== 7) {
    return { ok: false, reason: 'approved safe swap calldata has an unexpected argument count' };
  }

  const [routerId, swapAmount, amountOutMin, rawPath, to, deadline, maxProtocolFee] = args as [
    bigint,
    bigint,
    bigint,
    readonly string[],
    string,
    bigint,
    bigint,
  ];
  if (!Array.isArray(rawPath) || rawPath.length < 2) {
    return { ok: false, reason: 'approved safe swap calldata path is too short' };
  }

  return {
    ok: true,
    calldata: {
      selector,
      functionName: decoded.functionName,
      routerId,
      swapAmount,
      amountOutMin,
      path: rawPath.map((a) => a.toLowerCase() as Hex),
      to: to.toLowerCase() as Hex,
      deadline,
      maxProtocolFee,
    },
  };
}

export interface CalldataExpectations {
  path: VerifiedSwapPath;
  /** Signed intent amount (base units of token-in). */
  amount: bigint;
  /** Approved recipient (single-wallet path: the signer). */
  recipient: Hex;
  /** Signed intent deadline (unix seconds). */
  deadline: bigint;
}

/** Validate every relevant decoded calldata field against trusted config. */
export function validateApprovedSafeSwapCalldata(
  calldata: DecodedSafeSwapCalldata,
  expected: CalldataExpectations,
): { ok: true } | { ok: false; reason: string } {
  const { path } = expected;
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (calldata.routerId !== path.routerId) {
    return { ok: false, reason: 'calldata routerId is not the approved verified-swap routerId' };
  }
  if (!eq(calldata.path[0]!, path.tokenIn)) {
    return { ok: false, reason: 'calldata path start is not the approved token-in' };
  }
  if (!eq(calldata.path[calldata.path.length - 1]!, path.tokenOut)) {
    return { ok: false, reason: 'calldata path end is not the approved token-out' };
  }
  if (calldata.swapAmount !== expected.amount) {
    return { ok: false, reason: 'calldata swapAmount does not equal the signed intent amount' };
  }
  if (!eq(calldata.to, expected.recipient)) {
    return { ok: false, reason: 'calldata recipient does not equal the signed intent recipient' };
  }
  if (calldata.deadline > expected.deadline) {
    return { ok: false, reason: 'calldata deadline exceeds the signed intent deadline' };
  }
  return { ok: true };
}
