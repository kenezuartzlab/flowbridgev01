/**
 * V34 — server-only resolver for the caller's OWN reward progression and
 * next-best-action. Read-only: SELECTs and eth_call. Never trusts client values.
 */
import { computeRewardProgression, type ProgressionAllocation, type RewardProgression } from "./rewardProgression";
import { reconcileAccount, OWNER_REVIEW_DECISIONS, MAINNET_CHAIN_ID, mainnetSwapEvidence, type ReconLedgerRow } from "./historicalReconciliation";
import { resolveNextBestAction, type NextBestAction } from "@/lib/growth/nextBestAction";

const WEI = 10n ** 18n;

function toRow(l: any): ReconLedgerRow & { programId: string | null } {
  const md = (l.metadata ?? {}) as Record<string, unknown>;
  return {
    id: l.id, reason: l.reason, points: l.points, chainId: l.chain_id, createdAt: new Date(l.created_at).toISOString(),
    evidenceKey: l.activity_key ?? (l.tx_hash ? `${String(l.tx_hash).toLowerCase()}:${l.source_log_index ?? ""}` : null),
    verifiedUsd: l.verified_usd == null ? null : Number(l.verified_usd), dayKey: l.day_key,
    refereeId: typeof md.refereeId === "string" ? md.refereeId : null, reservationId: l.reservation_id,
    fundingState: l.funding_state, provenanceState: l.provenance_state, programId: l.program_id,
  };
}

export interface PersonalProgress {
  progression: RewardProgression;
  nextBestAction: NextBestAction;
  confirmedMainnetTrades: number;
  missionNextStep: { id: string; title: string; href: string } | null;
  chainReadable: boolean;
  observedAt: string;
}

export async function resolvePersonalProgress(args: { userId: string; emailVerified: boolean }): Promise<PersonalProgress> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cols = "id,user_id,reason,points,policy_version,wallet_address,chain_id,created_at,activity_key,tx_hash,source_log_index,verified_usd,day_key,metadata,reservation_id,funding_state,program_id,provenance_state";
  const [{ data: profile }, { data: ledgerData }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id,created_at,flow_points,points_self,points_referral_signup,wallet_address").eq("id", args.userId).maybeSingle(),
    supabaseAdmin.from("flow_points_ledger").select(cols).eq("user_id", args.userId).limit(5000),
  ]);
  const ledger = (ledgerData ?? []).map(toRow);
  const refereeIds = [...new Set(ledger.map((r) => r.refereeId).filter((x): x is string => !!x))];
  const evidence = new Map<string, ReconLedgerRow[]>();
  if (refereeIds.length) {
    const { data } = await supabaseAdmin.from("flow_points_ledger").select(cols).in("user_id", refereeIds).eq("chain_id", MAINNET_CHAIN_ID).limit(5000);
    for (const l of data ?? []) evidence.set(l.user_id, [...(evidence.get(l.user_id) ?? []), toRow(l)]);
  }
  const recon = reconcileAccount(
    { userId: args.userId, createdAt: new Date(profile?.created_at ?? Date.now()).toISOString(), storedFlowPoints: Number(profile?.flow_points ?? 0) + ledger.filter((r) => r.reason === "SIGNUP_BONUS_REFEREE" || r.reason === "REFERRAL_SIGNUP_BONUS").reduce((s, r) => s + r.points, 0), storedPointsSelf: Number(profile?.points_self ?? 0), storedReferralSignup: Number(profile?.points_referral_signup ?? 0), ledger },
    evidence,
    OWNER_REVIEW_DECISIONS.get(args.userId),
  );

  const wallet = typeof profile?.wallet_address === "string" && /^0x[0-9a-fA-F]{40}$/.test(profile.wallet_address) ? profile.wallet_address.toLowerCase() : null;
  const allocations: ProgressionAllocation[] = [];
  let chainReadable = true;
  if (wallet) {
    try {
      // V36.1: public round data comes from a shared 60s cache; this wallet's
      // own isClaimed status is always read fresh, in parallel.
      const { getPublishedRoundsCached, readIsClaimed } = await import("./settlement.server");
      const { live, found } = await getPublishedRoundsCached(supabaseAdmin);
      if (!live) chainReadable = false;
      else {
        const mine = found.filter((f) => f.verification.complete)
          .map(({ batch }) => ({ batch, leaf: batch.leaves.find((l) => l.account.toLowerCase() === wallet) }))
          .filter((x) => !!x.leaf);
        const claims = await Promise.all(mine.map(({ batch, leaf }) => leaf ? readIsClaimed(batch.epochId, leaf.index) : Promise.resolve(null)));
        mine.forEach(({ batch, leaf }, i) => {
          const claimed = claims[i];
          if (claimed == null || !leaf) { chainReadable = false; return; }
          allocations.push({ epochId: batch.epochId, amountFlow: Number(BigInt(leaf.amount) / WEI), walletMatches: true, proofValid: true, onChain: true, claimed, claimStart: batch.claimStart, claimEnd: batch.claimEnd });
        });
      }
    } catch { chainReadable = false; }
  }

  // V36.5: signup rows carry no chain id; count them as BOT Mainnet ONLY when
  // the canonical attributeSignupAward() proves provenance + verified funding.
  const signupMainnet = await attributeOwnSignupRows(supabaseAdmin, ledgerData ?? [], wallet);
  const excludedIds = new Set(recon.excluded.map((r) => r.rowId));
  const progression = computeRewardProgression({
    ledger: ledger.map((r) => ({ points: r.points, excluded: (r.chainId === MAINNET_CHAIN_ID || r.chainId == null) && (excludedIds.has(r.id) || ((r.reason === 'SIGNUP_BONUS_REFEREE' || r.reason === 'REFERRAL_SIGNUP_BONUS') && !signupMainnet.has(r.id))), chainId: signupMainnet.has(r.id) ? MAINNET_CHAIN_ID : r.chainId, fundingState: r.fundingState, programId: r.programId })),
    reconciledPoints: recon.authoritative,
    reviewHeldPoints: recon.pendingReview,
    historicalNonclaimable: recon.nonclaimableHistorical,
    reconciliationOk: recon.classification === "MATCH" || recon.classification === "EXPLAINED_DIFFERENCE",
    // V36: same Total Points rule as /api/users/incentives (profile + ledger-only signup bonuses).
    storedFlowPoints: Number(profile?.flow_points ?? 0) + ledger.filter((r) => r.reason === "SIGNUP_BONUS_REFEREE" || r.reason === "REFERRAL_SIGNUP_BONUS").reduce((t, r) => t + Number(r.points ?? 0), 0),
    walletBound: !!wallet,
    allocations,
    nowSec: Math.floor(Date.now() / 1000),
  });
  progression.recordedComposition = {
    storedHistory: Number(profile?.flow_points ?? 0),
    ownSignup: ledger.filter((r) => r.reason === 'SIGNUP_BONUS_REFEREE').reduce((s, r) => s + r.points, 0),
    referralSignup: ledger.filter((r) => r.reason === 'REFERRAL_SIGNUP_BONUS').reduce((s, r) => s + r.points, 0),
  };
  const historicalHeld = recon.excluded.filter((r) => r.cause === 'OWNER_REVIEWED_HISTORICAL_HOLD').reduce((s, r) => s + r.points, 0);
  progression.reconciliationEvidence = { coreSwap: recon.breakdown.coreSwap, historicalHeld, unsupportedStored: Math.max(0, recon.nonclaimableHistorical - historicalHeld) };

  let missionNextStep: PersonalProgress["missionNextStep"] = null;
  try {
    const { listMissions } = await import("@/lib/ai/mission/missionStore.server");
    const m = (await listMissions({ userId: args.userId, limit: 5 })).find((x: any) => x.status === "ACTIVE" || x.status === "IN_PROGRESS");
    const step = m?.steps.find((s: any) => s.id === m.currentStepId);
    if (m && step) missionNextStep = { id: `${m.id}:${step.id}`, title: step.title, href: "/assistant" };
  } catch { /* optional */ }

  let activeCampaigns = 0;
  try {
    const { count } = await supabaseAdmin.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "active").gt("ends_at", new Date().toISOString());
    activeCampaigns = count ?? 0;
  } catch { activeCampaigns = 0; }

  const confirmedMainnetTrades = mainnetSwapEvidence(ledger).length;
  const nextBestAction = resolveNextBestAction({
    signedIn: true, emailVerified: args.emailVerified, walletBound: !!wallet, progression,
    activeMissionHref: missionNextStep?.href ?? null, confirmedMainnetTrades, eligibleRoutesAvailable: true,
    liquidityPositions: 0, activeStakes: 0, activeCampaigns,
  });
  return { progression, nextBestAction, confirmedMainnetTrades, missionNextStep, chainReadable, observedAt: new Date().toISOString() };
}

/**
 * V36 — the ONLY claimable-FLOW figure for Flow AI / opportunities: a live,
 * open, unclaimed, proof-valid on-chain allocation. null = could not verify.
 */
export async function resolveClaimableNowFlow(userId: string): Promise<number | null> {
  try {
    const { buildRewardsSummary } = await import("./rewardsSummary");
    const r = await resolvePersonalProgress({ userId, emailVerified: true });
    const s = buildRewardsSummary({ progression: r.progression, chainReadable: r.chainReadable, nowSec: Math.floor(Date.now() / 1000) });
    return s.blocker === "STATE_UNAVAILABLE" ? null : s.claimableNow;
  } catch {
    return null;
  }
}

/** V36.5 — caller-scoped signup attribution via the canonical rule (read-only). */
async function attributeOwnSignupRows(admin: any, rows: any[], boundWallet: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  const { attributeSignupAward, SIGNUP_REASONS } = await import("./signupAttribution");
  const signup = rows.filter((l) => l.program_id === "SIGNUP_BONUS" && (SIGNUP_REASONS as readonly string[]).includes(l.reason));
  if (!signup.length) return out;
  try {
    const refereeOf = (l: any) => l.reason === "SIGNUP_BONUS_REFEREE" ? l.user_id : String(l.metadata?.refereeId ?? "");
    const refIds = [...new Set(signup.map(refereeOf).filter(Boolean))];
    const [{ data: budget }, { data: refProfiles }, { data: refAwards }] = await Promise.all([
      admin.from("reward_budgets").select("funding_verified").eq("program_id", "SIGNUP_BONUS").maybeSingle(),
      admin.from("profiles").select("id,created_at,wallet_address").in("id", refIds),
      admin.from("flow_points_ledger").select("user_id,wallet_address").eq("reason", "SIGNUP_BONUS_REFEREE").in("user_id", refIds),
    ]);
    const refWallet = new Map<string, string | null>((refAwards ?? []).map((r: any) => [r.user_id, r.wallet_address?.toLowerCase() ?? null]));
    const wallets = [...new Set([...refWallet.values()].filter(Boolean))] as string[];
    const counts = new Map<string, number>();
    if (wallets.length) {
      const { data } = await admin.from("flow_points_ledger").select("wallet_address").eq("reason", "SIGNUP_BONUS_REFEREE").in("wallet_address", wallets);
      for (const r of data ?? []) { const w = String(r.wallet_address).toLowerCase(); counts.set(w, (counts.get(w) ?? 0) + 1); }
    }
    const created = new Map<string, string>((refProfiles ?? []).map((p: any) => [p.id, new Date(p.created_at).toISOString()]));
    const boundByReferee = new Map<string, string>((refProfiles ?? []).map((p: any) => [p.id, String(p.wallet_address ?? '').toLowerCase()]));
    const email = new Map<string, boolean>();
    await Promise.all(refIds.map(async (id) => {
      try { const { data } = await admin.auth.admin.getUserById(id); email.set(id, !!data.user?.email_confirmed_at); } catch { email.set(id, false); }
    }));
    for (const l of signup) {
      const ref = refereeOf(l); const rw = refWallet.get(ref) ?? null;
      const a = attributeSignupAward({
        points: l.points,
        reason: l.reason, programId: l.program_id, chainId: l.chain_id, fundingState: l.funding_state, provenanceState: l.provenance_state, policyVersion: l.policy_version ?? null,
        reservationId: l.reservation_id ?? null, ledgerWallet: l.wallet_address ?? null, refereeCreatedAt: created.get(ref) ?? null,
        refereeEmailVerified: email.get(ref) ?? false, recipientBoundWallet: boundWallet, refereeWalletAwardCount: rw ? counts.get(rw) ?? 0 : 0,
        refereeWalletMatches: !!rw && boundByReferee.get(ref) === rw,
        programFundingVerified: !!budget?.funding_verified,
      });
      if (a === "MAINNET_SIGNUP_ALLOCATION") out.add(l.id);
    }
  } catch { /* fail closed: nothing counts */ }
  return out;
}
