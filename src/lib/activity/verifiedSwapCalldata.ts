/**
 * V8.3 — server-side decoding of the ONE approved FlowBridgeRouterV4 safe
 * entrypoint calldata for verified swap attribution:
 *   swapTokenToNativeSafe(uint256,address,uint24,uint256,uint256,address[],address,uint256,uint256)
 *   selector 0x2411755e
 *
 * Only the exact approved selector is accepted. `swapV2Safe`, `swapV2`,
 * `swapTokenToNative` (legacy), V3-single and native-to-token entrypoints are
 * rejected for this Verified Swap V1 path.
 */
import { decodeFunctionData } from 'viem';
import type { Hex } from './activityIntent';
import { FLOW_BRIDGE_ROUTER_V4_ABI } from '../flowbridge/routerV4Abi';
import type { VerifiedSwapPath } from '../swap/verifiedSwapConfig';

export interface DecodedSafeSwapCalldata {
  selector: Hex;
  functionName: string;
  routerId: bigint;
  /** Explicit token-in argument of the native-output entrypoint. */
  tokenIn: Hex;
  /** V3 pool fee tier — ignored by the BDEX V2 branch (0 on this path). */
  feePool: number;
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
 * Decode the approved `swapTokenToNativeSafe` calldata for the frozen path.
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
  if (args.length !== 9) {
    return { ok: false, reason: 'approved safe swap calldata has an unexpected argument count' };
  }

  const [routerId, tokenIn, feePool, swapAmount, amountOutMin, rawPath, to, deadline, maxProtocolFee] =
    args as [
      bigint,
      string,
      number,
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
      tokenIn: tokenIn.toLowerCase() as Hex,
      feePool: Number(feePool),
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
  if (!eq(calldata.tokenIn, path.tokenIn)) {
    return { ok: false, reason: 'calldata tokenIn is not the approved token-in' };
  }
  if (!eq(calldata.path[0]!, path.tokenIn)) {
    return { ok: false, reason: 'calldata path start is not the approved token-in' };
  }
  // Execution proof: the V2 path must terminate at the trusted wrapped native.
  if (!eq(calldata.path[calldata.path.length - 1]!, path.tokenOut)) {
    return { ok: false, reason: 'calldata path end is not the trusted wrapped-native endpoint' };
  }
  if (calldata.amountOutMin <= 0n) {
    return { ok: false, reason: 'calldata amountOutMin must be present and positive' };
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
