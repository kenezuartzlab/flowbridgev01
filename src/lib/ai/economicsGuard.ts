/**
 * V15.3E §2/§4 — canonical runtime truth guard for MUTABLE economics.
 *
 * Fees, fee treasuries and fee nonces are on-chain configuration that can change
 * at any time. Documentation, prose knowledge and model priors are therefore
 * NEVER authoritative for them. This pure module:
 *   1. detects when a question is asking about mutable economics,
 *   2. detects fee claims inside a drafted answer, and
 *   3. contradicts the answer whenever it disagrees with live chain truth, or
 *      whenever it states a fee at all without authoritative evidence.
 */

export interface RuntimeFeeTruth {
  chainId: number;
  /** Router that answered the read (registry-resolved, never model-supplied). */
  contract: string;
  /** Effective swap fee in basis points, as read on chain. */
  globalFeeBps: number;
  maxFeeBps: number | null;
  feeTreasury: string | null;
  /** Bumps on every fee-config change; a plan built on an old nonce is stale. */
  feeConfigNonce: string | null;
  observedAt: string;
  source: "ON_CHAIN";
}

export type FeeTruthResult =
  | { ok: true; truth: RuntimeFeeTruth }
  | { ok: false; reason: string };

/** Questions that touch mutable economics and must be answered from chain state. */
const ECONOMICS_QUESTION_RE =
  /\b(fee|fees|fee\s?config|bps|basis points|cost to swap|how much (?:does|do) (?:it|swaps?) cost|commission|treasury|charge[sd]?)\b/i;

export function mentionsMutableEconomics(question: string): boolean {
  return ECONOMICS_QUESTION_RE.test(question);
}

/** Percent / bps fee claims present in a drafted answer. Returns basis points. */
export function detectFeeClaims(text: string): number[] {
  const claims: number[] = [];
  const pct = /(\d+(?:\.\d+)?)\s?%/g;
  let m: RegExpExecArray | null;
  while ((m = pct.exec(text)) !== null) {
    const bps = Math.round(Number(m[1]) * 100);
    if (Number.isFinite(bps)) claims.push(bps);
  }
  const bpsRe = /(\d+(?:\.\d+)?)\s?(?:bps|basis points)\b/gi;
  while ((m = bpsRe.exec(text)) !== null) {
    const bps = Math.round(Number(m[1]));
    if (Number.isFinite(bps)) claims.push(bps);
  }
  return claims;
}

export function feeBpsToPercent(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(pct === 0 ? 0 : 1) : String(pct)}%`;
}

export interface EconomicsVerification {
  /** True when no contradiction and no unsupported fee claim remained. */
  ok: boolean;
  answer: string;
  contradictions: readonly string[];
}

/**
 * Contradiction verifier. Live chain truth always wins over drafted prose: a
 * disagreeing answer is corrected in place, and a fee stated without on-chain
 * evidence is explicitly marked unverified rather than published as fact.
 */
export function applyEconomicsGuard(input: {
  answer: string;
  truth: RuntimeFeeTruth | null;
  /** Fee-relevant question — an answer may legitimately contain no fee at all. */
  economicsAsked: boolean;
}): EconomicsVerification {
  const claims = detectFeeClaims(input.answer);
  const contradictions: string[] = [];
  let answer = input.answer;

  if (!input.truth) {
    if (claims.length > 0) {
      contradictions.push("fee stated without authoritative on-chain evidence");
      answer = `${answer}\n\nI could not read the live fee configuration from the router for this answer, so treat any fee figure above as unverified — the exact fee is shown on /trade before you sign.`;
    } else if (input.economicsAsked) {
      contradictions.push("fee requested but chain read unavailable");
      answer = `${answer}\n\nI couldn't read the router's live fee configuration this request, so I won't quote a fee number. /trade discloses the exact fee before your wallet confirms.`;
    }
    return { ok: contradictions.length === 0, answer, contradictions };
  }

  const live = input.truth.globalFeeBps;
  const wrong = claims.filter((c) => c !== live);
  if (wrong.length > 0) {
    contradictions.push(
      `stated ${wrong.map((c) => feeBpsToPercent(c)).join(", ")} but live router fee is ${feeBpsToPercent(live)} (${live} bps)`,
    );
    answer = `${answer}\n\nCorrection from live chain state: the FlowBridge router on chain ${input.truth.chainId} currently charges ${feeBpsToPercent(live)} (${live} bps) on swaps, read from its own fee configuration at ${input.truth.observedAt}${
      input.truth.feeConfigNonce ? ` (fee config nonce ${input.truth.feeConfigNonce})` : ""
    }. Ignore any different fee figure above; this configuration is mutable and /trade always shows the exact fee before you sign.`;
  }

  return { ok: contradictions.length === 0, answer, contradictions };
}
