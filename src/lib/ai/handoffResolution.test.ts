import { describe, it, expect } from "vitest";
import { classifyResolution, mayHydrate } from "./handoffResolution";
import { normalizePreparedIntent, fromRawAmount, toRawAmount } from "./canonicalIntent";
import { createActionIntent, withStatus } from "./actionIntent";

function readyIntent(amount = 10) {
  const base = createActionIntent({
    id: `intent-${amount}`,
    type: "SWAP",
    chainId: 968,
    actorUserId: "u1",
    actorWallet: "0x1111111111111111111111111111111111111111",
    targetContract: "0x986962de6F00D0eC571b1a34Fa70AEeB445b5445",
    parameters: {
      tokenIn: "0x2222222222222222222222222222222222222222",
      tokenOut: "0x3333333333333333333333333333333333333333",
      decimalsIn: 18,
      decimalsOut: 18,
      amountIn: amount,
      recipient: "0x1111111111111111111111111111111111111111",
    },
  });
  return {
    ...withStatus(withStatus(base, "SIMULATED"), "READY_FOR_USER"),
    expiresAt: new Date(Date.now() + 90_000).toISOString(),
  };
}

describe("V15.3J canonical amount fidelity", () => {
  it("round-trips a display amount through raw without float drift", () => {
    const raw = toRawAmount("10", 18);
    expect(raw).toBe("10000000000000000000");
    expect(fromRawAmount(raw, 18)).toBe("10");
    expect(fromRawAmount(toRawAmount("0.000001", 6), 6)).toBe("0.000001");
  });

  it("normalizes a READY intent into a canonical snapshot with a digest", () => {
    const n = normalizePreparedIntent(readyIntent(10));
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.canonical.swap?.amountInDisplay).toBe("10");
    expect(n.canonical.swap?.amountInRaw).toBe("10000000000000000000");
    expect(n.canonical.digest).toMatch(/^[0-9a-f]+$/);
  });
});

describe("V15.3J resolution classification", () => {
  const canonical = (() => {
    const n = normalizePreparedIntent(readyIntent(10));
    if (!n.ok) throw new Error("fixture");
    return n.canonical;
  })();

  it("resolves an owned, fresh, digest-matching snapshot", () => {
    const r = classifyResolution({ stored: canonical, digestHint: canonical.digest });
    expect(r.status).toBe("RESOLVED");
    expect(mayHydrate(r)).toBe(true);
  });

  it("reports MISSING rather than MALFORMED when nothing is stored", () => {
    expect(classifyResolution({ stored: null }).status).toBe("MISSING");
  });

  it("reports TAMPERED when the link digest disagrees with the stored plan", () => {
    const r = classifyResolution({ stored: canonical, digestHint: "deadbeef" });
    expect(r.status).toBe("TAMPERED");
    expect(mayHydrate(r)).toBe(false);
  });

  it("reports EXPIRED past the lifetime and refuses hydration", () => {
    const stale = { ...canonical, expiresAt: new Date(Date.now() - 1_000).toISOString() };
    const r = classifyResolution({ stored: stale, digestHint: canonical.digest });
    expect(r.status).toBe("EXPIRED");
    expect(mayHydrate(r)).toBe(false);
  });

  it("reports MALFORMED only when the stored object itself is invalid", () => {
    expect(classifyResolution({ stored: { intentId: "x" } }).status).toBe("MALFORMED");
  });
});
