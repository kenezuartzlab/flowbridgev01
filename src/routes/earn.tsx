import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Circle,
  Coins,
  Gift,
  History,
  Link2,
  RefreshCw,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { SignInButton } from "@/components/auth/SignInButton";
import {
  ListRow,
  SafeAreaPage,
  SectionHeader,
  StatusPill,
  Surface,
  TimelineRow,
  toneForStatus,
} from "@/components/ui-kit/primitives";
import { useAccountData } from "@/lib/app/useAccountData";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";
import { formatUsd } from "@/lib/format";
import {
  FLOW_TOKEN,
  PTS,
  SWAP_MIN_QUALIFYING_USD,
  XP,
  formatPts,
  formatXp,
  xpLevel,
} from "@/lib/points";
import { DEFAULT_FLOW_POINTS_V2_POLICY } from "@/lib/rewards/flowPointsV2";

const FLOW_POINTS_V2_DAILY_CAP = DEFAULT_FLOW_POINTS_V2_POLICY.dailyCoreSwapCap;

import { MainnetFlowClaimCard } from "@/components/rewards/MainnetFlowClaimCard";
import { FlowRewardsVaultV2Panel } from "@/components/rewards/FlowRewardsVaultV2Panel";
import { RewardsSummaryCard, useUnifiedRewards } from "@/components/rewards/RewardsSummaryCard";
import { RewardProgressPanel } from "@/components/rewards/RewardProgressPanel";
import { usePersonalProgress } from "@/lib/rewards/usePersonalProgress";
import { RewardPolicyDetails } from '@/components/rewards/RewardPolicyDetails';
import { ReferralRewards } from '@/components/rewards/ReferralRewards';
import { EarnLiquidityFees } from "@/components/liquidity/EarnLiquidityFees";
import { AdventureEntry } from '@/components/adventure/AdventureEntry';



/**
 * FlowBridge V11 — the canonical Earn destination.
 *
 * One rewards journey, one home. Every number here is read from an existing
 * authoritative source (`/api/users/incentives` for the off-chain FLOW Points
 * ledger, `/api/campaigns` for verified Campaign PTS, `/api/transactions` for
 * history). Nothing is invented client-side and no reward rule is duplicated:
 * the claim action posts to the audited `/api/users/claim` endpoint and the
 * requirement checklist mirrors exactly what that endpoint enforces.
 *
 * FLOW Points (PTS) — off-chain loyalty balance. Campaign PTS — verified
 * campaign score. FLOW — the on-chain token. They are never mixed.
 */
export const Route = createFileRoute("/earn")({
  head: () => ({
    meta: [
      { title: "Earn — FlowBridge" },
      {
        name: "description",
        content:
          "Your FlowBridge earning summary: FLOW Points, Campaign PTS, rewards and referral progress.",
      },
      { property: "og:title", content: "Earn — FlowBridge" },
      {
        property: "og:description",
        content:
          "Your FlowBridge earning summary: FLOW Points, Campaign PTS, rewards and referral progress.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/earn" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/earn" }],
  }),
  component: EarnPage,
});

function EarnPage() {
  const { user, authReady, incentives, transactions, loading, refresh } = useAccountData();
  const { campaignPointsTotal, authenticated: campaignAuthed } = useCampaignProgress();
  const [copied, setCopied] = useState(false);

  /** Deep links from Home, Profile and campaign surfaces. */
  useEffect(() => {
    const hash = window.location.hash.replace("#", "").toLowerCase();
    if (!hash) return;
    const id = ["claim", "campaign-pts", "referrals", "how"].includes(hash) ? hash : null;
    if (id) {
      setTimeout(
        () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
        250,
      );
    }
  }, []);

  const flowPoints = Number(incentives?.flowPoints ?? 0);
  const volumeUsd = Number(incentives?.totalSwapVolumeUsd ?? 0);
  const inviteCount = Number(incentives?.inviteCount ?? 0);
  const verified = Boolean(user && (user.emailVerified || user.email_verified));
  const walletBound = Boolean(incentives?.walletAddress);
  const level = xpLevel(flowPoints);

  const referralLink =
    typeof window !== "undefined" && incentives?.referralCode
      ? `${window.location.origin}/?ref=${incentives.referralCode}`
      : "";

  const copyReferral = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the link stays selectable on screen */
    }
  };

  const recent = useMemo(
    () =>
      transactions
        .filter((t: any) => Number(t.points_earned ?? t.pointsEarned ?? 0) > 0)
        .slice(0, 5),
    [transactions],
  );

  const { data: personal, loading: progressLoading } = usePersonalProgress(!!user);
  const { totals: unified } = useUnifiedRewards();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar
        eyebrow="Earn"
        title="Rewards"
        avatar={user?.photoURL ?? null}
        initial={(user?.displayName || user?.email || "G").slice(0, 1).toUpperCase()}
        actions={
          user ? (
            <button
              type="button"
              onClick={() => void refresh()}
              aria-label="Refresh rewards"
              className="grid h-10 w-10 place-items-center rounded-2xl border border-hairline bg-card text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          ) : undefined
        }
      />

      <SafeAreaPage>
        <AdventureEntry />
        {authReady && !user ? (
          <Surface padded className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-[14px] font-black">Sign in to start earning</h2>
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted">
              FLOW Points (PTS) are off-chain loyalty points earned from qualified swaps,
              funded signup and referral rewards. Campaign PTS are separate. Any positive verified eligible
              amount can enter Ops payout approval; funding, an authorized published round and the
              contract's claim window are still required before you can claim.
            </p>
            <SignInButton label="Sign in" returnTo="/earn" />
          </Surface>
        ) : null}

        {/* V30.2B P2E — BOT Mainnet 677 published-epoch claim. Wallet-keyed and
            entirely separate from the testnet authorization flow, so it does not
            depend on being signed in. */}
        <Surface className="space-y-4 p-4">
          {user && <RewardsSummaryCard />}
          <FlowRewardsVaultV2Panel />
          <details open={unified.v1ClaimableFlow > 0} className="border-t border-hairline pt-3">
            <summary className="cursor-pointer text-sm font-semibold">Previous reward rounds{unified.v1ClaimableFlow > 0 ? ` · ${unified.v1ClaimableFlow.toLocaleString("en-US")} FLOW to claim` : ""}</summary>
            <div className="mt-3"><MainnetFlowClaimCard /></div>
          </details>
        </Surface>

        {user && (
          <>
            <details className="rounded-2xl border border-hairline bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">How rewards work &amp; details</summary>
              {personal ? <RewardProgressPanel p={personal.progression} area="earn" detailed /> : <p className="p-4 text-sm text-muted" role="status">{progressLoading ? "Checking your eligible points and payout rounds…" : "Reward eligibility is temporarily unavailable. Refresh to retry."}</p>}
              <p className="border-t border-hairline p-4 text-[12px] leading-relaxed text-muted">Points are not automatically FLOW. Verified, funded Mainnet Points are credited to your FLOW Rewards Wallet in batches, then you claim them with your wallet. Campaign PTS: {campaignAuthed ? formatPts(campaignPointsTotal) : "—"} (verified tasks). Community follows are optional, not a claim requirement.</p>
            </details>

            {/* Status band — level (engagement only) and lifetime outcomes. */}
            <Surface>
              <SectionHeader
                title={`Level ${level.level} · ${level.name}`}
                hint={`${formatXp(flowPoints)} ${XP} lifetime engagement. XP is status only and never converts to FLOW.`}
                badge={
                  <StatusPill tone={verified ? "ok" : "pending"}>
                    {verified ? "Verified" : "Unverified"}
                  </StatusPill>
                }
              />
              <div className="px-4 pb-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(level.progress * 100)}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Fact label="Swap volume" value={volumeUsd > 0 ? formatUsd(volumeUsd) : "—"} />
                  <Fact label="Referred users" value={inviteCount.toLocaleString("en-US")} />
                  <Fact
                    label="FLOW claimed on-chain"
                    value={personal?.chainReadable ? `${formatPts(personal.progression.claimedFlow)} FLOW` : "—"}
                  />
                </div>
              </div>
            </Surface>


            {/* V13.2 — testnet vault live and funded; read-only surface, never a quoted rate. */}
            <Link
              to="/stake"
              className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-card px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-black">FLOW staking</span>
                <span className="block text-[11px] text-muted-soft">
                  BOT Mainnet staking — view live terms, reserves and your positions.
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted">
                Live
              </span>
            </Link>
          </>
        )}


        <RewardPolicyDetails />
        {user && <ReferralRewards incentives={incentives} />}

        {/* Recent point-earning activity — Activity remains the evidence surface. */}
        {user && (
          <Surface>
            <SectionHeader
              title="Recent points"
              hint="Full evidence, hashes and verification live on Activity."
              action={
                <Link
                  to="/activity"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-hairline px-3 text-[11px] font-bold text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <History className="h-3 w-3" aria-hidden /> Activity
                </Link>
              }
            />
            {recent.length === 0 ? (
              <p className="border-t border-hairline px-4 py-5 text-center text-[12px] text-muted">
                {loading ? "Loading…" : `No point-earning activity yet — swap from $${SWAP_MIN_QUALIFYING_USD} to start.`}
              </p>
            ) : (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {recent.map((t: any, i: number) => {
                  const status = String(t.status ?? "");
                  return (
                    <TimelineRow
                      key={t.id ?? t.tx_hash ?? i}
                      icon={<Sparkles className="h-4 w-4" aria-hidden />}
                      title={`${t.from_token ?? t.fromToken ?? "Swap"} → ${t.to_token ?? t.toToken ?? ""}`.trim()}
                      meta={t.tx_hash ?? t.txHash ?? undefined}
                      status={status || undefined}
                      statusTone={status ? toneForStatus(status) : undefined}
                      points={`+${formatPts(t.points_earned ?? t.pointsEarned)} ${PTS}`}
                      timestamp={formatWhen(t.created_at ?? t.createdAt)}
                    />
                  );
                })}
              </ul>
            )}
          </Surface>
        )}

        <EarnLiquidityFees />

        <p className="px-1 pb-1 text-center text-[10.5px] leading-relaxed text-muted-soft">
          FLOW Points (PTS) are off-chain loyalty points. Campaign PTS are verified campaign
          scores. Neither is a FLOW token balance.
        </p>
      </SafeAreaPage>

      <BottomNav />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-card-alt px-3 py-2">
      <p className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[13px] font-black tabular-nums">{value}</p>
    </div>
  );
}

function formatWhen(value: unknown): string | undefined {
  const at = value ? new Date(String(value)).getTime() : 0;
  if (!at) return undefined;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
