import { describe, it, expect } from "vitest";
import { computeRewardProgression } from "./rewardProgression";
const base = { reconciledPoints: 10_000, reviewHeldPoints: 0, historicalNonclaimable: 0, reconciliationOk: true, storedFlowPoints: 0, walletBound: true, allocations: [], nowSec: 0 };
describe("V36.5 classification", () => {
  it('keeps 1,031 Testnet Points separate from 150 held historical milestones', () => {
    const p = computeRewardProgression({ ...base, historicalNonclaimable: 175, ledger: [{ points: 1031, chainId: 968, fundingState: 'UNFUNDED', programId: null }, { points: 150, chainId: null, fundingState: 'UNFUNDED', programId: null, excluded: true }, { points: 625, chainId: 677, fundingState: 'UNFUNDED', programId: 'CORE_SWAP' }] });
    expect(p.testnetExcluded).toBe(1031);
    expect(p.pendingUnfunded).toBe(625);
    expect(p.historicalNonclaimable).toBe(175);
    expect(p.eligibleFundedFlow).toBe(0);
  });
  it("chain-less unfunded milestone rows are awaiting funding, not Testnet", () => {
    const p = computeRewardProgression({ ...base, ledger: [{ points: 150, chainId: null, fundingState: "UNFUNDED", programId: null }] });
    expect(p.pendingUnfunded).toBe(150); expect(p.testnetExcluded).toBe(0); expect(p.eligibleFundedFlow).toBe(0);
  });
  it("chain-less signup rows never count unless attributed to 677", () => {
    const p = computeRewardProgression({ ...base, ledger: [{ points: 300, chainId: null, fundingState: "FUNDED", programId: "SIGNUP_BONUS" }] });
    expect(p.eligibleFundedFlow).toBe(0);
    const q = computeRewardProgression({ ...base, ledger: [{ points: 300, chainId: 677, fundingState: "FUNDED", programId: "SIGNUP_BONUS" }] });
    expect(q.eligibleFundedFlow).toBe(300);
  });
});
