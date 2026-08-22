import { describe, expect, it } from "vitest";
import {
  classifyContinuation,
  continuationMessage,
  preparedHandleFrom,
  resolveContinuation,
  type PreparedHandle,
} from "./actionContinuation";

const handle = (over: Partial<PreparedHandle> = {}): PreparedHandle => ({
  intentId: "intent-1",
  type: "SWAP",
  chainId: 968,
  state: "READY_FOR_USER",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  handoffHref: "/trade?tab=swap",
  handoffCta: "Review in Trade",
  surface: "/trade",
  actorKey: "user|0xabc|968|no-org",
  ...over,
});

describe("V15.3D action continuation", () => {
  it("classifies proceed and cancel language", () => {
    expect(classifyContinuation("Proceed")).toBe("PROCEED");
    expect(classifyContinuation("authorized")).toBe("PROCEED");
    expect(classifyContinuation("yes")).toBe("PROCEED");
    expect(classifyContinuation("cancel that")).toBe("CANCEL");
    expect(classifyContinuation("what are FLOW points?")).toBe("NONE");
  });

  it("continues the prepared plan instead of falling through to chat", () => {
    const out = resolveContinuation({
      handle: handle(),
      question: "proceed",
      actorKey: "user|0xabc|968|no-org",
    });
    expect(out.kind).toBe("RESTATE_READY");
    expect(continuationMessage(out)).toMatch(/\/trade/);
    expect(continuationMessage(out)).toMatch(/own wallet/);
  });

  it("never continues an expired plan", () => {
    const out = resolveContinuation({
      handle: handle({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
      question: "go ahead",
      actorKey: "user|0xabc|968|no-org",
    });
    expect(out.kind).toBe("EXPIRED");
  });

  it("drops the plan when the actor context changed", () => {
    const out = resolveContinuation({
      handle: handle(),
      question: "authorized",
      actorKey: "user|0xdef|677|no-org",
    });
    expect(out.kind).toBe("CONTEXT_CHANGED");
  });

  it("returns NONE for unrelated questions so normal Q&A still works", () => {
    expect(
      resolveContinuation({
        handle: handle(),
        question: "how do FLOW points accrue?",
        actorKey: "user|0xabc|968|no-org",
      }).kind,
    ).toBe("NONE");
  });

  it("maps prepared status onto a continuable state", () => {
    expect(
      preparedHandleFrom({
        intentId: "i",
        type: "SWAP",
        chainId: 968,
        status: "REJECTED",
        expiresAt: new Date().toISOString(),
        handoff: null,
        actorKey: "k",
      }).state,
    ).toBe("REJECTED");
  });
});
