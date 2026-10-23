/**
 * Admin-only reward solvency + historical reconciliation report. READ-ONLY:
 * SELECTs and eth_call only. Never writes balances, budgets or contracts.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { reconcileAll, mainnetSwapEvidence, OWNER_REVIEW_DECISIONS, MAINNET_CHAIN_ID, type ReconAccountInput, type ReconLedgerRow } from "./historicalReconciliation";
import {
  APPROVED_INITIAL_BUDGETS, FUNDING_PREPARATION, TOTAL_REQUIRED_BACKING, allocateBacking, buildDraftAllocation, fundingShortfallWei,
  MAINNET_PAYOUT_AUDIT, MAINNET_PROMOTION_PACKAGE, milestoneFundingOptions, payoutContractSufficient, programSolvency,
  summarizeFundedDraft, swapFundingOptions, type ProgramId,
} from "./rewardFundingPlan";
import { MAINNET_EPOCH_DRAFTS, draftFlowLabel } from "./mainnetEpochDraft";
import { MAINNET_EPOCH_MANIFESTS } from "./mainnetEpochManifest";
import { payoutRoundStatus, type PayoutRoundStatus } from "./payoutRoundStatus";
import { PUBLIC_MAINNET_FLOW_CLAIMS } from "./publicClaimPolicy";
import { buildSettlement, readCanaryStatus } from "./settlement.server";

const DISTRIBUTOR = MAINNET_PAYOUT_AUDIT.address as Address;
const ABI = parseAbi(["function freeBalance() view returns (uint256)", "function totalReserved() view returns (uint256)", "function paused() view returns (bool)", "function campaignBudget() view returns (uint256)"]);
const SETTLE_ABI = parseAbi(["function epochCount() view returns (uint256)", "function totalClaimed() view returns (uint256)", "function minPublishDelay() view returns (uint64)"]);
const TOKEN_ABI = parseAbi(["function balanceOf(address) view returns (uint256)", "function token() view returns (address)"]);

const MILESTONE_REASONS = ["REFERRAL_FIRST_QUALIFYING_SWAP", "REFERRAL_100_USD_VOLUME", "REFERRAL_MILESTONE_FIRST_SWAP", "REFERRAL_MILESTONE_VOLUME_100", "REFERRAL_MILESTONE_ACTIVE_DAYS_3", "REFERRAL_3_ACTIVE_DAYS"];

async function readDistributor() {
  try {
    const c = createPublicClient({ transport: http("https://rpc.botchain.ai") });
    const [free, reserved, paused, block, budget] = await Promise.all([
      c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "freeBalance" }),
      c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "totalReserved" }),
      c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "paused" }),
      c.getBlockNumber(),
      c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "campaignBudget" }),
    ]);
    return { freeFlow: Number(free / 10n ** 18n), freeWei: free.toString(), reservedFlow: Number(reserved / 10n ** 18n), campaignBudgetFlow: Number(budget / 10n ** 18n), paused, block: Number(block) };
  } catch {
    return null;
  }
}

export async function buildRewardSolvencyReport() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [profiles, ledger, budgets, reservations, chain] = await Promise.all([
    supabaseAdmin.from("profiles").select("id,created_at,flow_points,points_self,points_referral_signup,claimed_tokens,wallet_address").limit(10000),
    supabaseAdmin.from("flow_points_ledger").select("id,user_id,reason,points,chain_id,created_at,activity_key,tx_hash,source_log_index,verified_usd,day_key,metadata,reservation_id,funding_state,program_id,policy_version,wallet_address,provenance_state").limit(50000),
    supabaseAdmin.from("reward_budgets").select("program_id,total_points,reserved_points,status,funding_verified"),
    supabaseAdmin.from("reward_reservations").select("program_id,points"),
    readDistributor(),
  ]);
  if (profiles.error || ledger.error || budgets.error || reservations.error) throw new Error("Reward data unavailable");

  const byUser = new Map<string, ReconLedgerRow[]>();
  for (const l of ledger.data ?? []) {
    const md = (l.metadata ?? {}) as Record<string, unknown>;
    const r: ReconLedgerRow = {
      id: l.id, reason: l.reason, points: l.points, chainId: l.chain_id, createdAt: new Date(l.created_at).toISOString(),
      evidenceKey: l.activity_key ?? (l.tx_hash ? `${l.tx_hash.toLowerCase()}:${l.source_log_index ?? ""}` : null),
      verifiedUsd: l.verified_usd == null ? null : Number(l.verified_usd), dayKey: l.day_key,
      refereeId: typeof md.refereeId === "string" ? md.refereeId : null, reservationId: l.reservation_id, fundingState: l.funding_state, provenanceState: l.provenance_state,
    };
    byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), r]);
  }
  const accounts: ReconAccountInput[] = (profiles.data ?? []).map((p) => ({
    userId: p.id, createdAt: new Date(p.created_at).toISOString(), storedFlowPoints: p.flow_points + (byUser.get(p.id) ?? []).filter((r) => r.reason === 'SIGNUP_BONUS_REFEREE' || r.reason === 'REFERRAL_SIGNUP_BONUS').reduce((s, r) => s + r.points, 0),
    storedPointsSelf: p.points_self, storedReferralSignup: p.points_referral_signup, ledger: byUser.get(p.id) ?? [],
  }));
  const recon = reconcileAll(accounts, OWNER_REVIEW_DECISIONS);

  const allRows = [...byUser.values()].flat();
  const mainnetSwaps = [...byUser.values()].flatMap((rows) => mainnetSwapEvidence(rows));
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const earnersByUser = [...byUser.entries()].filter(([, rows]) => mainnetSwapEvidence(rows).some((r) => r.createdAt >= since30)).length;
  const swapEarned = mainnetSwaps.reduce((s, r) => s + r.points, 0);
  const milestoneSupported = recon.results.reduce((s, r) => s + r.breakdown.referralMilestone, 0);
  const milestoneRecorded = allRows.filter((r) => MILESTONE_REASONS.includes(r.reason)).reduce((s, r) => s + r.points, 0);
  const signupAwarded = allRows.filter((r) => r.reason === "SIGNUP_BONUS_REFEREE" || r.reason === "REFERRAL_SIGNUP_BONUS").reduce((s, r) => s + r.points, 0);
  const activeReferrers = [...byUser.values()].filter((rows) => rows.some((r) => MILESTONE_REASONS.includes(r.reason))).length;

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
    row("CORE_SWAP", swapEarned, mainnetSwaps.filter((r) => r.fundingState !== 'FUNDED').reduce((s, r) => s + r.points, 0)),
    row("REFERRAL_MILESTONE", milestoneRecorded, milestoneRecorded),
    programSolvency({ programId: "OTHER", authorizedBudget: 0, backingVerified: false, reserved: 0, earned: 0, claimed: 0, unfunded: 0 }),
  ];

  const settlement = await buildSettlement({
    admin: supabaseAdmin,
    recon: recon.results,
    ledger: (ledger.data ?? []) as never,
    wallets: new Map((profiles.data ?? []).map((p) => [p.id, p.wallet_address])),
    budgets: (budgets.data ?? []) as never,
    profiles: new Map((profiles.data ?? []).map((p) => [p.id, { createdAt: p.created_at ? new Date(p.created_at).toISOString() : null, wallet: p.wallet_address }])),
  });

  return {
    generatedAt: new Date().toISOString(),
    claims: PUBLIC_MAINNET_FLOW_CLAIMS
      ? { mainnet: "PUBLIC" as const, reason: "Public claims are on. Users can claim only a published, open, funded allocation for their bound wallet; each new round still needs authorized publisher signing." }
      : { mainnet: "LOCKED" as const, reason: "Public Mainnet claims are switched off." },
    rounds: await (async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const out: { epochId: number; status: PayoutRoundStatus; leaves: number; claimedWallets: number | null; totalFlow: number; claimStartIso: string | null; claimEndIso: string | null; source: string }[] = [];
      try {
        const { countRoundClaims } = await import("./settlement.server");
        const { data } = await supabaseAdmin.from("reward_settlement_batches").select("id,fingerprint,epoch_id,total_wei,claim_start,claim_end,leaves,publication_verified_at,source").eq("chain_id", MAINNET_CHAIN_ID).order("epoch_id");
        const { resolveBatchSchedule } = await import('./scheduleRenewal.server');
        const rows = await Promise.all((data ?? []).map(b => resolveBatchSchedule(supabaseAdmin,b)));
        // V36.1: verified on-chain isClaimed per leaf; null when any read fails (never guessed).
        const counts = await Promise.all(rows.map(async (b) => {
          const ls = Array.isArray(b.leaves) ? (b.leaves as any[]) : [];
          if (!b.publication_verified_at || !ls.length) return null;
          const c = await countRoundClaims(b.epoch_id, ls.map((l, i) => Number(l?.index ?? i))).catch(() => null);
          return c && !c.unreadable ? c.claimed : null;
        }));
        rows.forEach((b, i) => {
          const leaves = Array.isArray(b.leaves) ? b.leaves.length : 0;
          const claimedLeaves = counts[i];
          // Display only: JSON numeric values may use exponent notation; never truncate at the decimal point.
          out.push({ epochId: b.epoch_id, leaves, claimedWallets: claimedLeaves, totalFlow: Number(b.total_wei) / 1e18, source: b.source,
            claimStartIso: b.claim_start ? new Date(Number(b.claim_start) * 1000).toISOString() : null, claimEndIso: b.claim_end ? new Date(Number(b.claim_end) * 1000).toISOString() : null,
            status: payoutRoundStatus({ epochId: b.epoch_id, publishedOnChain: !!b.publication_verified_at, claimStart: Number(b.claim_start), claimEnd: Number(b.claim_end), leaves, claimedLeaves, nowSec }) });
        });
      } catch { /* report without rounds */ }
      return out;
    })(),
    programs,
    signup: {
      authorized: signupRow.authorizedBudget, reserved: signupRow.reserved, awarded: signupAwarded,
      releasedOrVoided: 0, remaining: signupRow.remaining, invariantOk: signupRow.invariantOk,
      onChainBacking: signupRow.backingVerified ? "VERIFIED" : "NOT YET VERIFIED",
    },
    distributor: { address: DISTRIBUTOR, chainId: MAINNET_CHAIN_ID, live: chain },
    reconciliation: {
      accounts: recon.accounts, counts: recon.counts, pass: recon.pass, pendingReviewTotal: recon.pendingReviewTotal, nonclaimableHistoricalTotal: recon.nonclaimableHistoricalTotal, testnetExcludedTotal: recon.testnetExcludedTotal,
      authoritativeTotal: recon.authoritativeTotal, storedTotal: recon.storedTotal,
      // Per-account rows use opaque ids only — no email or wallet.
      flagged: recon.results.filter((r) => r.classification !== "MATCH" && r.classification !== "EXPLAINED_DIFFERENCE")
        .map((r, index) => ({ account: `Account ${index + 1}`, stored: r.stored, authoritative: r.authoritative, pendingReview: r.pendingReview, classification: r.classification, flags: r.flags.map((f) => f.split(':')[0]) })),
    },
    funding: {
      swap: swapFundingOptions({
        verifiedAccrualToDate: swapEarned, points7d: mainnetSwaps.filter((r) => r.createdAt >= since7).reduce((s, r) => s + r.points, 0),
        activeEarners30d: earnersByUser, eligibleBoundWallets: (profiles.data ?? []).filter((p) => p.wallet_address).length, dailyCap: 1000, safetyBuffer: 2,
      }),
      milestone: milestoneFundingOptions({ qualifiedMilestonePoints30d: milestoneSupported, activeReferrers, monthlyRewardedReferralCap: 10, maxMilestonePerReferral: 100, safetyBuffer: 1 }),
    },
    fundingPreparation: (() => {
      const free = chain ? BigInt(chain.freeWei) : null;
      return {
        approvedBudgets: APPROVED_INITIAL_BUDGETS, totalRequired: TOTAL_REQUIRED_BACKING,
        liveFreeFlow: chain?.freeFlow ?? null, liveCampaignBudgetFlow: chain?.campaignBudgetFlow ?? null,
        additionalRequiredFlow: free == null ? null : Number(fundingShortfallWei(free) / 10n ** 18n),
        backing: free == null ? null : allocateBacking(free),
        budgetTx: FUNDING_PREPARATION.budgetTx, signed: false, broadcast: false,
      };
    })(),
    draftAllocation: (() => {
      const wallet = new Map((profiles.data ?? []).map((p) => [p.id, p.wallet_address]));
      const reconDraft = buildDraftAllocation(recon.results.map((r) => ({ userId: r.userId, wallet: wallet.get(r.userId) ?? null, classification: r.classification, authoritative: r.authoritative, pendingReview: r.pendingReview })), { epochId: 2 });
      // Funded-only: the preview mirrors the publishable settlement path; earned-but-unfunded
      // points are reported as excluded, never added to a batch. Admin view: counts only.
      return summarizeFundedDraft({ reconTotalPoints: reconDraft.totalPoints, fundedWallets: settlement.readiness?.nextBatchWallets ?? 0, fundedTotalPoints: settlement.readiness?.nextBatchFlow ?? 0 });
    })(),
    unfundedSwapAwards: [...mainnetSwaps.filter(r => r.fundingState !== 'FUNDED').reduce((groups, r) => groups.set(r.points, (groups.get(r.points) ?? 0) + 1), new Map<number, number>())].map(([points, awards]) => ({ points, awards })),
    // Prepared allocation rounds: root + schedule only, never signed or broadcast here.
    publication: MAINNET_EPOCH_DRAFTS.map((d) => ({
      epochId: d.epochId,
      programId: d.programId,
      root: d.root,
      allocationFlow: draftFlowLabel(d),
      leaves: d.entitlements.length,
      claimStartIso: new Date(d.claimStart * 1000).toISOString(),
      claimEndIso: new Date(d.claimEnd * 1000).toISOString(),
      signBeforeIso: new Date(d.signBefore * 1000).toISOString(),
      published: d.publicationTxHash != null || MAINNET_EPOCH_MANIFESTS.some((m) => m.epochId === d.epochId && m.root === d.root),
      signed: false,
      broadcast: false,
    })),
    settlement,
    canary: await readCanaryStatus(),
    payout: { sufficient: payoutContractSufficient(), capabilities: MAINNET_PAYOUT_AUDIT.capabilities, promotionPackage: MAINNET_PROMOTION_PACKAGE },
  };
}
export type RewardSolvencyReport = Awaited<ReturnType<typeof buildRewardSolvencyReport>>;
