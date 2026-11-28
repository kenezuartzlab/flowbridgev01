// Shared, transport-free route policy for manual Swap and AutoTrade.
// A quote-only candidate is diagnostic data, never an executable SwapStep or order fill.
export const EXTERNAL_DIRECTIONAL_FEE_CAP_BPS = 500 as const; // 5%; excludes the observed 73% CaSwap sell fee.

export const CA_WBOT_BDEX_V3_POOL = "0x822dc160CC971510Cf87999004a28b4A7aEFD082" as const;
export const CA_WBOT_CASWAP_POOL = "0xf728515430E588EEc584b76E8f2C814871c609B3" as const;
export const ALTERNATIVE_CASWAP_ROUTER = "0xe3c1bCEF83C23331593f38B85e16Cf172C022737" as const;
export const ALTERNATIVE_CASWAP_FACTORY = "0xD9a990Ceff16CBCc9dC0CD669fC29CDf53759E41" as const;
export const CA_WBOT = "0x68CAeA9104419203cF8b8f0B222E75709B97bfc6" as const;
export const OLD_CASWAP_ROUTER = "0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD" as const;

export type RouteExecutionClass = "REGISTERED_EXECUTABLE" | "QUOTE_ONLY";
export type RouteRejection =
  | "UNREGISTERED_ROUTE"
  | "IDENTITY_UNVERIFIED"
  | "WRAPPER_MISMATCH"
  | "FEE_UNVERIFIED"
  | "MUTABLE_FEE"
  | "EXTERNAL_FEE_CAP"
  | "LIQUIDITY_UNVERIFIED"
  | "APPROVAL_UNVERIFIED"
  | "EMPTY_QUOTE"
  | "GAS_EXCEEDS_OUTPUT";

export interface ComparedRoute {
  key: string;
  venue: string;
  executionClass: RouteExecutionClass;
  routerId: number | null;
  router: string;
  factory: string;
  pool: string;
  wrappedNative: string;
  caller: string;
  path: string[];
  amountIn: bigint;
  amountOut: bigint;
  gasUnits: bigint;
  gasPriceWei: bigint;
  /** Gas converted to the output token only when a same-unit quote exists. */
  gasCostInOutput: bigint | null;
  priceImpactBps: number;
  externalDirectionalFeeBps: number | null;
  feeMutable: boolean;
  registered: boolean;
  identityVerified: boolean;
  wrapperVerified: boolean;
  feeVerified: boolean;
  liquidityVerified: boolean;
  approvalVerified: boolean;
  block: number;
  rejections: RouteRejection[];
}

export function evaluateRouteGates(route: ComparedRoute): ComparedRoute {
  const reasons = new Set<RouteRejection>(route.rejections);
  if (!route.registered) reasons.add("UNREGISTERED_ROUTE");
  if (!route.identityVerified) reasons.add("IDENTITY_UNVERIFIED");
  if (!route.wrapperVerified) reasons.add("WRAPPER_MISMATCH");
  if (!route.feeVerified || route.externalDirectionalFeeBps === null) reasons.add("FEE_UNVERIFIED");
  if (route.feeMutable) reasons.add("MUTABLE_FEE");
  if ((route.externalDirectionalFeeBps ?? 10001) > EXTERNAL_DIRECTIONAL_FEE_CAP_BPS) reasons.add("EXTERNAL_FEE_CAP");
  if (!route.liquidityVerified) reasons.add("LIQUIDITY_UNVERIFIED");
  if (!route.approvalVerified) reasons.add("APPROVAL_UNVERIFIED");
  if (route.amountOut <= 0n) reasons.add("EMPTY_QUOTE");
  if (route.gasCostInOutput !== null && route.gasCostInOutput >= route.amountOut) reasons.add("GAS_EXCEEDS_OUTPUT");
  return { ...route, rejections: [...reasons].sort() };
}

export function netRouteOutput(route: ComparedRoute): bigint {
  return route.amountOut - (route.gasCostInOutput ?? 0n);
}

export function routeExecutable(route: ComparedRoute): boolean {
  return route.executionClass === "REGISTERED_EXECUTABLE" && route.rejections.length === 0 && netRouteOutput(route) > 0n;
}

/** Pick each leg independently. Quote-only routes can never win, even with a larger gross quote. */
export function selectBestExecutableRoute(routes: ComparedRoute[]): ComparedRoute | null {
  const eligible = routes.map(evaluateRouteGates).filter(routeExecutable);
  eligible.sort((a, b) => {
    const an = netRouteOutput(a), bn = netRouteOutput(b);
    if (an !== bn) return bn > an ? 1 : -1;
    const ag = a.gasUnits * a.gasPriceWei, bg = b.gasUnits * b.gasPriceWei;
    if (ag !== bg) return ag > bg ? 1 : -1;
    if (a.priceImpactBps !== b.priceImpactBps) return a.priceImpactBps - b.priceImpactBps;
    return a.key.localeCompare(b.key);
  });
  return eligible[0] ?? null;
}

export function assertRouteExecutable(route: ComparedRoute): ComparedRoute {
  const evaluated = evaluateRouteGates(route);
  if (!routeExecutable(evaluated)) throw new Error(`ROUTE_NOT_EXECUTABLE:${evaluated.rejections.join(",") || evaluated.executionClass}`);
  return evaluated;
}

/** Bind quote review, paper planning and calldata to the exact selected path and caller. */
export function routeFingerprint(route: Pick<ComparedRoute, "routerId" | "router" | "pool" | "wrappedNative" | "caller" | "path" | "amountIn" | "amountOut" | "block">): string {
  return [
    route.routerId ?? "quote-only", route.router.toLowerCase(), route.pool.toLowerCase(),
    route.wrappedNative.toLowerCase(), route.caller.toLowerCase(), route.path.map((a) => a.toLowerCase()).join(">"),
    route.amountIn.toString(), route.amountOut.toString(), route.block,
  ].join(":");
}
