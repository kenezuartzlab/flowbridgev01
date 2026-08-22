import { describe, expect, it } from "vitest";
import {
  buildReviewAction,
  claimsPreparedAction,
  enforceProseHonesty,
  NOT_READY_MESSAGE,
  preparedHandleUsable,
  validateStructuredAction,
} from "./actionRender";

const intent = {
  id: "intent-1",
  type: "SWAP",
  chainId: 968,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  fingerprint: "abc12345",
  parameters: { tokenIn: "0x1", amountIn: "10" },
  simulationResult: { ok: true, method: "eth_call" },
  status: "READY_FOR_USER",
};

const reviewAction = buildReviewAction({
  intentId: "intent-1",
  href: "/trade?from=USDT&to=BOT&amount=10&intent=intent-1&fp=abc12345",
  cta: "Review in Trade",
  surface: "Trade",
})!;

describe("V15.3H structured action contract", () => {
  it("splits the handoff href into route + search", () => {
    expect(reviewAction.route).toBe("/trade");
    expect(reviewAction.search.amount).toBe("10");
    expect(reviewAction.search.intent).toBe("intent-1");
  });

  it("accepts a complete READY_FOR_USER payload", () => {
    const v = validateStructuredAction({ mode: "READY_FOR_USER", actionIntent: intent, reviewAction });
    expect(v.ok).toBe(true);
    expect(v.mode).toBe("READY_FOR_USER");
  });

  it("degrades to NOT_READY when reviewAction is missing", () => {
    const v = validateStructuredAction({ mode: "READY_FOR_USER", actionIntent: intent, reviewAction: null });
    expect(v.ok).toBe(false);
    expect(v.mode).toBe("NOT_READY");
    expect(v.errors).toContain("reviewAction missing");
  });

  it("degrades when reviewAction points at another intent", () => {
    const v = validateStructuredAction({
      mode: "READY_FOR_USER",
      actionIntent: intent,
      reviewAction: { ...reviewAction, intentId: "other" },
    });
    expect(v.ok).toBe(false);
  });

  it("degrades when the simulation did not pass", () => {
    const v = validateStructuredAction({
      mode: "READY_FOR_USER",
      actionIntent: { ...intent, simulationResult: { ok: false } },
      reviewAction,
    });
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("actionIntent.simulationResult not passing");
  });

  it("never claims a prepared action without a structured one", () => {
    const prose = "I've prepared your swap — tap Review on /trade.";
    expect(claimsPreparedAction(prose)).toBe(true);
    expect(enforceProseHonesty({ mode: "NOT_READY", message: prose, hasStructuredAction: false })).toBe(
      NOT_READY_MESSAGE,
    );
    expect(
      enforceProseHonesty({ mode: "READY_FOR_USER", message: prose, hasStructuredAction: true }),
    ).toBe(prose);
  });

  it("leaves ordinary informational prose untouched", () => {
    const msg = "Bridging USDT from BOT to BNB takes two steps.";
    expect(enforceProseHonesty({ mode: "INFO", message: msg, hasStructuredAction: false })).toBe(msg);
  });

  it("only treats fresh READY handles as usable", () => {
    expect(
      preparedHandleUsable({
        state: "READY_FOR_USER",
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
        handoffHref: "/trade?intent=x",
      }),
    ).toBe(true);
    expect(
      preparedHandleUsable({
        state: "READY_FOR_USER",
        expiresAt: new Date(Date.now() - 10).toISOString(),
        handoffHref: "/trade?intent=x",
      }),
    ).toBe(false);
    expect(preparedHandleUsable(null)).toBe(false);
    expect(
      preparedHandleUsable({ state: "REJECTED", expiresAt: new Date(Date.now() + 10_000).toISOString(), handoffHref: "/trade" }),
    ).toBe(false);
  });
});
