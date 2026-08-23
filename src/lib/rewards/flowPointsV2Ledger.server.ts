/**
 * V12.4A — server-only FLOW Points V2 ledger + referral milestone engine.
 *
 * All economics here are decided from server-derived values only (verified USD
 * from canonical on-chain evidence). Idempotency is enforced twice: a unique
 * index on `flow_points_ledger.activity_key`, and a unique
 * (referrer, referee, milestone) constraint on `referral_milestone_awards`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRewardSettings } from "@/lib/appConfig.server";
import {
  DEFAULT_FLOW_POINTS_V2_POLICY,
  FLOW_POINTS_V2_VERSION,
  type FlowPointsV2Policy,
  type LedgerReason,
  type ReferralMilestoneId,
  coreSwapAward,
  isFlowPointsV2Active,
  referralMilestonesDue,
  referralMonthlyCapReached,
  referralRelationshipEligible,
  utcDayKey,
  utcMonthKey,
} from "./flowPointsV2";

/** Merge admin-published reward settings into the typed V2 policy. */
export async function resolveFlowPointsV2Policy(): Promise<FlowPointsV2Policy> {
  const s: any = await getRewardSettings();
  const d = DEFAULT_FLOW_POINTS_V2_POLICY;
  const n = (v: any, f: number) => (Number.isFinite(Number(v)) ? Number(v) : f);
  return {
    version: FLOW_POINTS_V2_VERSION,
    effectiveAt: typeof s?.v2EffectiveAt === "string" && s.v2EffectiveAt ? s.v2EffectiveAt : d.effectiveAt,
    minSwapUsd: n(s?.minSwapUsd, d.minSwapUsd),
    dailyCoreSwapCap: n(s?.dailyCoreSwapCap, d.dailyCoreSwapCap),
    referralMilestoneFirstSwap: n(s?.referralMilestoneFirstSwap, d.referralMilestoneFirstSwap),
    referralMilestoneVolumeUsd: n(s?.referralClaimMinSwapUsd, d.referralMilestoneVolumeUsd),
    referralMilestoneVolume: n(s?.referralMilestoneVolume, d.referralMilestoneVolume),
    referralMilestoneActiveDays: d.referralMilestoneActiveDays,
    referralMilestoneActiveDaysPoints: n(
      s?.referralMilestoneActiveDaysPoints,
      d.referralMilestoneActiveDaysPoints,
    ),
    referralMaxPerReferredUser: n(s?.referralMaxPerReferredUser, d.referralMaxPerReferredUser),
    referralMonthlyCap: n(s?.referralMonthlyCap, d.referralMonthlyCap),
  };
}

/** Sum of core-swap points already granted to a bound wallet for a UTC day. */
export async function awardedCoreSwapPointsToday(walletAddress: string, dayKey: string) {
  const { data } = await supabaseAdmin
    .from("flow_points_ledger")
    .select("points")
    .eq("wallet_address", walletAddress)
    .eq("reason", "CORE_SWAP")
    .eq("day_key", dayKey);
  return (data ?? []).reduce((sum: number, r: any) => sum + Number(r.points ?? 0), 0);
}

export interface CoreSwapAccrual {
  award: number;
  base: number;
  reason: LedgerReason;
  /** false when the canonical activity was already recorded (replay). */
  recorded: boolean;
  policy: FlowPointsV2Policy;
  /** V15.3M — set when settlement was refused for missing canonical identity. */
  failClosedReason?: 'MISSING_VERIFIED_ACTIVITY_ID' | 'MISSING_SOURCE_LOG_INDEX';
}

/**
 * Compute and record the V2 core-swap accrual for one canonical verified
 * activity.
 *
 * V15.3M — canonical economic identity:
 *   • `verifiedActivityId` is the economic idempotency identity (unique index).
 *   • `sourceLogIndex` is the ACTUAL receipt log index of the canonical
 *     SwapActivity event. It is never substituted or invented — `?? 0` is
 *     forbidden, because log index 0 is a real event position.
 *   • Missing either value fails closed: no ledger row, no points.
 * Returns `award: 0, recorded: false` for a replay of the same activity.
 */
export async function accrueCoreSwapPoints(input: {
  userId: string;
  walletAddress: string;
  verifiedUsd: number;
  chainId: number;
  txHash: string;
  /** Canonical verified_activities.activity_id. Required. */
  verifiedActivityId: string;
  /** Actual canonical SwapActivity receipt log index. Required. */
  sourceLogIndex: number;
  at?: Date;
}): Promise<CoreSwapAccrual> {
  const policy = await resolveFlowPointsV2Policy();
  const at = input.at ?? new Date();
  const dayKey = utcDayKey(at);
  const wallet = input.walletAddress.toLowerCase();

  const activityId = input.verifiedActivityId?.trim().toLowerCase();
  if (!activityId) {
    return {
      award: 0,
      base: 0,
      reason: "CORE_SWAP",
      recorded: false,
      policy,
      failClosedReason: "MISSING_VERIFIED_ACTIVITY_ID",
    };
  }
  const logIndex = input.sourceLogIndex;
  if (!Number.isInteger(logIndex) || logIndex < 0) {
    return {
      award: 0,
      base: 0,
      reason: "CORE_SWAP",
      recorded: false,
      policy,
      failClosedReason: "MISSING_SOURCE_LOG_INDEX",
    };
  }

  const activityKey = `${input.chainId}:${input.txHash.toLowerCase()}:${logIndex}`;

  const alreadyToday = await awardedCoreSwapPointsToday(wallet, dayKey);
  const computed = coreSwapAward(input.verifiedUsd, alreadyToday, policy);

  const { error } = await supabaseAdmin.from("flow_points_ledger").insert({
    user_id: input.userId,
    policy_version: policy.version,
    reason: computed.reason,
    points: computed.award,
    base_points: computed.base,
    verified_usd: input.verifiedUsd,
    chain_id: input.chainId,
    tx_hash: input.txHash.toLowerCase(),
    source_log_index: logIndex,
    verified_activity_id: activityId,
    activity_key: activityKey,
    wallet_address: wallet,
    day_key: dayKey,
    metadata: { dailyCoreSwapCap: policy.dailyCoreSwapCap, alreadyAwardedToday: alreadyToday },
  } as never);

  if (error) {
    // 23505 = the canonical activity is already in the ledger: never pay twice.
    return { award: 0, base: computed.base, reason: computed.reason, recorded: false, policy };
  }
  return {
    award: computed.award,
    base: computed.base,
    reason: computed.reason,
    recorded: true,
    policy,
  };
}

/** Qualified activity state for a referred user, derived from the V2 ledger. */
export async function refereeQualifiedState(userId: string) {
  const { data } = await supabaseAdmin
    .from("flow_points_ledger")
    .select("points, verified_usd, day_key")
    .eq("user_id", userId)
    .eq("reason", "CORE_SWAP");
  const rows = (data ?? []).filter((r: any) => Number(r.points ?? 0) > 0);
  const days = new Set(rows.map((r: any) => String(r.day_key ?? "")));
  return {
    qualifiedSwapCount: rows.length,
    qualifiedVolumeUsd: rows.reduce((s: number, r: any) => s + Number(r.verified_usd ?? 0), 0),
    qualifiedActiveDays: days.size,
  };
}

/**
 * Grant any due referral milestones to the referrer of `refereeId`.
 * Returns the total points granted (0 when nothing is due or a cap applies).
 */
export async function grantReferralMilestones(input: {
  refereeId: string;
  referrerId: string;
  refereeWalletBound: boolean;
  at?: Date;
}): Promise<{ granted: number; milestones: ReferralMilestoneId[] }> {
  const policy = await resolveFlowPointsV2Policy();
  const at = input.at ?? new Date();
  const monthKey = utcMonthKey(at);

  if (
    !referralRelationshipEligible({
      referrerId: input.referrerId,
      refereeId: input.refereeId,
      refereeWalletBound: input.refereeWalletBound,
    })
  ) {
    return { granted: 0, milestones: [] };
  }

  const [{ data: existing }, { data: monthRows }, state] = await Promise.all([
    supabaseAdmin
      .from("referral_milestone_awards")
      .select("milestone")
      .eq("referrer_id", input.referrerId)
      .eq("referee_id", input.refereeId),
    supabaseAdmin
      .from("referral_milestone_awards")
      .select("referee_id")
      .eq("referrer_id", input.referrerId)
      .eq("month_key", monthKey),
    refereeQualifiedState(input.refereeId),
  ]);

  const granted = (existing ?? []).map((r: any) => String(r.milestone) as ReferralMilestoneId);
  const rewardedReferees = new Set((monthRows ?? []).map((r: any) => String(r.referee_id)));
  if (
    referralMonthlyCapReached(rewardedReferees.size, rewardedReferees.has(input.refereeId), policy)
  ) {
    return { granted: 0, milestones: [] };
  }

  const due = referralMilestonesDue(state, granted, policy);
  if (due.length === 0) return { granted: 0, milestones: [] };

  const awarded: ReferralMilestoneId[] = [];
  let points = 0;
  for (const milestone of due) {
    const { error } = await supabaseAdmin.from("referral_milestone_awards").insert({
      referrer_id: input.referrerId,
      referee_id: input.refereeId,
      milestone: milestone.id,
      points: milestone.points,
      policy_version: policy.version,
      month_key: monthKey,
    });
    if (error) continue; // unique violation: milestone already paid
    await supabaseAdmin.from("flow_points_ledger").insert({
      user_id: input.referrerId,
      policy_version: policy.version,
      reason: milestone.reason,
      points: milestone.points,
      base_points: milestone.points,
      day_key: utcDayKey(at),
      metadata: { refereeId: input.refereeId, milestone: milestone.id },
    });
    points += milestone.points;
    awarded.push(milestone.id);
  }

  if (points > 0) {
    const { data: referrer } = await supabaseAdmin
      .from("profiles")
      .select("id, flow_points, points_referral_activity")
      .eq("id", input.referrerId)
      .maybeSingle();
    if (referrer) {
      await supabaseAdmin
        .from("profiles")
        .update({
          points_referral_activity: Number(referrer.points_referral_activity ?? 0) + points,
          flow_points: Number(referrer.flow_points ?? 0) + points,
        })
        .eq("id", referrer.id);
    }
  }

  return { granted: points, milestones: awarded };
}

/** True when new accruals are governed by V2 (i.e. now >= effectiveAt). */
export async function isFlowPointsV2Live(at: Date = new Date()): Promise<boolean> {
  const policy = await resolveFlowPointsV2Policy();
  return isFlowPointsV2Active(at, policy);
}
