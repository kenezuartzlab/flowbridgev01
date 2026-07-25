import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Users, Repeat, Lock, RefreshCw, Check, Circle, Target } from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { useAccountData } from "@/lib/app/useAccountData";
import { formatUsd } from "@/lib/format";
const bridgeHero = "/__l5e/assets-v1/11289c81-991d-49ad-a2c1-b3e55906cf5c/bridge-hero.png";


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

function RewardsPage() {
  const { user, incentives, loading, refresh } = useAccountData();

  const referralLink =
    typeof window !== "undefined" && incentives?.referralCode
      ? `${window.location.origin}/?ref=${incentives.referralCode}`
      : "";

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

      <main className="mx-auto max-w-lg px-4 py-5">
        {!user ? (
          <EmptyState
            title="Sign in to see your FLOW"
            body="FLOW points are tied to a verified email plus the wallet bound to it. Sign in on the swap screen to start tracking rewards."
          />
        ) : (
          <div className="space-y-4">
            {/* Balance hero */}
            <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/5 p-5 text-center">
              <img
                src={bridgeHero}
                alt=""
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-4 h-28 w-28 select-none object-contain opacity-20"
                draggable={false}
              />
              <p className="relative font-mono text-[10px] font-black uppercase tracking-[0.14em] text-muted">
                Total FLOW Points
              </p>
              <p className="relative mt-1 text-4xl font-black tabular-nums text-primary">
                {(incentives?.flowPoints ?? 0).toLocaleString()}
              </p>
              <p className="relative mt-1 font-mono text-[11px] text-muted">
                Claimed: {(incentives?.claimedTokens ?? 0).toLocaleString()} FLOW · Claimable now:{" "}
                {(incentives?.claimableTotal ?? 0).toLocaleString()}
              </p>
            </section>
            {/* Rewards Overview */}
            <section>
              <h2 className="mb-2 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-muted">
                Rewards Overview
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <OverviewTile
                  label="Claimable"
                  value={(incentives?.claimableTotal ?? 0).toLocaleString()}
                  unit="FLOW"
                  accent
                />
                <OverviewTile
                  label="Claimed"
                  value={(incentives?.claimedTokens ?? 0).toLocaleString()}
                  unit="FLOW"
                />
                <OverviewTile
                  label="Swap Volume"
                  value={formatUsd(incentives?.totalSwapVolumeUsd ?? 0)}
                  unit="lifetime"
                />
                <OverviewTile
                  label="Invites"
                  value={(incentives?.inviteCount ?? 0).toLocaleString()}
                  unit="friends"
                />
              </div>
            </section>

            {/* Earn / Tasks */}
            <section className="rounded-2xl border border-hairline bg-card p-4">
              <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-primary" />
                <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">
                  Earn / Tasks
                </h2>
              </div>
              <ul className="mt-3 space-y-2.5">
                <TaskRow
                  label="Complete a swap"
                  hint="Swaps accrue FLOW · bridges never do"
                  progress={Math.min(1, (incentives?.pointsSelf ?? 0) > 0 ? 1 : 0)}
                  detail={`${(incentives?.pointsSelf ?? 0).toLocaleString()} FLOW from swaps`}
                  cta="Swap now"
                />
                <TaskRow
                  label="Reach $100 swap volume"
                  hint="Unlocks referral signup points"
                  progress={Math.min(1, (incentives?.totalSwapVolumeUsd ?? 0) / 100)}
                  detail={`${formatUsd(incentives?.totalSwapVolumeUsd ?? 0)} / ${formatUsd(100)}`}
                  cta="Swap now"
                />
                <TaskRow
                  label="Invite a friend"
                  hint="Share your referral link below"
                  progress={Math.min(1, (incentives?.inviteCount ?? 0) / 1)}
                  detail={`${incentives?.inviteCount ?? 0} invited`}
                />
                <TaskRow
                  label="Follow all socials"
                  hint="Required before you can claim"
                  progress={
                    (["youtube", "x", "telegram"] as const).filter((k) => incentives?.socials?.[k])
                      .length / 3
                  }
                  detail={`${
                    (["youtube", "x", "telegram"] as const).filter((k) => incentives?.socials?.[k])
                      .length
                  } / 3 followed`}
                />
              </ul>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">
                Bridge activity is tracked for history only — no task credit
              </p>
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
                <CheckRow
                  done={!!incentives?.socials?.x}
                  label="Follow on X"
                  hint="Required before claiming"
                />
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


            {/* Category split */}
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
                  (incentives?.signupLocked ?? 0) > 0
                    ? `${incentives.signupLocked} locked`
                    : "Unlocked"
                }
              />
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
                Referral signup points unlock with real swap volume. Bridging is recorded in your
                activity for attribution but never earns points.
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

            {/* Referral link */}
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
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-black tabular-nums ${accent ? "text-primary" : "text-foreground"}`}
      >
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
          <p className={`text-[13px] font-bold ${done ? "text-foreground" : "text-muted"}`}>
            {label}
          </p>
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
        <span
          className={`block text-[13px] font-bold ${done ? "text-foreground" : "text-muted"}`}
        >
          {label}
        </span>
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
      <p className="mt-2 text-2xl font-black tabular-nums text-foreground">
        {value.toLocaleString()}
      </p>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">{note}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-6 text-center">
      <h2 className="text-base font-black text-foreground">{title}</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{body}</p>
      <Link
        to="/"
        className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
      >
        Go to Swap
      </Link>
    </div>
  );
}
