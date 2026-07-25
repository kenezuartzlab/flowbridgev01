import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Users, Repeat, Lock, RefreshCw, Check, Circle } from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { useAccountData } from "@/lib/app/useAccountData";
import { formatUsd } from "@/lib/format";
import bridgeHero from "@/assets/bridge-hero.png";


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
