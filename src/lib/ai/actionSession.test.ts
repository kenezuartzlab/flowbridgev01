/**
 * V15.3I §1–§3 — the pending-action session must retain explicit slots across
 * failures so "retry" never re-asks for chain, tokens or amount.
 */
import { describe, expect, it } from "vitest";
import {
  classifyPreparationFailure,
  createActionSession,
  isRetryRequest,
  mergeActionSession,
  preparationFailureMessage,
  retryActionSession,
} from "./actionSession";
import type { PreparationShape } from "./preparationRouting";

const shape = (over: Partial<PreparationShape> = {}): PreparationShape => ({
  type: "SWAP",
  chainId: 968,
  tokenInSymbol: "USDT",
  tokenOutSymbol: "BOT",
  destinationChainId: null,
  amount: "5",
  missingFields: [],
  recognized: ["swap", "USDT → BOT"],
  ...over,
});

describe("action session slots", () => {
  it("retains every explicit slot on retry and clears only volatile output", () => {
    const created = createActionSession({ shape: shape(), actorKey: "u1" });
    const failed = {
      ...created,
      lastError: classifyPreparationFailure({ reasons: ["live quote unavailable"], slots: created.slots }),
    };
    const outcome = retryActionSession({ session: failed, actorKey: "u1" });
    expect(outcome.kind).toBe("RETRY");
    if (outcome.kind !== "RETRY") return;
    expect(outcome.session.slots.amount).toBe("5");
    expect(outcome.session.slots.tokenInSymbol).toBe("USDT");
    expect(outcome.session.slots.chainId).toBe(968);
    expect(outcome.session.attempts).toBe(1);
    expect(outcome.session.lastError).toBeNull();
    expect(outcome.shape.missingFields).toEqual([]);
  });

  it("asks only for the genuinely missing slot", () => {
    const s = createActionSession({ shape: shape({ amount: null }), actorKey: "u1" });
    const outcome = retryActionSession({ session: s, actorKey: "u1" });
    expect(outcome.kind).toBe("MISSING_SLOT");
  });

  it("names the exact conflict when a retained token is not canonical on that chain", () => {
    const s = createActionSession({ shape: shape({ tokenInSymbol: "NOPE" }), actorKey: "u1" });
    const outcome = retryActionSession({ session: s, actorKey: "u1" });
    expect(outcome.kind).toBe("SLOT_CONFLICT");
    if (outcome.kind !== "SLOT_CONFLICT") return;
    expect(outcome.conflict).toContain("NOPE");
  });

  it("refuses to reuse a session from another actor or an expired one", () => {
    const s = createActionSession({ shape: shape(), actorKey: "u1" });
    expect(retryActionSession({ session: s, actorKey: "u2" }).kind).toBe("CONTEXT_CHANGED");
    const old = { ...s, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(retryActionSession({ session: old, actorKey: "u1" }).kind).toBe("EXPIRED");
    expect(retryActionSession({ session: null, actorKey: "u1" }).kind).toBe("NO_SESSION");
  });

  it("merges new slots without dropping earlier ones", () => {
    const s = createActionSession({ shape: shape({ amount: null }), actorKey: "u1" });
    const merged = mergeActionSession({
      session: s,
      shape: shape({ tokenOutSymbol: null, amount: "12" }),
    });
    expect(merged.slots.amount).toBe("12");
    expect(merged.slots.tokenOutSymbol).toBe("BOT");
  });

  it("recognizes retry language", () => {
    for (const t of ["retry", "Try again", "prepare that action again", "one more time"]) {
      expect(isRetryRequest(t)).toBe(true);
    }
    expect(isRetryRequest("what is the bridge fee?")).toBe(false);
  });
});

describe("preparation failure codes", () => {
  it("classifies failures into machine-readable codes and stages", () => {
    const slots = createActionSession({ shape: shape(), actorKey: "u1" }).slots;
    expect(classifyPreparationFailure({ reasons: ["quote unavailable"], slots }).errorCode).toBe(
      "LIVE_QUOTE_UNAVAILABLE",
    );
    expect(classifyPreparationFailure({ reasons: ["eth_call reverted"], slots }).stage).toBe(
      "SIMULATION",
    );
    const wallet = classifyPreparationFailure({ reasons: ["no bound wallet"], slots });
    expect(wallet.errorCode).toBe("WALLET_MISMATCH");
    expect(wallet.retryable).toBe(false);
  });

  it("explains a failure with retained slots and never claims a signature happened", () => {
    const slots = createActionSession({ shape: shape(), actorKey: "u1" }).slots;
    const msg = preparationFailureMessage(
      classifyPreparationFailure({ reasons: ["allowance read failed"], slots }),
    );
    expect(msg).toContain("ALLOWANCE_READ_FAILED");
    expect(msg).toContain("Nothing was signed or submitted");
    expect(msg).toContain("USDT → BOT");
  });
});
