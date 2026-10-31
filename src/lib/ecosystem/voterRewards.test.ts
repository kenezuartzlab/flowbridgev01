import { describe, expect, it } from "vitest";
import { computeVoterCredits, flowPerBot, priceWithinDrift, shortAddr } from "./voterRewards";

const voters = (n: number, votes = (i: number) => 1) =>
  Array.from({ length: n }, (_, i) => ({ wallet: `0x${String(i).padStart(40, "a")}`, votes: votes(i) }));

describe("voter reward shares", () => {
  it("gives 25% of BOT received to the top 10 and 25% to the rest", () => {
    const c = computeVoterCredits(voters(15), 4, 1);
    const top = c.filter((x) => x.tier === "TOP10");
    const rest = c.filter((x) => x.tier === "COMMUNITY");
    expect(top).toHaveLength(10);
    expect(rest).toHaveLength(5);
    expect(top.reduce((s, x) => s + x.flow, 0)).toBeCloseTo(1, 5);
    expect(rest.reduce((s, x) => s + x.flow, 0)).toBeCloseTo(1, 5);
  });

  it("splits each pool by vote count", () => {
    const c = computeVoterCredits([{ wallet: "0xA", votes: 3 }, { wallet: "0xB", votes: 1 }], 8, 1);
    expect(c[0].flow).toBeCloseTo(1.5, 6);
    expect(c[1].flow).toBeCloseTo(0.5, 6);
  });

  it("converts BOT to FLOW at the approved price", () => {
    const c = computeVoterCredits([{ wallet: "0xA", votes: 1 }], 1, 100_000);
    expect(c[0].flow).toBe(25_000);
  });

  it("never pays more than 50% of BOT received", () => {
    const c = computeVoterCredits(voters(40, (i) => i + 1), 10, 7);
    expect(c.reduce((s, x) => s + x.flow, 0)).toBeLessThanOrEqual(35);
  });

  it("pays nothing without received BOT or a price", () => {
    expect(computeVoterCredits(voters(3), 0, 1)).toEqual([]);
    expect(computeVoterCredits(voters(3), 1, 0)).toEqual([]);
  });

  it("derives FLOW per BOT from USDT prices", () => {
    expect(flowPerBot(9000, 0.08)).toBeCloseTo(112_500, 6);
    expect(flowPerBot(9000, 0)).toBe(0);
  });

  it("rejects an approved price that drifted more than 2%", () => {
    expect(priceWithinDrift(100, 101)).toBe(true);
    expect(priceWithinDrift(100, 110)).toBe(false);
  });

  it("shortens addresses", () => {
    expect(shortAddr("0xfa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e47")).toBe("0xfa3d…7e47");
  });
});
