import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetTradeSessionForTests,
  applyDefaultTradeTab,
  applyExplicitTradeTab,
  clearSwapDraft,
  getTradeSession,
  readSwapDraft,
  setSwapDraft,
  setTradeTab,
} from "./tradeSession";

describe("V15.3G trade session continuity", () => {
  beforeEach(() => __resetTradeSessionForTests());

  it("keeps a user-chosen tab across simulated remounts", () => {
    setTradeTab("CA/BOT");
    // A remount re-runs the route-progress default; it must not win.
    expect(applyDefaultTradeTab("BRIDGE")).toBe(false);
    expect(getTradeSession().tab).toBe("CA/BOT");
  });

  it("applies the route-progress default only once per runtime", () => {
    expect(applyDefaultTradeTab("BRIDGE")).toBe(true);
    expect(applyDefaultTradeTab("CA/BOT")).toBe(false);
    expect(getTradeSession().tab).toBe("BRIDGE");
  });

  it("applies a deep-link tab hint at most once per hint key", () => {
    expect(
      applyExplicitTradeTab({ tab: "BRIDGE", hintKey: "campaign:x", source: "ROUTE" }),
    ).toBe(true);
    setTradeTab("BOT/USDT");
    expect(
      applyExplicitTradeTab({ tab: "BRIDGE", hintKey: "campaign:x", source: "ROUTE" }),
    ).toBe(false);
    expect(getTradeSession().tab).toBe("BOT/USDT");
  });

  it("restores the swap draft only for the network being rendered", () => {
    setSwapDraft({
      chainScope: "TESTNET",
      tokenInSymbol: "BOT",
      tokenOutSymbol: "USDT",
      amount: "12.5",
    });
    expect(readSwapDraft("TESTNET")?.amount).toBe("12.5");
    expect(readSwapDraft("MAINNET")).toBeNull();
  });

  it("clears the draft on request", () => {
    setSwapDraft({
      chainScope: "MAINNET",
      tokenInSymbol: "BOT",
      tokenOutSymbol: "CA",
      amount: "1",
    });
    clearSwapDraft();
    expect(getTradeSession().swapDraft).toBeNull();
  });

  it("does not emit a commit for an identical draft write", () => {
    const draft = {
      chainScope: "TESTNET" as const,
      tokenInSymbol: "BOT",
      tokenOutSymbol: "USDT",
      amount: "3",
    };
    setSwapDraft(draft);
    const at = getTradeSession().changedAt;
    setSwapDraft(draft);
    expect(getTradeSession().changedAt).toBe(at);
  });
});
