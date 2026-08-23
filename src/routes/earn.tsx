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
import { getIdToken } from "@/lib/auth";
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

import {
  FLOW_CLAIM_BLOCKED_COPY,
  FLOW_REWARDS_CHAINS,
  resolveFlowClaimReadiness,
} from "@/lib/rewards/flowRewardsRegistry";
import { isFlowConversionPolicyApprovedForChain } from "@/lib/rewards/flowConversionPolicy";
import { FlowTokenClaimCard } from "@/components/rewards/FlowTokenClaimCard";


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
          "Your FlowBridge earning summary: FLOW Points (PTS) balance, claimable points, verified Campaign PTS, referral progress and how every point is earned.",
      },
      { property: "og:title", content: "Earn — FlowBridge" },
      {
        property: "og:description",
        content:
          "FLOW Points (PTS), Campaign PTS, claim readiness and referral progress in one place.",
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
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
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
  const claimable = Number(incentives?.claimableTotal ?? 0);
  const claimThreshold = Number(incentives?.claimThreshold ?? 1000);
  const volumeUsd = Number(incentives?.totalSwapVolumeUsd ?? 0);
  const inviteCount = Number(incentives?.inviteCount ?? 0);
  const claimedTokens = Number(incentives?.claimedTokens ?? 0);
  const verified = Boolean(user && (user.emailVerified || user.email_verified));
  const walletBound = Boolean(incentives?.walletAddress);
  const socialsDone = (["youtube", "x", "telegram"] as const).every(
    (k) => !!incentives?.socials?.[k],
  );
  const level = xpLevel(flowPoints);

  const requirements = [
    {
      label: "Email verified",
      done: verified,
      hint: "Verify from the banner in the header.",
      to: "/account",
    },
    {
      label: "Wallet bound",
      done: walletBound,
      hint: "Bind the wallet that will receive FLOW.",
      to: "/rewards",
      hash: "bind",
    },
    {
      label: "Community channels followed",
      done: socialsDone,
      hint: "YouTube, X and Telegram.",
      to: "/rewards",
      hash: "social",
    },
    {
      label: `${formatPts(claimThreshold)} ${PTS} claimable`,
      done: claimable >= claimThreshold,
      hint: `You have ${formatPts(claimable)} ${PTS} claimable.`,
      to: "/trade",
    },
  ];
  const canClaim = requirements.every((r) => r.done);

  const claim = async () => {
    setClaiming(true);
    setClaimMessage(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Sign in again to claim.");
      const res = await fetch("/api/users/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Claim failed.");
      setClaimMessage(`Converted ${formatPts(claimable)} ${PTS} to claimable FLOW.`);
      await refresh();
    } catch (e: any) {
      setClaimMessage(e?.message ?? "Claim failed.");
    } finally {
      setClaiming(false);
    }
  };

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
              referrals and verified campaign tasks. They are not FLOW tokens — PTS convert to
              claimable FLOW only once every requirement below is met.
            </p>
            <SignInButton label="Sign in" returnTo="/earn" />
          </Surface>
        ) : null}

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
                  label: "Available to claim",
                  value: loading && !incentives ? "—" : formatPts(claimable),
                  hint: `${FLOW_TOKEN} · ${formatPts(claimedTokens)} claimed`,
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

            {/* Claim — the audited server flow, with the exact server requirements. */}
            <Surface id="claim">
              <SectionHeader
                title="Convert PTS to claimable FLOW"
                hint="Every requirement is enforced server-side when you convert."
              />
              <ul className="divide-y divide-hairline border-t border-hairline">
                {requirements.map((r) => (
                  <li key={r.label}>
                    <ListRow
                      icon={
                        r.done ? (
                          <Check className="h-4 w-4" aria-hidden />
                        ) : (
                          <Circle className="h-4 w-4" aria-hidden />
                        )
                      }
                      label={r.label}
                      description={r.hint}
                      to={r.done ? undefined : r.to}
                      hash={r.done ? undefined : r.hash}
                      onClick={r.done ? () => {} : undefined}
                      trailing={
                        r.done ? (
                          <StatusPill tone="ok">Done</StatusPill>
                        ) : (
                          <StatusPill tone="pending">Todo</StatusPill>
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
              <div className="space-y-2 border-t border-hairline p-4">
                <button
                  type="button"
                  disabled={!canClaim || claiming}
                  onClick={() => void claim()}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground transition-opacity disabled:opacity-45"
                >
                  <Gift className="h-4 w-4" aria-hidden />
                  {claiming ? "Converting…" : `Convert ${formatPts(claimable)} ${PTS}`}
                </button>
                {claimMessage && (
                  <p className="text-[11.5px] leading-relaxed text-muted">{claimMessage}</p>
                )}
                <p className="text-[11px] leading-relaxed text-muted-soft">
                  Converting moves eligible PTS into your claimable FLOW balance for the bound
                  wallet. Locked referral-signup points stay locked until more qualified swap
                  volume unlocks them.
                </p>
              </div>
            </Surface>

            {/* V12 — on-chain FLOW token distribution status. Read-only and
                fail-closed: it states the truth about the claim contract and
                never implies a token claim is available. */}
            <Surface id="flow-token">
              <SectionHeader
                title="On-chain FLOW token claims"
                hint="Status of the FLOW token distributor. PTS stay off-chain until this is live."
              />
              <ul className="divide-y divide-hairline border-t border-hairline">
                {FLOW_REWARDS_CHAINS.map((c) => {
                  const readiness = resolveFlowClaimReadiness(
                    c.chainId,
                    isFlowConversionPolicyApprovedForChain(c.chainId),
                  );
                  return (
                    <li key={c.chainId}>
                      <ListRow
                        icon={<Coins className="h-4 w-4" aria-hidden />}
                        label={c.label}
                        description={
                          readiness.ready
                            ? "Claim contract live."
                            : FLOW_CLAIM_BLOCKED_COPY[readiness.reason]
                        }
                        trailing={
                          <StatusPill tone={readiness.ready ? "ok" : "pending"}>
                            {readiness.ready ? "Live" : "Pending"}
                          </StatusPill>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-hairline p-4 text-[11px] leading-relaxed text-muted-soft">
                FLOW Points (PTS) are an off-chain balance. On BOT Testnet the distributor is
                deployed and funded with 10,000,000 FLOW from the approved treasury, and the
                approved testnet policy converts 1 PTS to 1 FLOW cumulatively — Campaign PTS are
                always excluded. Claim authorizations are server-signed and short-lived; the first
                on-chain payout is not triggered automatically. BOT Mainnet remains pending
                promotion.
              </p>
            </Surface>

            {/* V12.3 — the explicit, user-initiated on-chain FLOW claim. */}
            <FlowTokenClaimCard
              campaignPts={campaignAuthed ? campaignPointsTotal : null}
              onClaimed={refresh}
            />

            {/* V13.2 — testnet vault live and funded; read-only surface, never a quoted rate. */}
            <Link
              to="/stake"
              className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-card px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-black">FLOW staking</span>
                <span className="block text-[11px] text-muted-soft">
                  Testnet vault live — 100,000 FLOW pre-funded rewards, no minting, no lock-up.
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
              description={`Core swap accrual is capped at ${formatPts(FLOW_POINTS_V2_DAILY_CAP)} ${PTS} per bound wallet each UTC day. Swaps past the cap still complete and stay verified.`}
            />
            <ListRow
              icon={<Users className="h-4 w-4" aria-hidden />}
              label="Referral milestones"
              description="Referred users earn you +15 on their first qualifying swap, +35 at $100 qualified volume and +50 at 3 active days — up to 100 PTS per referred user. Signing up alone earns nothing."
              to="/rewards"
              hash="referrals"
            />
          </div>

          <div className="divide-y divide-hairline border-t border-hairline">
            <ListRow
              icon={<Trophy className="h-4 w-4" aria-hidden />}
              label="Campaign tasks"
              description="Verified on-chain tasks award Campaign PTS, tracked separately from FLOW Points."
              to="/campaigns"
            />
            <ListRow
              icon={<Users className="h-4 w-4" aria-hidden />}
              label="Referrals"
              description="Invited users earn you points once their activity qualifies."
              to="/rewards"
              hash="referrals"
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
