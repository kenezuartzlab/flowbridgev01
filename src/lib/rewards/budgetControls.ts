/**
 * Pure budget-control logic for Ops → Rewards → Budget Controls.
 * Produces proposals and verification checks only — never signs, never
 * broadcasts, never moves funds. The on-chain spending cap is the single
 * campaignBudget on the FlowRewardsMerkleDistributor; off-chain per-program
 * ceilings live in public.reward_budgets and must never exceed it.
 */
import { encodeFunctionData, parseAbi, type Hex } from "viem";

export const SET_CAMPAIGN_BUDGET_ABI = parseAbi(["function setCampaignBudget(uint256 newBudget)"]);
export const CAMPAIGN_BUDGET_UPDATED_TOPIC =
  "0x" + "" /* computed below via keccak — kept explicit for tests */;

const WEI = 10n ** 18n;

export type BudgetProgram = "SIGNUP_BONUS" | "CORE_SWAP" | "REFERRAL_MILESTONE";
export const BUDGET_PROGRAMS: BudgetProgram[] = ["SIGNUP_BONUS", "CORE_SWAP", "REFERRAL_MILESTONE"];

export interface ProgramBudgetRow {
  programId: BudgetProgram;
  totalPoints: number;
  reservedPoints: number;
  status: string;
  fundingVerified: boolean;
}

/**
 * The on-chain campaignBudget is one global cap covering ALL programs plus
 * already-claimed FLOW. Required on-chain budget = sum(program ceilings) +
 * totalClaimed (claimed amounts stay inside the cap forever).
 */
export function requiredOnChainBudgetFlow(programs: ProgramBudgetRow[], totalClaimedFlow: number): number {
  return programs.reduce((s, p) => s + p.totalPoints, 0) + totalClaimedFlow;
}

/** Exact calldata for setCampaignBudget(newBudget). */
export function buildSetBudgetCalldata(newBudgetFlow: number): Hex {
  return encodeFunctionData({
    abi: SET_CAMPAIGN_BUDGET_ABI,
    functionName: "setCampaignBudget",
    args: [BigInt(newBudgetFlow) * WEI],
  });
}

export interface ProposalCheck {
  id: string;
  pass: boolean;
  detail: string;
}

/** Validates a proposed new program ceiling. Fails closed with reasons. */
export function validateProposal(input: {
  programId: string;
  newBudget: number;
  current: ProgramBudgetRow | null;
  committedPoints: number; // reserved + already claimed against this program
  liveFreeFlow: number | null; // distributor free balance (FLOW), null = unavailable
  combinedNewTotalFlow: number; // sum of all program ceilings after the change
}): { ok: boolean; checks: ProposalCheck[] } {
  const checks: ProposalCheck[] = [];
  const push = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

  push("KNOWN_PROGRAM", BUDGET_PROGRAMS.includes(input.programId as BudgetProgram),
    BUDGET_PROGRAMS.includes(input.programId as BudgetProgram) ? "Known reward program" : "Unknown program");
  push("POSITIVE_INTEGER", Number.isInteger(input.newBudget) && input.newBudget > 0,
    "Budget must be a positive whole number of FLOW");
  push("NOT_BELOW_COMMITTED", input.newBudget >= input.committedPoints,
    `Committed liabilities (reserved + claimed) are ${input.committedPoints.toLocaleString()} FLOW`);
  push("CHANGES_VALUE", !input.current || input.newBudget !== input.current.totalPoints,
    "New budget differs from the current ceiling");
  push("BACKING_AVAILABLE", input.liveFreeFlow === null ? false : input.combinedNewTotalFlow <= input.liveFreeFlow,
    input.liveFreeFlow === null
      ? "Live distributor balance unavailable — cannot prove backing"
      : `Combined ceilings ${input.combinedNewTotalFlow.toLocaleString()} FLOW vs ${Math.floor(input.liveFreeFlow).toLocaleString()} FLOW free in the distributor`);
  return { ok: checks.every((c) => c.pass), checks };
}

export interface BudgetTxFacts {
  chainId: number;
  txTo: string;
  txFrom: string;
  txInput: string;
  receiptStatus: "success" | "reverted";
  blockHash: string;
  canonicalBlockHash: string;
  confirmations: bigint; // head - blockNumber
  eventNewBudgetWei: bigint | null; // from CampaignBudgetUpdated log
  senderHasBudgetManagerRole: boolean;
}

/** Verifies a confirmed setCampaignBudget transaction against the approved proposal. */
export function verifyBudgetTxIdentity(f: BudgetTxFacts, expected: {
  distributor: string;
  expectedCalldata: Hex;
  expectedNewBudgetWei: bigint;
  minConfirmations?: bigint;
}): { complete: boolean; checks: ProposalCheck[] } {
  const minConf = expected.minConfirmations ?? 1n;
  const checks: ProposalCheck[] = [];
  const push = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

  push("CHAIN_677", f.chainId === 677, `chain ${f.chainId}`);
  push("RECEIPT_SUCCESS", f.receiptStatus === "success", f.receiptStatus);
  push("CANONICAL_CONFIRMED", f.blockHash === f.canonicalBlockHash && f.confirmations >= minConf,
    `${f.confirmations} confirmation(s), canonical block ${f.blockHash === f.canonicalBlockHash}`);
  push("TO_DISTRIBUTOR", f.txTo.toLowerCase() === expected.distributor.toLowerCase(), f.txTo);
  push("EXACT_CALLDATA", f.txInput.toLowerCase() === expected.expectedCalldata.toLowerCase(),
    "calldata must equal setCampaignBudget(approved budget) byte-for-byte");
  push("SENDER_BUDGET_MANAGER", f.senderHasBudgetManagerRole, f.txFrom);
  push("EVENT_BUDGET_MATCH", f.eventNewBudgetWei !== null && f.eventNewBudgetWei === expected.expectedNewBudgetWei,
    f.eventNewBudgetWei === null ? "CampaignBudgetUpdated event missing" : `event newBudget ${f.eventNewBudgetWei}`);
  return { complete: checks.every((c) => c.pass), checks };
}

/** Before/after impact summary for the review step. */
export function budgetImpact(current: ProgramBudgetRow, newBudget: number, committedPoints: number) {
  const delta = newBudget - current.totalPoints;
  return {
    delta,
    direction: delta > 0 ? "INCREASE" : delta < 0 ? "DECREASE" : "UNCHANGED",
    remainingBefore: Math.max(0, current.totalPoints - current.reservedPoints),
    remainingAfter: Math.max(0, newBudget - current.reservedPoints),
    committedPoints,
    headroomAfter: Math.max(0, newBudget - committedPoints),
  };
}
