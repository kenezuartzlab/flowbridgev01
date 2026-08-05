import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Gift,
  Users,
  Repeat,
  Lock,
  RefreshCw,
  Check,
  Circle,
  Target,
  Gamepad2,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { useAccountData } from "@/lib/app/useAccountData";
import { SignInButton } from "@/components/auth/SignInButton";
import { TabBanner } from "@/components/banners/TabBanner";
import giftArt from "@/assets/gift-1.png.asset.json";

import { formatUsd } from "@/lib/format";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "FLOW Rewards — Points & Referrals | FlowBridge" },
      {
        name: "description",
        content:
          "Track your FLOW points from swaps and referrals, see claim eligibility, swap volume progress and your referral link on FlowBridge.",
      },
      { property: "og:title", content: "FlowBridge FLOW Rewards" },
      { property: "og:description", content: "Swap-powered FLOW points, referral totals and claim progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RewardsPage,
});

type Tab = "OVERVIEW" | "EARN" | "REFERRALS" | "GIFTS" | "GAMES";

const LEVEL_NAMES = ["Newcomer", "Trader", "Explorer", "Voyager", "Architect", "Legend"];
const XP_PER_LEVEL = 1000;

function RewardsPage() {
  const { user, incentives, transactions, loading, refresh } = useAccountData();
  const [tab, setTab] = useState<Tab>("OVERVIEW");

  /** Deep-link support: /rewards#games opens the Games tab. */
  useEffect(() => {
    const hash = window.location.hash.replace("#", "").toUpperCase();
    if (["OVERVIEW", "EARN", "REFERRALS", "GIFTS", "GAMES"].includes(hash)) setTab(hash as Tab);
  }, []);

  const referralLink =
    typeof window !== "undefined" && incentives?.referralCode
      ? `${window.location.origin}/?ref=${incentives.referralCode}`
      : "";

  const lifetime = incentives?.flowPoints ?? 0;

  /** Derived presentation-only values (no new backend rules). */
  const weeklyPoints = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return transactions.reduce((sum: number, t: any) => {
      const at = new Date(t.created_at ?? t.createdAt ?? 0).getTime();
      if (!at || at < cutoff) return sum;
      return sum + (Number(t.points_earned ?? t.pointsEarned ?? 0) || 0);
    }, 0);
  }, [transactions]);

  const levelIndex = Math.min(LEVEL_NAMES.length - 1, Math.floor(lifetime / XP_PER_LEVEL));
  const levelXp = lifetime % XP_PER_LEVEL;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <Link
          to="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-muted hover:text-foreground"
          aria-label="Back to swap"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-mono text-[13px] font-black uppercase tracking-[0.12em]">FLOW Rewards</h1>
        <button
          onClick={() => void refresh()}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-muted hover:text-foreground"
          aria-label="Refresh rewards"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4 pb-24 sm:py-5">
        {!user ? (
          <div className="space-y-4">
            <TabBanner variant="rewards" />
            <EmptyState
              title="Sign in to see your FLOW"
              body="FLOW points are tied to a verified email plus the wallet bound to it. Sign in to start tracking rewards."
            />
            <div className="flex justify-center">
              <SignInButton label="Sign in" returnTo="/rewards" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Points hero + level progress */}
            <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/25 via-primary/10 to-accent/15 p-5">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/25 blur-3xl"
              />
              <p className="relative font-mono text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                Total FLOW Points
              </p>
              <p className="relative mt-1 text-[44px] font-black leading-none tabular-nums text-foreground">
                {lifetime.toLocaleString()}
              </p>
              <p className="relative mt-1.5 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary">
                +{weeklyPoints.toLocaleString()} this week
              </p>

              <div className="relative mt-4 rounded-2xl border border-hairline bg-card-alt p-3">
                <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] font-black uppercase tracking-[0.1em]">
                  <span className="text-foreground">
                    Level {levelIndex + 1} · {LEVEL_NAMES[levelIndex]}
                  </span>
                  <span className="tabular-nums text-muted">
                    {levelXp.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()} XP
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${(levelXp / XP_PER_LEVEL) * 100}%` }}
                  />
                </div>
              </div>
            </section>

            {/* Stat tiles */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <OverviewTile
                label="Available"
                value={(incentives?.claimableTotal ?? 0).toLocaleString()}
                unit="FLOW"
                accent
              />
              <OverviewTile
                label="Pending"
                value={(incentives?.signupLocked ?? 0).toLocaleString()}
                unit="locked"
              />
              <OverviewTile label="Lifetime" value={lifetime.toLocaleString()} unit="FLOW" />
              <OverviewTile
                label="Claimed"
                value={(incentives?.claimedTokens ?? 0).toLocaleString()}
                unit="FLOW"
              />
            </section>

            {/* Sub tabs */}
            <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {(["OVERVIEW", "EARN", "REFERRALS", "GIFTS", "GAMES"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                    tab === t
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-hairline bg-card text-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </nav>

            {tab === "OVERVIEW" ? (
              <>
                {/* Quick actions */}
                <section>
                  <h2 className="mb-2 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-muted">
                    Quick Actions
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <QuickAction
                      Icon={Repeat}
                      label="Swap now"
                      note="Earn FLOW"
                      to="/"
                    />
                    <QuickAction
                      Icon={Users}
                      label="Invite friends"
                      note="Referral link"
                      onClick={() => setTab("REFERRALS")}
                    />
                    <QuickAction Icon={TrendingUp} label="Markets" note="Live charts" to="/markets" />
                    <QuickAction Icon={Gamepad2} label="Games" note="Coming soon" soon />
                  </div>
                </section>

                {/* Weekly progress */}
                <section className="relative overflow-hidden rounded-2xl border border-hairline bg-card p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-muted">
                        Weekly Progress
                      </h2>
                      <p className="mt-1.5 text-[13px] font-bold text-foreground">
                        Earn {XP_PER_LEVEL.toLocaleString()} FLOW this week
                      </p>
                      <p className="font-mono text-[10px] tabular-nums text-muted">
                        {weeklyPoints.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()}
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-hairline">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-700"
                          style={{
                            width: `${Math.min(100, (weeklyPoints / XP_PER_LEVEL) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <img
                      src={giftArt.url}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      draggable={false}
                      className="h-16 w-16 shrink-0 select-none object-contain sm:h-20 sm:w-20"
                    />
                  </div>
                </section>

                {/* Claim checklist — mirrors the server-side claim requirements */}
                <section className="rounded-2xl border border-hairline bg-card p-4">
                  <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">
                    Claim Checklist
                  </h2>
                  <ul className="mt-3 space-y-2">
                    <CheckRow
                      done={!!(user?.emailVerified || user?.email_verified)}
                      label="Email verified"
                      hint="Verify the email you signed in with"
                    />
                    <CheckRow
                      done={!!incentives?.walletAddress}
                      label="Wallet bound to email"
                      hint="Bind the wallet you swap with"
                    />
                    <CheckRow
                      done={!!incentives?.socials?.youtube}
                      label="Follow on YouTube"
                      hint="Required before claiming"
                    />
                    <CheckRow done={!!incentives?.socials?.x} label="Follow on X" hint="Required before claiming" />
                    <CheckRow
                      done={!!incentives?.socials?.telegram}
                      label="Join Telegram"
                      hint="Required before claiming"
                    />
                    <CheckRow
                      done={(incentives?.claimableTotal ?? 0) >= 1000}
                      label="1,000 claimable FLOW"
                      hint={`${(incentives?.claimableTotal ?? 0).toLocaleString()} available now`}
                    />
                  </ul>
                </section>

                {/* Volume gate */}
                <section className="rounded-2xl border border-hairline bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-warning" />
                    <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">
                      Swap Volume Requirement
                    </h2>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">
                    Referral signup points unlock with real swap volume. Bridging is recorded in your activity for
                    attribution but never earns points.
                  </p>
                  <div className="mt-3 flex items-baseline justify-between font-mono text-[12px]">
                    <span className="text-muted">Total swap volume</span>
                    <span className="font-black text-foreground">
                      {formatUsd(incentives?.totalSwapVolumeUsd ?? 0)}
                    </span>
                  </div>
                  {incentives?.nextUnlockUsd ? (
                    <div className="mt-1 flex items-baseline justify-between font-mono text-[12px]">
                      <span className="text-muted">Next unlock at</span>
                      <span className="font-black text-primary">{formatUsd(incentives.nextUnlockUsd)}</span>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}

            {tab === "EARN" ? (
              <section className="rounded-2xl border border-hairline bg-card p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-primary" />
                  <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">Daily Tasks</h2>
                </div>
                <ul className="mt-3 space-y-2.5">
                  <TaskRow
                    label="Complete a swap"
                    hint="Swaps accrue FLOW · bridges never do"
                    progress={(incentives?.pointsSelf ?? 0) > 0 ? 1 : 0}
                    detail={`${(incentives?.pointsSelf ?? 0).toLocaleString()} FLOW from swaps`}
                    cta="Swap now"
                  />
                  <TaskRow
                    label="Reach $100 swap volume"
                    hint="Unlocks referral signup points"
                    progress={(incentives?.totalSwapVolumeUsd ?? 0) / 100}
                    detail={`${formatUsd(incentives?.totalSwapVolumeUsd ?? 0)} / ${formatUsd(100)}`}
                    cta="Swap now"
                  />
                  <TaskRow
                    label="Invite a friend"
                    hint="Share your referral link"
                    progress={incentives?.inviteCount ?? 0}
                    detail={`${incentives?.inviteCount ?? 0} invited`}
                  />
                  <TaskRow
                    label="Follow all socials"
                    hint="Required before you can claim"
                    progress={
                      (["youtube", "x", "telegram"] as const).filter((k) => incentives?.socials?.[k]).length / 3
                    }
                    detail={`${
                      (["youtube", "x", "telegram"] as const).filter((k) => incentives?.socials?.[k]).length
                    } / 3 followed`}
                  />
                </ul>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">
                  Bridge activity is tracked for history only — no task credit
                </p>
              </section>
            ) : null}

            {tab === "REFERRALS" ? (
              <>
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatCard
                    Icon={Repeat}
                    label="From Swaps"
                    value={incentives?.pointsSelf ?? 0}
                    note="Swap activity only"
                  />
                  <StatCard
                    Icon={Users}
                    label="Referral Activity"
                    value={incentives?.pointsReferralActivity ?? 0}
                    note={`${incentives?.inviteCount ?? 0} invited`}
                  />
                  <StatCard
                    Icon={Gift}
                    label="Referral Signups"
                    value={incentives?.pointsReferralSignup ?? 0}
                    note={
                      (incentives?.signupLocked ?? 0) > 0 ? `${incentives.signupLocked} locked` : "Unlocked"
                    }
                  />
                </section>

                {incentives?.referralCode ? (
                  <section className="rounded-2xl border border-hairline bg-card p-4">
                    <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">
                      Your Referral Link
                    </h2>
                    <p className="mt-2 break-all rounded-lg border border-hairline bg-background-elev px-3 py-2 font-mono text-[11px] text-muted">
                      {referralLink || `Code: ${incentives.referralCode}`}
                    </p>
                    <button
                      onClick={() => {
                        if (referralLink) void navigator.clipboard?.writeText(referralLink);
                      }}
                      className="mt-3 w-full rounded-xl bg-primary py-2.5 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground active:scale-[0.99]"
                    >
                      Copy Invite Link
                    </button>
                  </section>
                ) : (
                  <p className="rounded-2xl border border-hairline bg-card p-5 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    Referral link appears once your account is set up
                  </p>
                )}
              </>
            ) : null}

            {tab === "GIFTS" ? (
              <ComingSoon
                Icon={Gift}
                title="Gifts & Vouchers"
                body="Sending FLOW gift vouchers and soulbound collectibles is on the roadmap. Points keep accruing from swaps in the meantime."
              />
            ) : null}

            {tab === "GAMES" ? (
              <ComingSoon
                Icon={Gamepad2}
                title="Games & Challenges"
                body="ArcadeFlix P2E challenges and the Flow Fortune Wheel are in development. No game points are awarded yet."
              />
            ) : null}

            <p className="pb-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">
              Rewards are swap-only · claims require a verified email + bound wallet
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function QuickAction({
  Icon,
  label,
  note,
  to,
  onClick,
  soon,
}: {
  Icon: typeof Gift;
  label: string;
  note: string;
  to?: string;
  onClick?: () => void;
  soon?: boolean;
}) {
  const inner = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="mt-2 block text-[12px] font-bold leading-tight text-foreground">{label}</span>
      <span className="block font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted-soft">
        {note}
      </span>
    </>
  );

  const cls = `block rounded-2xl border p-3 text-left ${
    soon ? "border-hairline bg-card opacity-70" : "border-hairline bg-card hover:border-primary/30"
  }`;

  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={soon} className={cls}>
      {inner}
    </button>
  );
}

function ComingSoon({ Icon, title, body }: { Icon: typeof Gift; title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-hairline bg-card p-6 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mt-3 text-base font-black text-foreground">{title}</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{body}</p>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted">
        <Sparkles className="h-3 w-3" />
        Coming soon
      </span>
    </section>
  );
}

function OverviewTile({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3.5 ${
        accent ? "border-primary/30 bg-primary/5" : "border-hairline bg-card"
      }`}
    >
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">{unit}</p>
    </div>
  );
}

function TaskRow({
  label,
  hint,
  progress,
  detail,
  cta,
}: {
  label: string;
  hint: string;
  progress: number;
  detail: string;
  cta?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const done = pct >= 100;

  return (
    <li className="rounded-xl border border-hairline bg-background-elev p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[13px] font-bold ${done ? "text-foreground" : "text-muted"}`}>{label}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">{hint}</p>
        </div>
        {done ? (
          <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-primary">
            Done
          </span>
        ) : cta ? (
          <Link
            to="/"
            className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-primary"
          >
            {cta}
          </Link>
        ) : null}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 font-mono text-[10px] tabular-nums text-muted">{detail}</p>
    </li>
  );
}

function CheckRow({ done, label, hint }: { done: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          done ? "border-primary/40 bg-primary/15 text-primary" : "border-hairline text-muted-soft"
        }`}
      >
        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : <Circle className="h-2 w-2" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-[13px] font-bold ${done ? "text-foreground" : "text-muted"}`}>{label}</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">
          {done ? "Done" : hint}
        </span>
      </span>
    </li>
  );
}

function StatCard({
  Icon,
  label,
  value,
  note,
}: {
  Icon: typeof Gift;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-mono text-[10px] font-black uppercase tracking-[0.1em]">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums text-foreground">{value.toLocaleString()}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">{note}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-6 text-center">
      <h2 className="text-base font-black text-foreground">{title}</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
