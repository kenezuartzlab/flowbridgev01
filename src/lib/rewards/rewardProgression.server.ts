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
    fundingState: l.funding_state, programId: l.program_id,
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
  const cols = "id,user_id,reason,points,chain_id,created_at,activity_key,tx_hash,source_log_index,verified_usd,day_key,metadata,reservation_id,funding_state,program_id";
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
    { userId: args.userId, createdAt: new Date(profile?.created_at ?? Date.now()).toISOString(), storedFlowPoints: Number(profile?.flow_points ?? 0), storedPointsSelf: Number(profile?.points_self ?? 0), storedReferralSignup: Number(profile?.points_referral_signup ?? 0), ledger },
    evidence,
    OWNER_REVIEW_DECISIONS.get(args.userId),
  );

  const wallet = typeof profile?.wallet_address === "string" && /^0x[0-9a-fA-F]{40}$/.test(profile.wallet_address) ? profile.wallet_address.toLowerCase() : null;
  const allocations: ProgressionAllocation[] = [];
  let chainReadable = true;
  if (wallet) {
    try {
      const { readChainState, discoverPublishedBatches, readIsClaimed } = await import("./settlement.server");
      const live = await readChainState();
      if (!live) chainReadable = false;
      else {
        const found = await discoverPublishedBatches(supabaseAdmin, live.epochCount);
        for (const { batch, verification } of found) {
          if (!verification.complete) continue;
          const leaf = batch.leaves.find((l) => l.account.toLowerCase() === wallet);
          if (!leaf) continue;
          const claimed = await readIsClaimed(batch.epochId, leaf.index);
          if (claimed == null) { chainReadable = false; continue; }
          allocations.push({ epochId: batch.epochId, amountFlow: Number(BigInt(leaf.amount) / WEI), walletMatches: true, proofValid: true, onChain: true, claimed, claimStart: batch.claimStart, claimEnd: batch.claimEnd });
        }
      }
    } catch { chainReadable = false; }
  }

  const progression = computeRewardProgression({
    ledger: ledger.map((r) => ({ points: r.points, chainId: r.chainId, fundingState: r.fundingState, programId: r.programId })),
    reconciledPoints: recon.authoritative,
    reviewHeldPoints: recon.pendingReview,
    historicalNonclaimable: recon.nonclaimableHistorical,
    reconciliationOk: recon.classification === "MATCH" || recon.classification === "EXPLAINED_DIFFERENCE",
    storedFlowPoints: Number(profile?.flow_points ?? 0),
    walletBound: !!wallet,
    allocations,
    nowSec: Math.floor(Date.now() / 1000),
  });

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
