/**
 * Server-only signup bonus settlement. Eligibility is decided here from
 * database + auth facts; the atomic award_signup_bonus() RPC reserves funding
 * and writes the ledger rows in one transaction. Never edits profile balances.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  REFERRAL_BURST_WINDOW_MS,
  SIGNUP_BONUS_POLICY_VERSION,
  evaluateSignupEligibility,
} from "./signupBonusPolicy";
import { DEFAULT_FLOW_POINTS_V2_POLICY, utcMonthKey } from "./flowPointsV2";

export async function trySettleSignupBonus(userId: string, emailVerified: boolean) {
  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select("id, wallet_address, referred_by, referral_code, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!p) return { outcome: "NO_PROFILE" as const };
  const wallet = p.wallet_address ? String(p.wallet_address).toLowerCase() : null;

  const [{ data: byUser }, { data: byWallet }] = await Promise.all([
    supabaseAdmin.from("flow_points_ledger").select("id").eq("reason", "SIGNUP_BONUS_REFEREE").eq("user_id", userId).limit(1),
    wallet
      ? supabaseAdmin.from("flow_points_ledger").select("id").eq("reason", "SIGNUP_BONUS_REFEREE").ilike("wallet_address", wallet).limit(1)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  let referrer: any = null;
  let rewardedThisMonth = 0;
  let recentBindings = 0;
  if (p.referred_by) {
    const { data: r } = await supabaseAdmin
      .from("profiles")
      .select("id, wallet_address, referred_by, referral_code")
      .eq("referral_code", p.referred_by)
      .maybeSingle();
    referrer = r;
    if (r) {
      const monthStart = `${utcMonthKey()}-01T00:00:00.000Z`;
      const [{ data: signupRows }, { data: msRows }, { count }] = await Promise.all([
        supabaseAdmin.from("flow_points_ledger").select("metadata").eq("user_id", r.id)
          .eq("reason", "REFERRAL_SIGNUP_BONUS").gte("created_at", monthStart),
        supabaseAdmin.from("referral_milestone_awards").select("referee_id").eq("referrer_id", r.id).eq("month_key", utcMonthKey()),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true })
          .eq("referred_by", p.referred_by).not("wallet_address", "is", null)
          .gte("last_binding_change", new Date(Date.now() - REFERRAL_BURST_WINDOW_MS).toISOString()),
      ]);
      const set = new Set<string>();
      for (const s of signupRows ?? []) if ((s as any).metadata?.refereeId) set.add(String((s as any).metadata.refereeId));
      for (const m of msRows ?? []) set.add(String((m as any).referee_id));
      set.delete(userId);
      rewardedThisMonth = set.size;
      recentBindings = count ?? 0;
    }
  }

  const decision = evaluateSignupEligibility({
    userId,
    accountCreatedAt: String(p.created_at),
    emailVerified,
    wallet,
    alreadyBonusedAccount: (byUser ?? []).length > 0,
    alreadyBonusedWallet: (byWallet ?? []).length > 0,
    referrerId: referrer?.id ?? null,
    referrerWallet: referrer?.wallet_address ?? null,
    referrerReferredByUser: !!referrer && !!p.referral_code && referrer.referred_by === p.referral_code,
    referrerRewardedThisMonth: rewardedThisMonth,
    monthlyCap: DEFAULT_FLOW_POINTS_V2_POLICY.referralMonthlyCap,
    recentReferrerBindings: recentBindings,
  });
  if (!decision.eligible) return { outcome: "PENDING" as const, blockers: decision.blockers };

  const payReferrer = decision.referrer === "PAY";
  const { data, error } = await supabaseAdmin.rpc("award_signup_bonus" as never, {
    p_user_id: userId,
    p_wallet: wallet,
    p_referrer_id: referrer?.id ?? null,
    p_pay_referrer: payReferrer,
    p_policy_version: SIGNUP_BONUS_POLICY_VERSION,
  } as never);
  const { recordRewardDiagnostic } = await import("./rewardDiagnostics.server");
  if (error) {
    await recordRewardDiagnostic({ stage: "signup_bonus", outcome: "PERSISTENCE_REJECTED", detail: error.message });
    throw new Error("Signup bonus could not be settled");
  }
  const result = data as any;
  if (result?.outcome === "CONFIRMED" && referrer && !payReferrer && decision.referrer !== "NONE") {
    // Attribution kept; referrer side recorded at 0 with its reason.
    await supabaseAdmin.from("flow_points_ledger").insert({
      user_id: referrer.id,
      policy_version: SIGNUP_BONUS_POLICY_VERSION,
      reason: decision.referrer === "MONTHLY_CAP" ? "REFERRAL_MONTHLY_CAP_REACHED" : "ANTI_ABUSE_REVIEW",
      points: 0,
      base_points: 0,
      activity_key: `signup-ref-hold:${userId}`,
      program_id: "SIGNUP_BONUS",
      funding_state: decision.referrer === "REVIEW" ? "REVIEW" : "UNFUNDED",
      referrer_id: referrer.id,
      metadata: { refereeId: userId, referrerOutcome: decision.referrer, policyVersion: SIGNUP_BONUS_POLICY_VERSION },
    } as never);
  }
  if (result?.outcome === "EXHAUSTED") {
    await recordRewardDiagnostic({ stage: "signup_bonus", outcome: "PERMANENT_FAILURE", detail: "allocation exhausted" });
  }
  return { outcome: result?.outcome ?? "UNKNOWN", referrer: decision.referrer, ...result };
}

/** Public, authoritative program status (aggregate only, no identities). */
export async function getSignupProgramStatus() {
  const { data } = await supabaseAdmin
    .from("reward_budgets" as never)
    .select("program_id, total_points, reserved_points, status, funding_verified");
  const rows = (data ?? []) as any[];
  const signup = rows.find((r) => r.program_id === "SIGNUP_BONUS");
  return {
    programs: rows.map((r) => ({
      programId: r.program_id,
      total: Number(r.total_points),
      reserved: Number(r.reserved_points),
      remaining: Math.max(0, Number(r.total_points) - Number(r.reserved_points)),
      active: r.status === "ACTIVE",
      fundingVerified: !!r.funding_verified,
    })),
    signupRemaining: signup ? Math.max(0, Number(signup.total_points) - Number(signup.reserved_points)) : 0,
    signupExhausted: !signup || Number(signup.total_points) - Number(signup.reserved_points) < 100,
  };
}
