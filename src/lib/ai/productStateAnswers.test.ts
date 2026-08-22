import { describe, expect, it } from "vitest";
import { answerProductState, detectProductComplaint, type ProductState } from "./productStateAnswers";

const base: ProductState = { renderStatus: "NONE", hasPreparedHandle: false, handoff: null };

describe("V15.3H product-state awareness", () => {
  it("detects a missing review card complaint", () => {
    expect(detectProductComplaint("There is no review card in the chat")).toBe("NO_REVIEW_CARD");
    expect(detectProductComplaint("no review")).toBe("NO_REVIEW_CARD");
    expect(detectProductComplaint("I can't see the button")).toBe("NO_REVIEW_CARD");
  });

  it("detects a missing prefill complaint", () => {
    expect(detectProductComplaint("Trade was not prefilled")).toBe("NO_PREFILL");
    expect(detectProductComplaint("no prefilled amount")).toBe("NO_PREFILL");
  });

  it("ignores ordinary questions", () => {
    expect(detectProductComplaint("How do I bridge USDT to BNB?")).toBeNull();
  });

  it("reports HANDOFF_RENDER_FAILED when the card failed to render", () => {
    const r = answerProductState({
      complaint: "NO_REVIEW_CARD",
      state: { ...base, renderStatus: "RENDER_FAILED", hasPreparedHandle: true },
    });
    expect(r.code).toBe("HANDOFF_RENDER_FAILED");
    expect(r.offerRetry).toBe(true);
  });

  it("admits there is no prepared action instead of inventing a button", () => {
    const r = answerProductState({ complaint: "NO_REVIEW_CARD", state: base });
    expect(r.code).toBe("NO_PREPARED_ACTION");
    expect(r.message).not.toMatch(/should be there/i);
  });

  it("reports HANDOFF_HYDRATION_FAILED when Trade said it could not prefill", () => {
    const r = answerProductState({
      complaint: "NO_PREFILL",
      state: {
        renderStatus: "RENDERED",
        hasPreparedHandle: true,
        handoff: { code: "HANDOFF_HYDRATION_FAILED", surface: "Trade", detail: "pair unavailable." },
      },
    });
    expect(r.code).toBe("HANDOFF_HYDRATION_FAILED");
    expect(r.message).toContain("Trade");
    expect(r.offerRetry).toBe(true);
  });

  it("never blames another app when nothing is prepared", () => {
    const r = answerProductState({ complaint: "NO_PREFILL", state: base });
    expect(r.code).toBe("NO_PREPARED_ACTION");
    expect(r.message).not.toMatch(/different app|another app|browser/i);
  });
});
