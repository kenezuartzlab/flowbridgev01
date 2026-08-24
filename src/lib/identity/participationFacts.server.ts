/**
 * FlowBridge V29 §2/§10 — server-resolved participation facts.
 *
 * Read-only aggregation over records FlowBridge already settled. Actor-scoped:
 * it only ever resolves the authenticated caller's own rows. It writes nothing,
 * settles nothing and never invents a value it cannot read.
 */
import type { ParticipationFacts } from "./participationProfile";
import { EMPTY_PARTICIPATION_FACTS, maskEmail, maskWallet } from "./participationProfile";

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const dayKey = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

export async function resolveParticipationFactsForUser(args: {
  userId: string;
  email: string;
  emailVerified: boolean;
}): Promise<ParticipationFacts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin;

  const [{ data: profile }, { data: txs }, { data: missions }] = await Promise.all([
    db
      .from("profiles")
      .select("email, flow_points, claimed_tokens, wallet_address, referral_code")
      .eq("id", args.userId)
      .maybeSingle(),
    db.from("transactions_history").select("tx_type, created_at").eq("user_id", args.userId),
    db.from("ai_missions").select("status, completed_at").eq("user_id", args.userId),
  ]);

  const wallet = ((profile as any)?.wallet_address ?? null) as string | null;
  const referralCode = ((profile as any)?.referral_code ?? null) as string | null;

  let referrals = 0;
  if (referralCode) {
    const { data: referred } = await db
      .from("profiles")
      .select("id")
      .eq("referred_by", referralCode);
    referrals = (referred ?? []).length;
  }

  let verifiedActivities = 0;
  let campaignCompletions = 0;
  let campaignPoints = 0;
  const activityDates: string[] = [];

  if (wallet) {
    const lower = wallet.toLowerCase();
    const [{ data: verified }, { data: completions }, { data: ledger }] = await Promise.all([
      db.from("verified_activities").select("kind, occurred_at").eq("user_wallet", lower),
      db.from("campaign_completions").select("completion_id, completed_at").eq("user_wallet", lower),
      db.from("campaign_points_ledger").select("points_delta").eq("user_wallet", lower),
    ]);
    verifiedActivities = (verified ?? []).length;
    campaignCompletions = (completions ?? []).length;
    campaignPoints = (ledger ?? []).reduce((s, r: any) => s + num(r.points_delta), 0);
    for (const r of (verified ?? []) as any[]) {
      const d = dayKey(r.occurred_at);
      if (d) activityDates.push(d);
    }
    for (const r of (completions ?? []) as any[]) {
      const d = dayKey(r.completed_at);
      if (d) activityDates.push(d);
    }
  }


  let swaps = 0;
  let bridges = 0;
  let sends = 0;
  let stakes = 0;
  let firstActivityAt: string | null = null;
  let lastActivityAt: string | null = null;

  for (const t of (txs ?? []) as any[]) {
    const kind = String(t.tx_type ?? "").toUpperCase();
    if (kind === "SWAP") swaps += 1;
    else if (kind === "BRIDGE") bridges += 1;
    else if (kind === "SEND") sends += 1;
    else if (kind === "STAKE") stakes += 1;
    const created = t.created_at as string | null;
    if (created) {
      if (!firstActivityAt || created < firstActivityAt) firstActivityAt = created;
      if (!lastActivityAt || created > lastActivityAt) lastActivityAt = created;
      const d = dayKey(created);
      if (d) activityDates.push(d);
    }
  }

  const missionsCompleted = ((missions ?? []) as any[]).filter(
    (m) => String(m.status).toUpperCase() === "COMPLETED",
  ).length;

  return {
    ...EMPTY_PARTICIPATION_FACTS,
    signedIn: true,
    emailVerified: args.emailVerified,
    walletBound: !!wallet,
    emailHint: maskEmail(((profile as any)?.email as string) ?? args.email),
    walletHint: maskWallet(wallet),
    displayName: null,
    swaps,
    bridges,
    sends,
    verifiedActivities,
    campaignCompletions,
    campaignPoints,
    flowPoints: num((profile as any)?.flow_points),
    claimedFlow: num((profile as any)?.claimed_tokens),
    stakes,
    missionsCompleted,
    referrals,
    firstActivityAt,
    lastActivityAt,
    activeDays: new Set(activityDates).size,
  };
}
