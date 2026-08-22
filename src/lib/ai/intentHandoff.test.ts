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

function recompute(search: string) {
  const hint = parseHandoffHint(search)!;
  const targets = resolveCanonicalTargets(hint.chainId);
  return {
    hint,
    fingerprint: handoffFingerprint({
      type: hint.type,
      chainId: hint.chainId,
      targetContract: targets ? canonicalTargetFor(hint.type as any, targets) : null,
      tokenIn: hint.hints.from ?? hint.hints.token ?? null,
      tokenOut: hint.hints.to ?? null,
      amount: hint.hints.amount ?? null,
      destinationChainId: hint.hints.dest ?? null,
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
    const href = buildHandoff(swapIntent()).href;
    const { hint, fingerprint } = recompute(href.slice(href.indexOf("?")));
    const out = evaluateHandoff({
      hint,
      recomputedFingerprint: fingerprint,
      currentChainId: BOT_TESTNET_CHAIN_ID,
    });
    expect(out.verdict).toBe("FRESH");
    expect(out.mayPrefill).toBe(true);
    expect(out.grantsExecution).toBe(false);
  });

  it("refuses when an economic field is altered in the link", () => {
    const href = buildHandoff(swapIntent("10")).href;
    const tampered = href.replace("amount=10", "amount=250");
    const { hint, fingerprint } = recompute(tampered.slice(tampered.indexOf("?")));
    expect(
      evaluateHandoff({
        hint,
        recomputedFingerprint: fingerprint,
        currentChainId: BOT_TESTNET_CHAIN_ID,
      }).verdict,
    ).toBe("FINGERPRINT_MISMATCH");
  });

  it("refuses a swapped token address", () => {
    const intent = swapIntent();
    const href = buildHandoff(intent).href;
    const p = intent.parameters as Record<string, string>;
    const tampered = href.replace(
      `to=${p.tokenOut}`,
      "to=0x000000000000000000000000000000000000dead",
    );
    const { hint, fingerprint } = recompute(tampered.slice(tampered.indexOf("?")));
    expect(
      evaluateHandoff({
        hint,
        recomputedFingerprint: fingerprint,
        currentChainId: BOT_TESTNET_CHAIN_ID,
      }).verdict,
    ).toBe("FINGERPRINT_MISMATCH");
  });

  it("refuses an expired plan even when untouched", () => {
    const href = buildHandoff(swapIntent()).href;
    const { hint, fingerprint } = recompute(href.slice(href.indexOf("?")));
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
    const href = buildHandoff(swapIntent()).href;
    const { hint, fingerprint } = recompute(href.slice(href.indexOf("?")));
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
