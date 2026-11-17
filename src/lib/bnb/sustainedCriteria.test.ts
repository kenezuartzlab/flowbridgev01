// Synthetic fixtures only — NOT on-chain evidence.
import { describe, it, expect } from "vitest";
import { evaluateSustained, classifyTokenSafety, type SustainedSample } from "./sustainedCriteria";
const s = (i: number, o: Partial<SustainedSample> = {}): SustainedSample => ({
  blockNumber: 100 + i * 20, blockHash: `0x${i}`, peerBlockHash: `0x${i}`, blockTime: new Date(Date.UTC(2026, 10, 17, 10, 0, i * 15)).toISOString(),
  codeHashes: { pool: "0xaa" }, liquidity: "100", tick: 1, unlocked: true, smallRate: 600, largeRate: 599.7,
  roundTripLossBps: 11, maxTicks: 1, maxGas: 120000, finalHashRechecked: true, ...o,
});
const five = [0, 1, 2, 3, 4].map((i) => s(i));
const get = (r: ReturnType<typeof evaluateSustained>, id: string) => r.criteria.find((c) => c.id === id)!.state;
describe("sustained criteria", () => {
  it("passes five distinct healthy blocks over 60s", () => expect(evaluateSustained(five).overall).toBe("PASS"));
  it("is UNKNOWN with no samples", () => expect(evaluateSustained([]).overall).toBe("UNKNOWN"));
  it("fails repeated same-block samples", () => expect(get(evaluateSustained(five.map((x) => ({ ...x, blockNumber: 1 }))), "distinct-blocks")).toBe("FAIL"));
  it("fails fewer than 5 blocks", () => expect(get(evaluateSustained(five.slice(0, 4)), "distinct-blocks")).toBe("FAIL"));
  it("fails a peer hash mismatch", () => expect(get(evaluateSustained([...five.slice(0, 4), s(4, { peerBlockHash: "0xbad" })]), "peer-hash-and-reorg")).toBe("FAIL"));
  it("fails a final-hash reorg", () => expect(get(evaluateSustained([...five.slice(0, 4), s(4, { finalHashRechecked: false })]), "peer-hash-and-reorg")).toBe("FAIL"));
  it("fails code identity drift", () => expect(get(evaluateSustained([...five.slice(0, 4), s(4, { codeHashes: { pool: "0xbb" } })]), "code-identity-stable")).toBe("FAIL"));
  it("fails drift over 150 bps", () => expect(get(evaluateSustained([...five.slice(0, 4), s(4, { smallRate: 610 })]), "mid-drift")).toBe("FAIL"));
  it("fails round-trip loss over 100 bps", () => expect(get(evaluateSustained([s(0, { roundTripLossBps: 101 }), ...five.slice(1)]), "round-trip-loss")).toBe("FAIL"));
  it("fails marginal impact over 100 bps", () => expect(get(evaluateSustained([s(0, { largeRate: 590 }), ...five.slice(1)]), "marginal-impact")).toBe("FAIL"));
  it("fails zero liquidity", () => expect(get(evaluateSustained([s(0, { liquidity: "0" }), ...five.slice(1)]), "liquidity-unlocked")).toBe("FAIL"));
  it("fails span under 30s", () => expect(get(evaluateSustained(five.map((x) => ({ ...x, blockTime: five[0].blockTime }))), "time-span")).toBe("FAIL"));
});
const base = { codePresent: true, eip1967Implementation: null, eip1967Admin: null, pausedNow: false, owner: null, capabilitySelectors: [], verifiedSourceReviewed: true, legalReviewed: true };
describe("token safety", () => {
  it("blocks missing code", () => expect(classifyTokenSafety({ ...base, codePresent: false }).state).toBe("BLOCKED"));
  it("blocks paused token", () => expect(classifyTokenSafety({ ...base, pausedNow: true }).state).toBe("BLOCKED"));
  it("is UNKNOWN without source review", () => expect(classifyTokenSafety({ ...base, verifiedSourceReviewed: false }).state).toBe("UNKNOWN"));
  it("never approves even a clean token", () => expect(classifyTokenSafety(base).state).toBe("RESTRICTED_REVIEW_REQUIRED"));
  it("flags upgradeable proxy", () => expect(classifyTokenSafety({ ...base, eip1967Implementation: "0x" + "1".repeat(40) }).reasons).toContain("upgradeable-proxy"));
});
