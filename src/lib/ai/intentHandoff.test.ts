import { describe, expect, it } from "vitest";
import {
  evaluateHandoff,
  fingerprintDigest,
  handoffFingerprint,
  parseHandoffHint,
} from "./intentHandoff";
import {
  buildHandoff,
  createActionIntent,
  resolveCanonicalTargets,
  canonicalTargetFor,
  BOT_TESTNET_CHAIN_ID,
} from "./actionIntent";

const WALLET = "0x3d8a7fa490f9db09dd8006b74688213ace9c0164";

function swapIntent(amount = "10") {
  const targets = resolveCanonicalTargets(BOT_TESTNET_CHAIN_ID)!;
  const [usdt, ca] = Object.keys(targets.knownTokens);
  return createActionIntent({
    id: "intent-v153-canary-0001",
    type: "SWAP",
    actorUserId: "user-1",
    actorWallet: WALLET,
    chainId: BOT_TESTNET_CHAIN_ID,
    targetContract: canonicalTargetFor("SWAP", targets),
    parameters: {
      tokenIn: usdt,
      tokenOut: ca,
      decimalsIn: targets.knownTokens[usdt],
      decimalsOut: targets.knownTokens[ca],
      amountIn: amount,
      slippageBps: 50,
      recipient: WALLET,
    },
  });
}

/**
 * V15.3J — the link is now OPAQUE, so the fingerprint is recomputed from the
 * SERVER-side intent parameters, not from query-string text. `intent` stands in
 * for the canonical snapshot Trade resolves by id.
 */
function recompute(search: string, intent?: ReturnType<typeof swapIntent>) {
  const hint = parseHandoffHint(search)!;
  const p = (intent?.parameters ?? {}) as Record<string, any>;
  const targets = resolveCanonicalTargets(hint.chainId);
  return {
    hint,
    fingerprint: handoffFingerprint({
      type: intent?.type ?? hint.type,
      chainId: intent?.chainId ?? hint.chainId,
      targetContract: intent
        ? intent.targetContract
        : targets
          ? canonicalTargetFor(hint.type as any, targets)
          : null,
      tokenIn: p.tokenIn ?? p.token ?? null,
      tokenOut: p.tokenOut ?? null,
      amount: p.amountIn ?? null,
      destinationChainId: p.destinationChainId ?? null,
    }),
  };
}

describe("V15.3 handoff freshness", () => {
  it("carries intent id, digest, expiry and chain in the deep link", () => {
    const href = buildHandoff(swapIntent()).href;
    const hint = parseHandoffHint(href.slice(href.indexOf("?")))!;
    expect(hint.intentId).toBe("intent-v153-canary-0001");
    expect(hint.digest).toHaveLength(8);
    expect(hint.chainId).toBe(BOT_TESTNET_CHAIN_ID);
    expect(hint.type).toBe("SWAP");
  });

  it("accepts an untouched, unexpired handoff and still grants no execution", () => {
    const intent = swapIntent();
    const href = buildHandoff(intent).href;
    const { hint, fingerprint } = recompute(href.slice(href.indexOf("?")), intent);
    const out = evaluateHandoff({
      hint,
      recomputedFingerprint: fingerprint,
      currentChainId: BOT_TESTNET_CHAIN_ID,
    });
    expect(out.verdict).toBe("FRESH");
    expect(out.mayPrefill).toBe(true);
    expect(out.grantsExecution).toBe(false);
  });

  it("refuses when the link digest does not match the prepared plan", () => {
    const intent = swapIntent("10");
    const href = buildHandoff(intent).href;
    // The economic values no longer live in the URL, so tampering can only touch
    // the integrity digest — which the freshness check still rejects.
    const tampered = href.replace(/fp=[^&]+/, "fp=deadbeef");
    const { hint, fingerprint } = recompute(tampered.slice(tampered.indexOf("?")), intent);
    expect(
      evaluateHandoff({
        hint,
        recomputedFingerprint: fingerprint,
        currentChainId: BOT_TESTNET_CHAIN_ID,
      }).verdict,
    ).toBe("FINGERPRINT_MISMATCH");
  });

  it("refuses when the stored plan differs from the digest the link carries", () => {
    const intent = swapIntent();
    const href = buildHandoff(intent).href;
    // Same link, different server-side plan: the recomputed fingerprint wins.
    const other = swapIntent("250");
    const { hint, fingerprint } = recompute(href.slice(href.indexOf("?")), other);
    expect(
      evaluateHandoff({
        hint,
        recomputedFingerprint: fingerprint,
        currentChainId: BOT_TESTNET_CHAIN_ID,
      }).verdict,
    ).toBe("FINGERPRINT_MISMATCH");
  });

  it("refuses an expired plan even when untouched", () => {
    const intent = swapIntent();
    const href = buildHandoff(intent).href;
    const { hint, fingerprint } = recompute(href.slice(href.indexOf("?")), intent);
    const out = evaluateHandoff({
      hint,
      recomputedFingerprint: fingerprint,
      currentChainId: BOT_TESTNET_CHAIN_ID,
      now: new Date(Date.now() + 120_000),
    });
    expect(out.verdict).toBe("EXPIRED");
    expect(out.mayPrefill).toBe(false);
  });

  it("refuses a plan opened on another network", () => {
    const intent = swapIntent();
    const href = buildHandoff(intent).href;
    const { hint, fingerprint } = recompute(href.slice(href.indexOf("?")), intent);
    expect(
      evaluateHandoff({ hint, recomputedFingerprint: fingerprint, currentChainId: 56 }).verdict,
    ).toBe("CHAIN_MISMATCH");
  });

  it("ignores links without correlation metadata", () => {
    const { hint, fingerprint } = recompute("?intent=abc&amount=10");
    expect(
      evaluateHandoff({
        hint,
        recomputedFingerprint: fingerprint,
        currentChainId: BOT_TESTNET_CHAIN_ID,
      }).verdict,
    ).toBe("MALFORMED");
  });

  it("digest is deterministic and change-sensitive", () => {
    const a = handoffFingerprint({ type: "SWAP", chainId: 968, targetContract: "0xr", amount: "10" });
    const b = handoffFingerprint({ type: "SWAP", chainId: 968, targetContract: "0xr", amount: "11" });
    expect(fingerprintDigest(a)).toBe(fingerprintDigest(a));
    expect(fingerprintDigest(a)).not.toBe(fingerprintDigest(b));
  });
});
