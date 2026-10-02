import { describe, expect, it } from "vitest";
import { explainRoute } from "./routeExplain";
import type { SwapStep } from "./quoter";

const step = (dex: string, a: string, b: string, extra: Partial<SwapStep> = {}): SwapStep =>
  ({ dex, path: ["0x1", "0x2"], symbolPath: [a, b], v3Fee: dex === "bdex-v3" ? 3000 : undefined, ...extra }) as unknown as SwapStep;

describe("Smart AI route explanations", () => {
  it("BOT → USDT → FLOW on Mainnet is ATOMIC — V4 with 1 transaction", () => {
    const r = explainRoute([step("bdex-v3", "BOT", "USDT", { inIsNative: true }), step("bdex-v3", "USDT", "FLOW")], 677);
    expect(r.execution).toBe("ATOMIC_V4");
    expect(r.transactions).toBe(1);
    expect(r.lines.join(" ")).toMatch(/ONE transaction/);
  });
  it("same route on Testnet stays STAGED (flag off)", () => {
    const r = explainRoute([step("bdex-v3", "BOT", "USDT", { inIsNative: true }), step("bdex-v3", "USDT", "FLOW")], 968);
    expect(r.execution).toBe("STAGED");
    expect(r.transactions).toBe(2);
  });
  it("CaSwap + BDEX V3 is staged and explains why two DEXs", () => {
    const r = explainRoute([step("caswap", "CA", "BOT"), step("bdex-v3", "BOT", "USDT")], 677);
    expect(r.execution).toBe("STAGED");
    expect(r.lines.join(" ")).toMatch(/2 DEXs/);
  });
  it("mixed BDEX V2 + V3 is staged", () => {
    expect(explainRoute([step("bdex v2", "A", "B"), step("bdex-v3", "B", "C")], 677).execution).toBe("STAGED");
  });
  it("distinguishes the FlowBridge fee from DEX pool fees", () => {
    expect(explainRoute([step("bdex-v3", "FLOW", "USDT")], 677).lines.join(" ")).toMatch(/FlowBridge fee is a separate/);
  });
  it("manual venue is stated, never silently switched", () => {
    expect(explainRoute([step("caswap", "CA", "BOT")], 677, "caswap").lines[0]).toMatch(/only routes through that venue/);
  });
});

import { stepMatchesPref } from "./quoter";
describe("CaSwap direct regression — venue isolation", () => {
  it("manual CaSwap accepts only CaSwap legs; manual BDEX never accepts CaSwap", () => {
    expect(stepMatchesPref(step("caswap", "CA", "BOT"), "caswap")).toBe(true);
    expect(stepMatchesPref(step("bdex-v3", "BOT", "USDT"), "caswap")).toBe(false);
    expect(stepMatchesPref(step("caswap", "CA", "BOT"), "bdex-v2")).toBe(false);
    expect(stepMatchesPref(step("caswap", "CA", "BOT"), "bdex-v3")).toBe(false);
    expect(stepMatchesPref(step("caswap", "CA", "BOT"), "auto")).toBe(true);
  });
});
