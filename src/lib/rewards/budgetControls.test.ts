import { describe, expect, it } from "vitest";
import {
  buildSetBudgetCalldata, budgetImpact, requiredOnChainBudgetFlow, validateProposal, verifyBudgetTxIdentity,
  type BudgetTxFacts, type ProgramBudgetRow,
} from "./budgetControls";
import { FUNDING_PREPARATION } from "./rewardFundingPlan";

const row = (programId: string, totalPoints: number, reservedPoints = 0): ProgramBudgetRow =>
  ({ programId: programId as never, totalPoints, reservedPoints, status: "ACTIVE", fundingVerified: false });

const PROGRAMS = [row("SIGNUP_BONUS", 1_000_000), row("CORE_SWAP", 1_000_000), row("REFERRAL_MILESTONE", 2_000)];

describe("required on-chain budget", () => {
  it("is the sum of program ceilings plus already-claimed FLOW", () => {
    expect(requiredOnChainBudgetFlow(PROGRAMS, 11)).toBe(2_002_011);
    expect(requiredOnChainBudgetFlow(PROGRAMS, 0)).toBe(2_002_000);
  });
});

describe("setCampaignBudget calldata", () => {
  it("matches the frozen owner-prepared transaction byte-for-byte", () => {
    expect(buildSetBudgetCalldata(2_002_011)).toBe(FUNDING_PREPARATION.budgetTx.calldata);
  });
  it("encodes the exact wei amount", () => {
    expect(buildSetBudgetCalldata(1)).toBe("0x7bc0db460000000000000000000000000000000000000000000000000de0b6b3a7640000");
  });
});

describe("proposal validation", () => {
  const base = {
    programId: "CORE_SWAP", newBudget: 1_000_000, current: row("CORE_SWAP", 3_000),
    committedPoints: 0, liveFreeFlow: 2_499_989, combinedNewTotalFlow: 2_002_000,
  };
  it("accepts the approved 1M Core Swap raise", () => {
    const v = validateProposal(base);
    expect(v.ok).toBe(true);
    expect(v.checks.every((c) => c.pass)).toBe(true);
  });
  it("rejects unknown programs, non-positive and non-integer budgets", () => {
    expect(validateProposal({ ...base, programId: "NOPE" }).ok).toBe(false);
    expect(validateProposal({ ...base, newBudget: 0 }).ok).toBe(false);
    expect(validateProposal({ ...base, newBudget: 1.5 }).ok).toBe(false);
  });
  it("rejects a ceiling below committed liabilities", () => {
    const v = validateProposal({ ...base, newBudget: 100, committedPoints: 2_300 });
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === "NOT_BELOW_COMMITTED")!.pass).toBe(false);
  });
  it("rejects an unchanged value", () => {
    expect(validateProposal({ ...base, newBudget: 3_000 }).ok).toBe(false);
  });
  it("rejects when combined ceilings exceed live distributor backing", () => {
    const v = validateProposal({ ...base, liveFreeFlow: 1_500_000 });
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === "BACKING_AVAILABLE")!.pass).toBe(false);
  });
  it("fails closed when live backing is unavailable", () => {
    expect(validateProposal({ ...base, liveFreeFlow: null }).ok).toBe(false);
  });
});

describe("on-chain budget tx verification", () => {
  const calldata = buildSetBudgetCalldata(2_002_011);
  const facts: BudgetTxFacts = {
    chainId: 677,
    txTo: "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922",
    txFrom: "0x88a4cc1f5771523baeb83daeea07d323a3ce9507",
    txInput: calldata,
    receiptStatus: "success",
    blockHash: "0xaaa",
    canonicalBlockHash: "0xaaa",
    confirmations: 3n,
    eventNewBudgetWei: 2_002_011n * 10n ** 18n,
    senderHasBudgetManagerRole: true,
  };
  const expected = { distributor: "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922", expectedCalldata: calldata, expectedNewBudgetWei: 2_002_011n * 10n ** 18n };

  it("accepts the exact authorized transaction", () => {
    expect(verifyBudgetTxIdentity(facts, expected).complete).toBe(true);
  });
  it("rejects wrong chain, reverted receipt and non-canonical block", () => {
    expect(verifyBudgetTxIdentity({ ...facts, chainId: 56 }, expected).complete).toBe(false);
    expect(verifyBudgetTxIdentity({ ...facts, receiptStatus: "reverted" }, expected).complete).toBe(false);
    expect(verifyBudgetTxIdentity({ ...facts, canonicalBlockHash: "0xbbb" }, expected).complete).toBe(false);
    expect(verifyBudgetTxIdentity({ ...facts, confirmations: 0n }, expected).complete).toBe(false);
  });
  it("rejects wrong distributor, calldata drift and missing role", () => {
    expect(verifyBudgetTxIdentity({ ...facts, txTo: "0x0000000000000000000000000000000000000001" }, expected).complete).toBe(false);
    expect(verifyBudgetTxIdentity({ ...facts, txInput: buildSetBudgetCalldata(2_002_012) }, expected).complete).toBe(false);
    expect(verifyBudgetTxIdentity({ ...facts, senderHasBudgetManagerRole: false }, expected).complete).toBe(false);
  });
  it("rejects missing or mismatched CampaignBudgetUpdated event", () => {
    expect(verifyBudgetTxIdentity({ ...facts, eventNewBudgetWei: null }, expected).complete).toBe(false);
    expect(verifyBudgetTxIdentity({ ...facts, eventNewBudgetWei: 1n * 10n ** 18n }, expected).complete).toBe(false);
  });
});

describe("budget impact review", () => {
  it("reports before/after remaining and headroom", () => {
    const i = budgetImpact(row("CORE_SWAP", 3_000, 10), 1_000_000, 10);
    expect(i.direction).toBe("INCREASE");
    expect(i.delta).toBe(997_000);
    expect(i.remainingBefore).toBe(2_990);
    expect(i.remainingAfter).toBe(999_990);
    expect(i.headroomAfter).toBe(999_990);
  });
});
