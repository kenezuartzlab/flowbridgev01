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
  MetricStrip,
  SafeAreaPage,
  SectionHeader,
  StatusPill,
  Surface,
  TimelineRow,
  toneForStatus,
} from "@/components/ui-kit/primitives";
import { useAccountData } from "@/lib/app/useAccountData";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";
import { rewardPresentation } from "@/lib/rewards/rewardPresentation";
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
import { RewardProgressPanel } from "@/components/rewards/RewardProgressPanel";
import { usePersonalProgress } from "@/lib/rewards/usePersonalProgress";
import { EarnLiquidityFees } from "@/components/liquidity/EarnLiquidityFees";



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
  const claimedTokens = Number(incentives?.claimedTokens ?? 0);
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
  const display = rewardPresentation(personal?.progression);

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
        {authReady && !user ? (
          <Surface padded className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-[14px] font-black">Sign in to start earning</h2>
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted">
              FLOW Points (PTS) are off-chain loyalty points earned from qualified swaps,
              funded signup and referral rewards. Campaign PTS are separate. Reaching 1,000 eligible
              PTS qualifies for a payout round, not an immediate withdrawal.
            </p>
            <SignInButton label="Sign in" returnTo="/earn" />
          </Surface>
        ) : null}

        {/* V30.2B P2E — BOT Mainnet 677 published-epoch claim. Wallet-keyed and
            entirely separate from the testnet authorization flow, so it does not
            depend on being signed in. */}
        {personal ? <RewardProgressPanel p={personal.progression} area="earn" detailed /> : user && <p className="p-4 text-sm text-muted" role="status">{progressLoading ? "Checking your eligible points and payout rounds…" : "Reward eligibility is temporarily unavailable. Refresh to retry; your stored points are not a claimable balance."}</p>}
        <MainnetFlowClaimCard />

        {user && (
          <>
            <MetricStrip
              items={[
                {
                  label: `FLOW Points`,
                  value: loading && !incentives ? "—" : formatPts(flowPoints),
                  hint: PTS,
                },
                {
                  // V12.4A §6 — this is the remaining TOKEN payout delta, in FLOW,
                  // not a second points balance.
                  // Mainnet FLOW claims are LOCKED until funding + reconciliation pass.
                  label: "Claimable now",
                  value: display.claimable === null ? "—" : formatPts(display.claimable),
                  hint: `${FLOW_TOKEN} · open payout round`,
                },
                {
                  label: "Campaign PTS",
                  value: campaignAuthed ? formatPts(campaignPointsTotal) : "—",
                  hint: "verified tasks",
                },
              ]}
            />

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
                    label="Converted to FLOW"
                    value={claimedTokens > 0 ? formatPts(claimedTokens) : "—"}
                  />
                </div>
              </div>
            </Surface>

            <Surface id="claim">
              <SectionHeader title="When can I claim?" hint={display.readiness} />
              <p className="border-t border-hairline p-4 text-[12px] leading-relaxed text-muted">A total of 1,000 PTS does not automatically mean 1,000 FLOW is available. First reach 1,000 verified, funded Mainnet PTS not already allocated; then wait for your payout round to be published. The claim above becomes available only during its open window, for the allocated wallet. Community follows are optional, not a claim requirement.</p>
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


        {/* How earning works — sourced from the shared points rules, not copy. */}
        <Surface id="how">
          <SectionHeader
            title="How you earn"
            hint={`FLOW Points V2: verified swaps from $${SWAP_MIN_QUALIFYING_USD} grow your ${PTS}. Amounts are decided server-side from canonical on-chain evidence.`}
          />
          <div className="divide-y divide-hairline border-t border-hairline">
            <ListRow
              icon={<Sparkles className="h-4 w-4" aria-hidden />}
              label="Verified swaps"
              description={`1 ${PTS} per whole $1 of verified swap value, counted once per canonical on-chain activity. Swaps below $${SWAP_MIN_QUALIFYING_USD} still complete but earn no ${PTS}.`}
              to="/trade"
            />
          </div>
          <div className="divide-y divide-hairline border-t border-hairline">
            <ListRow
              icon={<Coins className="h-4 w-4" aria-hidden />}
              label="Daily cap"
              description={`Today: ${formatPts(Number(incentives?.coreSwapPointsToday ?? 0))} / ${formatPts(FLOW_POINTS_V2_DAILY_CAP)} core swap ${PTS} earned. This is today’s earning limit, not your claim progress. It resets each UTC day; swaps past it still complete.`}
            />
          </div>
          <div className="border-t border-hairline p-4">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-muted">Referral rewards</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[12px]">
              <dt className="text-muted">FLOW Points earned</dt><dd className="font-bold">{user ? formatPts(Number(incentives?.flowPoints ?? 0)) : "—"} {PTS}</dd>
              <dt className="text-muted">FLOW claimable now</dt><dd className="font-bold">{display.claimable === null ? "—" : formatPts(display.claimable)} FLOW</dd>
              <dt className="col-span-2 pb-1 text-[10.5px] leading-relaxed text-muted-soft">Only eligible funded PTS convert 1:1 to FLOW through a published payout round. Stored totals are not withdrawable tokens.</dt>
              <dt className="text-muted">New user signup bonus</dt><dd className="font-bold">100 {PTS} = 100 FLOW</dd>
              <dt className="text-muted">Referrer signup bonus</dt><dd className="font-bold">+100</dd>
              <dt className="col-span-2 pt-1 text-[10.5px] font-black uppercase tracking-[0.08em] text-muted">Activity milestones</dt>
              <dt className="text-muted">First qualifying swap ($5+)</dt><dd className="font-bold">+15</dd>
              <dt className="text-muted">$100 cumulative volume</dt><dd className="font-bold">+35</dd>
              <dt className="text-muted">3 qualified active days</dt><dd className="font-bold">+50</dd>
              <dt className="text-muted">Milestones per referral</dt><dd className="font-bold">up to 100</dd>
              <dt className="text-muted">Possible total per referral</dt><dd className="font-bold">up to 200</dd>
              <dt className="text-muted">Rewarded referrals per month</dt><dd className="font-bold">10</dd>
            </dl>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-soft">
              For accounts created on or after October 4, 2026, the signup bonus is confirmed once the new account verifies its email and binds a wallet not used for a bonus before. {incentives?.signupProgram?.exhausted ? "Signup bonus allocation is currently fully allocated." : "Available while the funded FlowBridge community-growth allocation remains available."} Milestones count only verified, confirmed swaps by the referred wallet, subject to monthly caps, review and funded program limits.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-soft">
              {user && Number(incentives?.signupBonusPoints ?? 0) > 0
                ? "Your 100 FLOW Points signup bonus is confirmed."
                : user && incentives?.signupProgram && !incentives.signupProgram.exhausted
                  ? "100 FLOW Points signup bonus pending — verify your email and bind a wallet. New accounts only."
                  : null}
            </p>
          </div>
          <div className="divide-y divide-hairline border-t border-hairline">
            <ListRow
              icon={<Trophy className="h-4 w-4" aria-hidden />}
              label="Campaign tasks"
              description="Verified on-chain tasks award Campaign PTS, tracked separately from FLOW Points. Bridging earns no core FLOW Points."
              to="/campaigns"
            />
          </div>
        </Surface>

        {/* Referral summary — management stays on the referral console. */}
        {user && (
          <Surface id="referrals">
            <SectionHeader
              title="Your referral link"
              hint={`${inviteCount.toLocaleString("en-US")} signed up with your code.`}
              action={
                <Link
                  to="/rewards"
                  hash="referrals"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-hairline px-3 text-[11px] font-bold text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  Manage <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              }
            />
            <div className="border-t border-hairline p-4">
              {referralLink ? (
                <button
                  type="button"
                  onClick={() => void copyReferral()}
                  className="flex w-full items-center gap-2 rounded-xl border border-hairline bg-card-alt px-3 py-2.5 text-left transition-colors hover:border-primary/40"
                >
                  <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                    {referralLink}
                  </span>
                  <StatusPill tone={copied ? "ok" : "neutral"}>
                    {copied ? "Copied" : "Copy"}
                  </StatusPill>
                </button>
              ) : (
                <p className="text-[12px] text-muted">
                  Your referral code appears here once your profile finishes syncing.
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="rounded-xl border border-hairline p-2.5">
                  <p className="text-muted">Referred users</p>
                  <p className="text-[15px] font-black">{inviteCount.toLocaleString("en-US")}</p>
                </div>
                <div className="rounded-xl border border-hairline p-2.5">
                  <p className="text-muted">Rewarded referrals</p>
                  <p className="text-[15px] font-black">{Number(incentives?.rewardedReferrals ?? 0)}</p>
                  <p className="text-[10.5px] text-muted-soft">
                    {Number(incentives?.rewardedReferralsThisMonth ?? 0)} / {Number(incentives?.referralMonthlyCap ?? 10)} this month
                  </p>
                </div>
              </div>
              {Array.isArray(incentives?.referralStatuses) && incentives.referralStatuses.length > 0 && (
                <ul className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">
                  {incentives.referralStatuses.slice(0, 20).map((r: any) => (
                    <li key={r.label} className="flex flex-wrap items-center gap-1.5 px-3 py-2 text-[11px]">
                      <span className="mr-auto font-bold">{r.label}</span>
                      <StatusPill tone="neutral">Signed up</StatusPill>
                      {r.walletBound && <StatusPill tone="neutral">Wallet bound</StatusPill>}
                      {r.milestones.includes("FIRST_SWAP") && <StatusPill tone="ok">First swap</StatusPill>}
                      {r.milestones.includes("VOLUME_100") && <StatusPill tone="ok">$100</StatusPill>}
                      {r.milestones.includes("ACTIVE_DAYS_3") && <StatusPill tone="ok">3 days</StatusPill>}
                      <span className="font-mono text-muted">Signup {Number(r.signupReward ?? 0)} / 100 · Milestones {r.pointsEarned} / 100</span>
                    </li>
                  ))}
                </ul>
              )}
              {!walletBound && (
                <Link
                  to="/rewards"
                  hash="bind"
                  className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-primary"
                >
                  <Wallet className="h-3.5 w-3.5" aria-hidden /> Bind a wallet to unlock rewards
                </Link>
              )}
            </div>
          </Surface>
        )}

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
