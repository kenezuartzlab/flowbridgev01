import { describe, expect, it } from "vitest";
import {
  buildSwapHydration,
  normalizeHydrationAmount,
  resolveHydrationToken,
  hydrationTabFor,
} from "./handoffHydration";
import type { HandoffHint } from "./intentHandoff";

const tokens = [
  { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", symbol: "BOT", isNative: true },
  { address: "0x1111111111111111111111111111111111111111", symbol: "WBOT" },
  { address: "0x2222222222222222222222222222222222222222", symbol: "USDT" },
];

function hint(overrides: Partial<HandoffHint> = {}): HandoffHint {
  return {
    intentId: "intent_1",
    digest: "abcd1234",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    type: "SWAP",
    chainId: 968,
    hints: { tab: "swap", from: "USDT", to: "BOT", amount: "10" },
    ...overrides,
  };
}

describe("V15.3F handoff hydration", () => {
  it("hydrates a 10 USDT → native BOT chain-968 swap intent", () => {
    const res = buildSwapHydration({ hint: hint(), tokens });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan).toMatchObject({
      tokenInSymbol: "USDT",
      tokenOutSymbol: "BOT",
      amount: "10",
      intentId: "intent_1",
    });
  });

  it("resolves tokens by canonical address and the native sentinel", () => {
    expect(resolveHydrationToken("0x2222222222222222222222222222222222222222", tokens)?.symbol).toBe(
      "USDT",
    );
    expect(resolveHydrationToken("0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE", tokens)?.symbol).toBe(
      "BOT",
    );
    expect(resolveHydrationToken("0xdead", tokens)).toBeNull();
  });

  it("refuses to half-fill the form when a token is not in the registry", () => {
    const res = buildSwapHydration({
      hint: hint({ hints: { tab: "swap", from: "USDT", to: "GHOST", amount: "10" } }),
      tokens,
    });
    expect(res).toEqual({ ok: false, reason: "TOKEN_UNRESOLVED" });
  });

  it("never guesses an amount", () => {
    expect(normalizeHydrationAmount("10.5")).toBe("10.5");
    expect(normalizeHydrationAmount("0")).toBeNull();
    expect(normalizeHydrationAmount("1e18")).toBeNull();
    expect(normalizeHydrationAmount(null)).toBeNull();
    const res = buildSwapHydration({
      hint: hint({ hints: { tab: "swap", from: "USDT", to: "BOT" } }),
      tokens,
    });
    expect(res).toEqual({ ok: false, reason: "AMOUNT_INVALID" });
  });

  it("keys hydration per intent+digest so a user edit is never overwritten", () => {
    const a = buildSwapHydration({ hint: hint(), tokens });
    const b = buildSwapHydration({ hint: hint({ digest: "ffff0000" }), tokens });
    expect(a.ok && b.ok && a.plan.key !== b.plan.key).toBe(true);
  });

  it("routes bridge intents away from the swap form", () => {
    expect(hydrationTabFor(hint({ type: "BRIDGE", hints: { tab: "bridge" } }))).toBe("bridge");
    expect(
      buildSwapHydration({ hint: hint({ type: "BRIDGE", hints: { tab: "bridge" } }), tokens }),
    ).toEqual({ ok: false, reason: "NOT_SWAP" });
  });
});
