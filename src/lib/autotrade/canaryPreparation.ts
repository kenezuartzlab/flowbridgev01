/** Owner approval is a cap only. This module cannot create orders or authorize effects. */
export const CANARY_APPROVAL = {
  status: "APPROVED_CAP_ONLY",
  capUsdt6: 5_000_000n,
  pair: "CA/BOT",
  cycles: 1,
  approvedAt: "2026-11-28T04:05:00Z",
  gasApproved: false,
  orderAuthorized: false,
  fundingAuthorized: false,
} as const;

export function convertCapToBot(c: { primaryUsdt6PerBot: bigint; secondaryUsdt6PerBot: bigint; fetchedAt: number; now: number; verified: boolean }) {
  if (!c.verified || c.now < c.fetchedAt || c.now - c.fetchedAt > 10_000) throw new Error("CAP_QUOTE_UNVERIFIED");
  if (c.primaryUsdt6PerBot <= 0n || c.secondaryUsdt6PerBot <= 0n) throw new Error("CAP_PRICE_INVALID");
  const high = c.primaryUsdt6PerBot > c.secondaryUsdt6PerBot ? c.primaryUsdt6PerBot : c.secondaryUsdt6PerBot;
  const low = c.primaryUsdt6PerBot < c.secondaryUsdt6PerBot ? c.primaryUsdt6PerBot : c.secondaryUsdt6PerBot;
  if ((high - low) * 10_000n > high * 50n) throw new Error("CAP_PRICE_DIVERGENCE");
  // Round down using the higher valuation: total native trade budget, including router fee.
  return CANARY_APPROVAL.capUsdt6 * 10n ** 18n / high;
}

/** Planning reserve only: buy + exact sell approval + sell + revoke, 2x gas price and 20% gas margin. */
export function estimateCanaryGas(gasPriceWei: bigint, buyGas: bigint, sellGas: bigint) {
  if (gasPriceWei <= 0n || buyGas <= 0n || sellGas <= 0n) throw new Error("GAS_ESTIMATE_INVALID");
  const units = (buyGas + sellGas + 2n * 80_000n) * 120n / 100n;
  return { reserveWei: units * gasPriceWei * 2n, units, approval: "PENDING_OWNER_APPROVAL" as const, simulated: false as const };
}

export interface InfrastructureConfig {
  primaryUrl: string; secondaryUrl: string; primaryOperator: string; secondaryOperator: string;
  independenceReviewed: boolean; comparisonDays: number; mismatches: number; receiptParity: boolean;
}
export function secureServiceUrl(value: string): URL {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.search || u.port && u.port !== "443"
    || !u.hostname.includes(".") || /(?:localhost|\.local$|^\d+\.\d+\.\d+\.\d+$|:)/i.test(u.hostname)) throw new Error("SERVICE_URL_INVALID");
  return u;
}
export function validateIndependentRpc(c: InfrastructureConfig): string[] {
  const errors: string[] = [];
  try {
    const a = secureServiceUrl(c.primaryUrl), b = secureServiceUrl(c.secondaryUrl);
    if (a.hostname === b.hostname) errors.push("RPC_SAME_HOST");
    if ([a.hostname, b.hostname].every(h => h.endsWith("botchain.ai"))) errors.push("RPC_KNOWN_SAME_OPERATOR");
  } catch { errors.push("RPC_URL_INVALID"); }
  if (!c.primaryOperator.trim() || !c.secondaryOperator.trim() || c.primaryOperator.trim().toLowerCase() === c.secondaryOperator.trim().toLowerCase()) errors.push("RPC_SAME_OR_UNKNOWN_OPERATOR");
  if (!c.independenceReviewed) errors.push("RPC_INDEPENDENCE_UNREVIEWED");
  if (!Number.isFinite(c.comparisonDays) || c.comparisonDays < 7 || c.mismatches !== 0 || !c.receiptParity) errors.push("RPC_EVIDENCE_INCOMPLETE");
  return errors;
}