/**
 * FlowBridge BridgeAdapter — Phase 3 READ-ONLY preview core.
 *
 * Pure, dependency-injected: no wallet, no writes, no viem client here. The
 * caller supplies a `readPreviewSource` function (see `useAdapterPreview`).
 *
 * Guarantees enforced by this module (and covered by adapterPreview.test.ts):
 *  - feature flag OFF            → no request is ever produced
 *  - mainnet mode                → no request
 *  - direction other than BNB↔BOT→ no request
 *  - invalid / zero amount       → no request
 *  - inactive/unknown route      → no request
 */
import { formatUnits, parseUnits } from 'viem';
import {
  findBridgeAdapterRoute,
  isBridgeAdapterTestnetEnabled,
  ADAPTER_CHAIN_IDS,
  type BridgeAdapterRoute,
  type Hex,
} from './adapterConfig';

/** Directions the adapter preview supports in Phase 3. */
export type AdapterPreviewDirection = 'BNB_TO_BOT' | 'BOT_TO_BNB';

export interface AdapterPreviewRequest {
  route: BridgeAdapterRoute;
  adapter: Hex;
  chainId: number;
  /** amount encoded in SOURCE token decimals */
  amountWei: bigint;
  /** normalized amount string used as the cache/staleness key */
  amount: string;
}

/** Raw previewSource() tuple, in contract order. */
export type PreviewSourceTuple = readonly [
  bigint, // officialFeeAmount
  bigint, // refundableAmount
  bigint, // feeBps
  bigint, // minFeeUnits
  bigint, // minAmountUsd
  bigint, // maxAmountUsd
  boolean, // bridgePaused
  boolean, // tokenPaused
];

export interface AdapterPreview {
  officialFeeAmount: bigint;
  refundableAmount: bigint;
  feeBps: number;
  minFeeUnits: bigint;
  minAmountUsd: bigint;
  maxAmountUsd: bigint;
  bridgePaused: boolean;
  tokenPaused: boolean;
  /** Human-readable, source-token decimals applied. */
  officialFeeFormatted: string;
  refundableFormatted: string;
  feeRatePercent: string;
  minAmountUsdFormatted: string;
  maxAmountUsdFormatted: string;
  routeUnavailable: boolean;
}

/**
 * Returns a request descriptor when — and only when — every Phase 3 gate
 * passes. Returns null otherwise (meaning: perform NO RPC call).
 */
export function resolveAdapterPreviewRequest(args: {
  isMainnet: boolean;
  bridgeDirection: string;
  amount: string;
  /** override only for tests; defaults to the Phase 2 env flag */
  flagEnabled?: boolean;
}): AdapterPreviewRequest | null {
  const flagEnabled = args.flagEnabled ?? isBridgeAdapterTestnetEnabled();
  if (!flagEnabled) return null;
  if (args.isMainnet) return null;
  if (args.bridgeDirection !== 'BNB_TO_BOT' && args.bridgeDirection !== 'BOT_TO_BNB') return null;

  const amount = (args.amount ?? '').trim();
  if (!amount) return null;
  const num = Number(amount);
  if (!isFinite(num) || num <= 0) return null;

  const source =
    args.bridgeDirection === 'BNB_TO_BOT' ? ADAPTER_CHAIN_IDS.bnbTestnet : ADAPTER_CHAIN_IDS.botTestnet;
  const destination =
    args.bridgeDirection === 'BNB_TO_BOT' ? ADAPTER_CHAIN_IDS.botTestnet : ADAPTER_CHAIN_IDS.bnbTestnet;

  const route = findBridgeAdapterRoute(source, destination);
  if (!route || !route.active) return null;

  let amountWei: bigint;
  try {
    amountWei = parseUnits(amount, route.sourceDecimals);
  } catch {
    return null;
  }
  if (amountWei <= 0n) return null;

  return { route, adapter: route.adapter, chainId: route.sourceChainId, amountWei, amount };
}

/**
 * USD bounds come back as plain integers on some deployments and scaled by
 * 1e6 / 1e18 on others. Pick the smallest scale that yields a plausible USD
 * figure (<= 1,000,000) so the displayed min/max is never absurd.
 */
export function formatUsdBound(raw: bigint): string {
  if (raw === 0n) return '0';
  for (const dp of [0, 6, 18]) {
    const value = Number(formatUnits(raw, dp));
    if (isFinite(value) && value > 0 && value <= 1_000_000) {
      return String(Number(value.toFixed(2)));
    }
  }
  return String(Number(formatUnits(raw, 18)));
}

/** Maps the raw tuple into display-ready values using source token decimals. */
export function mapAdapterPreview(tuple: PreviewSourceTuple, sourceDecimals: number): AdapterPreview {
  const [
    officialFeeAmount,
    refundableAmount,
    feeBps,
    minFeeUnits,
    minAmountUsd,
    maxAmountUsd,
    bridgePaused,
    tokenPaused,
  ] = tuple;

  return {
    officialFeeAmount,
    refundableAmount,
    feeBps: Number(feeBps),
    minFeeUnits,
    minAmountUsd,
    maxAmountUsd,
    bridgePaused,
    tokenPaused,
    officialFeeFormatted: formatUnits(officialFeeAmount, sourceDecimals),
    refundableFormatted: formatUnits(refundableAmount, sourceDecimals),
    feeRatePercent: `${Number(feeBps) / 100}%`,
    minAmountUsdFormatted: formatUsdBound(minAmountUsd),
    maxAmountUsdFormatted: formatUsdBound(maxAmountUsd),
    routeUnavailable: bridgePaused || tokenPaused,
  };
}

export type ReadPreviewSource = (args: {
  adapter: Hex;
  chainId: number;
  amountWei: bigint;
}) => Promise<PreviewSourceTuple>;

/**
 * Read-only fetch. Never throws: preview failures must not block the bridge
 * UI in Phase 3, so errors are returned instead.
 */
export async function fetchAdapterPreview(
  read: ReadPreviewSource,
  request: AdapterPreviewRequest,
): Promise<{ preview: AdapterPreview | null; error: string | null }> {
  try {
    const tuple = await read({
      adapter: request.adapter,
      chainId: request.chainId,
      amountWei: request.amountWei,
    });
    return { preview: mapAdapterPreview(tuple, request.route.sourceDecimals), error: null };
  } catch (err) {
    return { preview: null, error: err instanceof Error ? err.message : String(err) };
  }
}
