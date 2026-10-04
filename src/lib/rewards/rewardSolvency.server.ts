/**
 * Admin-only reward solvency + historical reconciliation report. READ-ONLY:
 * SELECTs and eth_call only. Never writes balances, budgets or contracts.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { reconcileAll, mainnetSwapEvidence, MAINNET_CHAIN_ID, type ReconAccountInput, type ReconLedgerRow } from "./historicalReconciliation";
import {
  MAINNET_PAYOUT_AUDIT, MAINNET_PROMOTION_PACKAGE, milestoneFundingOptions, payoutContractSufficient, programSolvency,
  swapFundingOptions, type ProgramId,
} from "./rewardFundingPlan";

const DISTRIBUTOR = MAINNET_PAYOUT_AUDIT.address as Address;
const ABI = parseAbi(["function freeBalance() view returns (uint256)", "function totalReserved() view returns (uint256)", "function paused() view returns (bool)"]);
const MILESTONE_REASONS = ["REFERRAL_MILESTONE_FIRST_SWAP", "REFERRAL_MILESTONE_VOLUME_100", "REFERRAL_MILESTONE_ACTIVE_DAYS_3", "REFERRAL_3_ACTIVE_DAYS"];

async function readDistributor() {
  try {
    const c = createPublicClient({ transport: http("https://rpc.botchain.ai") });
    const [free, reserved, paused, block] = await Promise.all([
      c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "freeBalance" }),
      c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "totalReserved" }),
      c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "paused" }),
      c.getBlockNumber(),
    ]);
    return { freeFlow: Number(free / 10n ** 18n), reservedFlow: Number(reserved / 10n ** 18n), paused, block: Number(block) };
  } catch {
    return null;
  }
}

export async function buildRewardSolvencyReport() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [profiles, ledger, budgets, reservations, chain] = await Promise.all([
    supabaseAdmin.from("profiles").select("id,created_at,flow_points,points_self,points_referral_signup,claimed_tokens,wallet_address").limit(10000),
    supabaseAdmin.from("flow_points_ledger").select("id,user_id,reason,points,chain_id,created_at,activity_key,tx_hash,source_log_index,verified_usd,day_key,metadata,reservation_id,funding_state,program_id").limit(50000),
    supabaseAdmin.from("reward_budgets").select("program_id,total_points,reserved_points,status,funding_verified"),
    supabaseAdmin.from("reward_reservations").select("program_id,points"),
    readDistributor(),
  ]);
  if (profiles.error || ledger.error || budgets.error) throw new Error("Reward data unavailable");

  const byUser = new Map<string, ReconLedgerRow[]>();
  for (const l of ledger.data ?? []) {
    const md = (l.metadata ?? {}) as Record<string, unknown>;
    const r: ReconLedgerRow = {
      id: l.id, reason: l.reason, points: l.points, chainId: l.chain_id, createdAt: new Date(l.created_at).toISOString(),
      evidenceKey: l.activity_key ?? (l.tx_hash ? `${l.tx_hash.toLowerCase()}:${l.source_log_index ?? ""}` : null),
      verifiedUsd: l.verified_usd == null ? null : Number(l.verified_usd), dayKey: l.day_key,
      refereeId: typeof md.refereeId === "string" ? md.refereeId : null, reservationId: l.reservation_id, fundingState: l.funding_state,
    };
    byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), r]);
  }
  const accounts: ReconAccountInput[] = (profiles.data ?? []).map((p) => ({
    userId: p.id, createdAt: new Date(p.created_at).toISOString(), storedFlowPoints: p.flow_points,
    storedPointsSelf: p.points_self, storedReferralSignup: p.points_referral_signup, ledger: byUser.get(p.id) ?? [],
  }));
  const recon = reconcileAll(accounts);

  const allRows = [...byUser.values()].flat();
  const mainnetSwaps = [...byUser.values()].flatMap((rows) => mainnetSwapEvidence(rows));
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const earnersByUser = [...byUser.entries()].filter(([, rows]) => mainnetSwapEvidence(rows).some((r) => r.createdAt >= since30)).length;
  const swapEarned = mainnetSwaps.reduce((s, r) => s + r.points, 0);
  const milestoneSupported = recon.results.reduce((s, r) => s + r.breakdown.referralMilestone, 0);
  const milestoneRecorded = allRows.filter((r) => MILESTONE_REASONS.includes(r.reason)).reduce((s, r) => s + r.points, 0);
  const signupAwarded = allRows.filter((r) => r.reason === "SIGNUP_BONUS_REFEREE" || r.reason === "REFERRAL_SIGNUP_BONUS").reduce((s, r) => s + r.points, 0);
  const activeReferrers = new Set(allRows.filter((r) => MILESTONE_REASONS.includes(r.reason) && r.createdAt >= since30).map((r) => r.id)).size > 0
    ? new Set([...byUser.entries()].filter(([, rows]) => rows.some((r) => MILESTONE_REASONS.includes(r.reason))).map(([u]) => u)).size : 0;

  const budget = (id: string) => (budgets.data ?? []).find((b) => b.program_id === id);
  const reservedFor = (id: string) => (reservations.data ?? []).filter((r) => r.program_id === id).reduce((s, r) => s + r.points, 0);
  const row = (programId: ProgramId, earned: number, unfunded: number) => {
    const b = budget(programId);
    return programSolvency({
      programId, authorizedBudget: Number(b?.total_points ?? 0), backingVerified: !!b?.funding_verified,
      reserved: Math.max(Number(b?.reserved_points ?? 0), reservedFor(programId)), earned, claimed: 0, unfunded,
    });
  };
  const signupRow = row("SIGNUP_BONUS", signupAwarded, 0);
  const programs = [
    signupRow,
    row("CORE_SWAP", swapEarned, swapEarned),
    row("REFERRAL_MILESTONE", milestoneRecorded, milestoneRecorded),
    programSolvency({ programId: "OTHER", authorizedBudget: 0, backingVerified: false, reserved: 0, earned: 0, claimed: 0, unfunded: 0 }),
  ];

  return {
    generatedAt: new Date().toISOString(),
    claims: { mainnet: "LOCKED" as const, reason: "Mainnet claims open only after funding and historical reconciliation are verified." },
    programs,
    signup: {
      authorized: signupRow.authorizedBudget, reserved: signupRow.reserved, awarded: signupAwarded,
      releasedOrVoided: 0, remaining: signupRow.remaining, invariantOk: signupRow.invariantOk,
      onChainBacking: signupRow.backingVerified ? "VERIFIED" : "NOT YET VERIFIED",
    },
    distributor: { address: DISTRIBUTOR, chainId: MAINNET_CHAIN_ID, live: chain },
    reconciliation: {
      accounts: recon.accounts, counts: recon.counts, pass: recon.pass, pendingReviewTotal: recon.pendingReviewTotal,
      authoritativeTotal: recon.authoritativeTotal, storedTotal: recon.storedTotal,
      // Per-account rows use opaque ids only — no email or wallet.
      flagged: recon.results.filter((r) => r.classification !== "MATCH" && r.classification !== "EXPLAINED_DIFFERENCE")
        .map((r) => ({ account: r.userId.slice(0, 8), stored: r.stored, authoritative: r.authoritative, pendingReview: r.pendingReview, classification: r.classification, flags: r.flags })),
    },
    funding: {
      swap: swapFundingOptions({
        verifiedAccrualToDate: swapEarned, points7d: mainnetSwaps.filter((r) => r.createdAt >= since7).reduce((s, r) => s + r.points, 0),
        activeEarners30d: earnersByUser, eligibleBoundWallets: (profiles.data ?? []).filter((p) => p.wallet_address).length, dailyCap: 1000, safetyBuffer: 2,
      }),
      milestone: milestoneFundingOptions({ qualifiedMilestonePoints30d: milestoneSupported, activeReferrers, monthlyRewardedReferralCap: 10, maxMilestonePerReferral: 100, safetyBuffer: 1 }),
    },
    payout: { sufficient: payoutContractSufficient(), capabilities: MAINNET_PAYOUT_AUDIT.capabilities, promotionPackage: MAINNET_PROMOTION_PACKAGE },
  };
}
export type RewardSolvencyReport = Awaited<ReturnType<typeof buildRewardSolvencyReport>>;
