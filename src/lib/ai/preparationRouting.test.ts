import { describe, expect, it } from "vitest";
import {
  buildActorKey,
  clarificationFor,
  createPending,
  detectPreparationRequest,
  extractExactAmount,
  parametersForShape,
  resolvePending,
} from "./preparationRouting";

const WALLET = "0x3d8a7fa490f9db09dd8006b74688213ace9c0164";
const KEY = buildActorKey({ userId: "u1", wallet: WALLET, chainId: 968 });

describe("V15.3A preparation routing", () => {
  it("routes the canary sentence to preparation instead of generic Q&A", () => {
    const shape = detectPreparationRequest({
      question: "Prepare a small USDT to BOT swap for me on BOT Testnet.",
    });
    expect(shape).not.toBeNull();
    expect(shape!.type).toBe("SWAP");
    expect(shape!.chainId).toBe(968);
    expect(shape!.tokenInSymbol).toBe("USDT");
    expect(shape!.tokenOutSymbol).toBe("BOT");
  });

  it("never invents an amount from a vague qualifier", () => {
    const shape = detectPreparationRequest({ question: "Prepare a small USDT to BOT swap" })!;
    expect(shape.amount).toBeNull();
    expect(shape.missingFields).toContain("amount");
    expect(clarificationFor(shape)).toMatch(/how much/i);
  });

  it("keeps informational questions on the knowledge path", () => {
    expect(
      detectPreparationRequest({ question: "How do I bridge USDT from BOT to BNB?" }),
    ).toBeNull();
    expect(detectPreparationRequest({ question: "What are FLOW Points?" })).toBeNull();
  });

  it("accepts an explicit amount in the same sentence", () => {
    const shape = detectPreparationRequest({ question: "Prepare a 10 USDT to BOT swap" })!;
    expect(shape.amount).toBe("10");
    expect(shape.missingFields).toHaveLength(0);
  });

  it("completes the pending slot from a bare numeric reply", () => {
    const shape = detectPreparationRequest({ question: "Prepare a small USDT to BOT swap" })!;
    const pending = createPending({ shape, actorKey: KEY });
    const res = resolvePending({ pending, question: "10", actorKey: KEY });
    expect(res.kind).toBe("COMPLETED");
    expect(res.kind === "COMPLETED" && res.shape.amount).toBe("10");
  });

  it("expires the pending slot instead of reusing a stale plan", () => {
    const shape = detectPreparationRequest({ question: "Prepare a small USDT to BOT swap" })!;
    const pending = createPending({
      shape,
      actorKey: KEY,
      now: new Date(Date.now() - 10 * 60_000),
    });
    expect(resolvePending({ pending, question: "10", actorKey: KEY }).kind).toBe("EXPIRED");
  });

  it("drops the pending slot when actor context changes", () => {
    const shape = detectPreparationRequest({ question: "Prepare a small USDT to BOT swap" })!;
    const pending = createPending({ shape, actorKey: KEY });
    const other = buildActorKey({ userId: "u2", wallet: WALLET, chainId: 968 });
    expect(resolvePending({ pending, question: "10", actorKey: other }).kind).toBe(
      "CONTEXT_CHANGED",
    );
  });

  it("supersedes a pending slot when a different action is requested", () => {
    const shape = detectPreparationRequest({ question: "Prepare a small USDT to BOT swap" })!;
    const pending = createPending({ shape, actorKey: KEY });
    const res = resolvePending({
      pending,
      question: "Actually prepare a 5 CA to USDT swap",
      actorKey: KEY,
    });
    expect(res.kind).toBe("SUPERSEDED");
  });

  it("reads amounts only when attached to a token or standing alone", () => {
    expect(extractExactAmount("swap 12.5 usdt to bot", "USDT")).toBe("12.5");
    expect(extractExactAmount("on chain 968 please", "USDT")).toBeNull();
  });

  it("builds canonical parameters from the registry, not from the sentence", () => {
    const shape = detectPreparationRequest({ question: "Prepare a 10 USDT to BOT swap" })!;
    const built = parametersForShape({ shape, wallet: WALLET })!;
    expect(built.type).toBe("SWAP");
    expect(built.parameters.decimalsIn).toBe(6);
    expect(String(built.parameters.tokenIn)).toMatch(/^0x[0-9a-f]{40}$/);
    expect(built.parameters.recipient).toBe(WALLET);
    expect(built.parameters.tokenIn).not.toBe(built.parameters.tokenOut);
  });

  it("refuses a same-token swap shape", () => {
    expect(detectPreparationRequest({ question: "Prepare a 10 USDT to USDT swap" })).toBeNull();
  });
});
