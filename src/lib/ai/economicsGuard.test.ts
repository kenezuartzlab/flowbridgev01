import { describe, expect, it } from "vitest";
import {
  applyEconomicsGuard,
  detectFeeClaims,
  mentionsMutableEconomics,
  type RuntimeFeeTruth,
} from "./economicsGuard";

const truth = (bps: number): RuntimeFeeTruth => ({
  chainId: 968,
  contract: "0xecd8041a0ad94992a735a5d8aeb40d3e8b4d089a",
  globalFeeBps: bps,
  maxFeeBps: 100,
  feeTreasury: "0x0000000000000000000000000000000000000001",
  feeConfigNonce: "3",
  observedAt: "2026-08-10T00:00:00.000Z",
  source: "ON_CHAIN",
});

describe("V15.3E economics guard", () => {
  it("detects fee questions", () => {
    expect(mentionsMutableEconomics("what fee do swaps pay?")).toBe(true);
    expect(mentionsMutableEconomics("what's live on BOT Chain?")).toBe(false);
  });

  it("reads percent and bps claims out of a draft", () => {
    expect(detectFeeClaims("a 0.1% platform fee")).toContain(10);
    expect(detectFeeClaims("30 bps today")).toContain(30);
  });

  it("contradicts a stale documented fee with live chain truth", () => {
    const out = applyEconomicsGuard({
      answer: "FlowBridge charges a 0.1% platform fee on swaps.",
      truth: truth(0),
      economicsAsked: true,
    });
    expect(out.ok).toBe(false);
    expect(out.contradictions[0]).toMatch(/live router fee is 0%/);
    expect(out.answer).toMatch(/Correction from live chain state/);
    expect(out.answer).toMatch(/fee config nonce 3/);
  });

  it("accepts an answer that matches live chain truth", () => {
    const out = applyEconomicsGuard({
      answer: "The router currently charges 0.1% on swaps.",
      truth: truth(10),
      economicsAsked: true,
    });
    expect(out.ok).toBe(true);
    expect(out.answer).not.toMatch(/Correction/);
  });

  it("marks any fee number unverified when the chain read failed", () => {
    const out = applyEconomicsGuard({
      answer: "The fee is 0.1%.",
      truth: null,
      economicsAsked: true,
    });
    expect(out.ok).toBe(false);
    expect(out.answer).toMatch(/unverified/);
  });

  it("refuses to quote a fee at all when asked and the read failed", () => {
    const out = applyEconomicsGuard({
      answer: "Swaps route through FlowBridgeRouter.",
      truth: null,
      economicsAsked: true,
    });
    expect(out.answer).toMatch(/won't quote a fee number/);
  });
});
