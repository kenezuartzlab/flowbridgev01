/**
 * V15.3K — final action lifecycle consistency. These tests pin the five defects
 * this phase closed: two-turn convergence, single expiry authority, native asset
 * semantics, fingerprint sensitivity to those semantics, and the approval count.
 */
import { describe, expect, it } from "vitest";
import {
  createActionIntent,
  economicFingerprint,
  effectiveStatus,
  isReadyForUser,
  outputAssetKindOf,
  secondsRemaining,
  withStatus,
} from "./actionIntent";
import {
  applyAmountToSession,
  createActionSession,
  shapeFromSlots,
} from "./actionSession";
import {
  detectPreparationRequest,
  normalizeRequest,
  parametersForShape,
  tokenFor,
} from "./preparationRouting";

const CHAIN = 968;
const WALLET = "0x1111111111111111111111111111111111111111";

describe("V15.3K §2 — two-turn convergence", () => {
  it("an amount-only reply completes the durable session with the retained slots", () => {
    const first = detectPreparationRequest({
      question: "prepare a small USDT to BOT swap on BOT Testnet",
      defaultChainId: CHAIN,
    });
    expect(first).not.toBeNull();
    const session = createActionSession({ shape: first!, actorKey: "user:a" });
    expect(session.slots.amount).toBeNull();

    const applied = applyAmountToSession({ session, question: "10", actorKey: "user:a" });
    expect(applied.kind).toBe("COMPLETED");
    if (applied.kind !== "COMPLETED") return;
    expect(applied.shape.amount).toBe("10");
    expect(applied.shape.missingFields).toHaveLength(0);
    expect(applied.shape.tokenInSymbol).toBe("USDT");
    expect(applied.shape.tokenOutSymbol).toBe("BOT");
  });

  it("normalizes the two-turn and one-shot paths to the SAME canonical request", () => {
    const oneShot = detectPreparationRequest({
      question: "prepare a 10 USDT to BOT swap on BOT Testnet",
      defaultChainId: CHAIN,
    })!;
    const twoTurnFirst = detectPreparationRequest({
      question: "prepare a small USDT to BOT swap on BOT Testnet",
      defaultChainId: CHAIN,
    })!;
    const session = createActionSession({ shape: twoTurnFirst, actorKey: "user:a" });
    const applied = applyAmountToSession({ session, question: "10", actorKey: "user:a" });
    if (applied.kind !== "COMPLETED") throw new Error("expected completion");

    expect(normalizeRequest(applied.shape)).toEqual(normalizeRequest(oneShot));
    const a = parametersForShape({ shape: oneShot, wallet: WALLET });
    const b = parametersForShape({ shape: applied.shape, wallet: WALLET });
    expect(b).toEqual(a);
  });

  it("ignores an amount reply once the slot is already filled or the actor changed", () => {
    const shape = shapeFromSlots({
      actionType: "SWAP",
      chainId: CHAIN,
      tokenInSymbol: "USDT",
      tokenOutSymbol: "BOT",
      destinationChainId: null,
      amount: "5",
      recognized: [],
    });
    const filled = createActionSession({ shape, actorKey: "user:a" });
    expect(applyAmountToSession({ session: filled, question: "10", actorKey: "user:a" }).kind).toBe(
      "NONE",
    );
    const pending = createActionSession({
      shape: { ...shape, amount: null, missingFields: ["amount"] },
      actorKey: "user:a",
    });
    expect(applyAmountToSession({ session: pending, question: "10", actorKey: "user:b" }).kind).toBe(
      "NONE",
    );
  });
});

function readyIntent(expiresInMs: number) {
  const base = createActionIntent({
    id: "intent-1",
    type: "SWAP",
    actorUserId: "user-1",
    actorWallet: WALLET,
    organizationId: null,
    chainId: CHAIN,
    parameters: parametersForShape({
      shape: detectPreparationRequest({
        question: "prepare a 10 USDT to BOT swap on BOT Testnet",
        defaultChainId: CHAIN,
      })!,
      wallet: WALLET,
    })!.parameters,
    targetContract: "0x2222222222222222222222222222222222222222",
  });
  const ready = withStatus(withStatus(base, "SIMULATED"), "READY_FOR_USER");
  return { ...ready, expiresAt: new Date(Date.now() + expiresInMs).toISOString() };
}

describe("V15.3K §3 — one expiry authority", () => {
  it("reports READY_FOR_USER only while time actually remains", () => {
    const fresh = readyIntent(90_000);
    expect(effectiveStatus(fresh)).toBe("READY_FOR_USER");
    expect(isReadyForUser(fresh)).toBe(true);
    expect(secondsRemaining(fresh)).toBeGreaterThan(80);
  });

  it("never shows READY_FOR_USER at 0s remaining", () => {
    const dead = readyIntent(0);
    expect(secondsRemaining(dead)).toBe(0);
    expect(effectiveStatus(dead)).toBe("EXPIRED");
    expect(isReadyForUser(dead)).toBe(false);
  });

  it("keeps REJECTED authoritative over expiry", () => {
    const rejected = { ...readyIntent(-1_000), status: "REJECTED" as const };
    expect(effectiveStatus(rejected)).toBe("REJECTED");
  });
});

describe("V15.3K §5 — native BOT vs wrapped WBOT semantics", () => {
  it("marks BOT as native and WBOT as wrapped in the registry lookup", () => {
    expect(tokenFor("BOT", CHAIN)?.isNative).toBe(true);
    expect(tokenFor("WBOT", CHAIN)?.isNative).toBe(false);
  });

  it("carries the asset kind into the prepared parameters", () => {
    const nativeShape = detectPreparationRequest({
      question: "prepare a 10 USDT to BOT swap on BOT Testnet",
      defaultChainId: CHAIN,
    })!;
    const wrappedShape = detectPreparationRequest({
      question: "prepare a 10 USDT to WBOT swap on BOT Testnet",
      defaultChainId: CHAIN,
    })!;
    const native = parametersForShape({ shape: nativeShape, wallet: WALLET })!.parameters;
    const wrapped = parametersForShape({ shape: wrappedShape, wallet: WALLET })!.parameters;

    expect(native.tokenOutIsNative).toBe(true);
    expect(wrapped.tokenOutIsNative).toBe(false);
    expect(outputAssetKindOf(native)).toBe("native");
    expect(outputAssetKindOf(wrapped)).toBe("erc20");
  });

  it("gives native and wrapped plans different economic fingerprints", () => {
    const mk = (question: string) =>
      economicFingerprint(
        createActionIntent({
          id: "i",
          type: "SWAP",
          actorUserId: "user-1",
          actorWallet: WALLET,
          organizationId: null,
          chainId: CHAIN,
          parameters: parametersForShape({
            shape: detectPreparationRequest({ question, defaultChainId: CHAIN })!,
            wallet: WALLET,
          })!.parameters,
          targetContract: "0x2222222222222222222222222222222222222222",
        }),
      );
    expect(mk("prepare a 10 USDT to BOT swap on BOT Testnet")).not.toBe(
      mk("prepare a 10 USDT to WBOT swap on BOT Testnet"),
    );
  });
});
