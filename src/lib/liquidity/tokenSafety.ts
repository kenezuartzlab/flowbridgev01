/**
 * Liquidity V1 — token safety. Fail closed: liquidity writes are allowed only
 * for registry-curated tokens with standard accounting, or tokens whose
 * observed transfer delta exactly matched (no fee-on-transfer / rebasing).
 */
export type TokenSafety = { ok: true } | { ok: false; reason: string };

export function checkTokenForLiquidity(t: { address: string; imported?: boolean; curated?: boolean }, verifiedPlain: ReadonlySet<string>): TokenSafety {
  const a = t.address.toLowerCase();
  if (t.curated && !t.imported) return { ok: true };
  if (verifiedPlain.has(a)) return { ok: true };
  return { ok: false, reason: "This token isn't verified for exact accounting (fee-on-transfer, rebasing or restricted transfers can't be ruled out), so liquidity actions are blocked." };
}

/** Exact delta check after any transfer/settlement. */
export function assertExactDelta(expected: bigint, before: bigint, after: bigint, label: string): void {
  const delta = after - before;
  if (delta !== expected) throw new Error(`${label}: balance changed by ${delta}, expected ${expected} — unusual token accounting, stopped`);
}
