import { ExploreTabs } from "@/components/campaigns/ExploreTabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, Award, Compass, Medal, ShieldCheck, Trophy, User2, Wallet2 } from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { SignInButton } from "@/components/auth/SignInButton";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";
import { useParticipantData } from "@/lib/campaign/useParticipantData";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { ActivityTimeline } from "@/components/campaigns/ActivityTimeline";
import { LeaderboardTable } from "@/components/campaigns/LeaderboardTable";
import {
  AchievementChip,
  ProgressBar,
  SkeletonCard,
} from "@/components/campaigns/CampaignBits";
import { campaignMetrics, shortWallet } from "@/components/campaigns/campaignPresentation";
import { formatDateTime } from "@/components/campaigns/activityPresentation";

export const Route = createFileRoute("/campaigns/me")({
  head: () => ({
    meta: [
      { title: "My Progress — FlowBridge" },
      {
        name: "description",
        content:
          "Track your FlowBridge Campaign PTS, completed campaign tasks, verified on-chain activity history and leaderboard rank in one participant center.",
      },
      { property: "og:title", content: "My Progress — FlowBridge" },
      {
        property: "og:description",
        content: "Campaign PTS, verified activity history and leaderboard rank.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/campaigns/me" }],
  }),
  component: ParticipantCenterPage,
});

type Tab = "overview" | "campaigns" | "activity" | "leaderboard";

function ParticipantCenterPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const {
    authenticated,
    loading: pLoading,
    error: pError,
    me,
    leaderboard,
    leaderboardTotal,
  } = useParticipantData(25);
  const { campaigns, progressFor, loading: cLoading } = useCampaignProgress();

  const rows = useMemo(
    () =>
      campaigns.map((c) => {
        const progress = progressFor(c.campaignId);
        return { campaign: c, progress, metrics: campaignMetrics(c, progress) };
      }),
    [campaigns, progressFor],
  );

  const completedCampaigns = rows.filter((r) => authenticated && r.metrics.isComplete);
  const inProgress = rows.filter((r) => !completedCampaigns.includes(r));
  const completedTasks = me?.completions.length ?? 0;
  const totalTasks = rows.reduce((sum, r) => sum + r.metrics.taskCount, 0);
  const completionRate = totalTasks ? completedTasks / totalTasks : 0;
  const recent = me?.completions[0] ?? null;

  /** Display-only badges. Each is derived strictly from real state. */
  const achievements = [
    completedCampaigns.length > 0 && {
      label: "First campaign completed",
      icon: <Award className="h-3 w-3" aria-hidden />,
      tone: "success" as const,
    },
    completedTasks > 0 && {
      label: `${completedTasks} verified task${completedTasks > 1 ? "s" : ""}`,
      icon: <ShieldCheck className="h-3 w-3" aria-hidden />,
      tone: "primary" as const,
    },
    !!me?.rank &&
      me.rank <= 10 && {
        label: `Top 10 · rank #${me.rank}`,
        icon: <Medal className="h-3 w-3" aria-hidden />,
        tone: "primary" as const,
      },
    (me?.campaignPointsTotal ?? 0) >= 250 && {
      label: "250+ Campaign PTS",
      icon: <Trophy className="h-3 w-3" aria-hidden />,
      tone: "primary" as const,
    },
  ].filter(Boolean) as { label: string; icon: React.ReactNode; tone: "primary" | "success" }[];

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "campaigns", label: "Campaigns" },
    { id: "activity", label: "Activity" },
    { id: "leaderboard", label: "Leaderboard" },
  ];

  const needsSignIn = !authenticated;
  const loading = pLoading || cLoading;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <User2 className="h-4 w-4" aria-hidden />
            </span>
            <h1 className="truncate font-mono text-[13px] font-black uppercase tracking-[0.14em]">
              My progress<span className="text-primary">.</span>
            </h1>
          </div>
          <Link
            to="/campaigns"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Compass className="h-3.5 w-3.5" aria-hidden />
            Explore
          </Link>
        </div>
      </header>

      <main className="fb-fade-in mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
        <ExploreTabs className="px-1" />
        {/* Summary hero */}
        <section className="fb-surface relative overflow-hidden p-4 sm:p-5">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
          />
          <p className="fb-eyebrow relative">Participant center</p>
          <h2 className="relative mt-1.5 text-[19px] font-black leading-tight sm:text-[22px]">
            Your verified campaign progress
          </h2>
          <dl className="relative mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
              label="Campaign PTS"
              value={(me?.campaignPointsTotal ?? 0).toLocaleString("en-US")}
            />
            <Stat
              icon={<Compass className="h-3.5 w-3.5" aria-hidden />}
              label="Campaigns done"
              value={`${completedCampaigns.length}/${rows.length}`}
            />
            <Stat
              icon={<Activity className="h-3.5 w-3.5" aria-hidden />}
              label="Tasks done"
              value={String(completedTasks)}
            />
            <Stat
              icon={<Wallet2 className="h-3.5 w-3.5" aria-hidden />}
              label="Rank"
              value={me?.rank ? `#${me.rank}` : needsSignIn ? "Sign in" : "Unranked"}
            />
          </dl>
          <div className="relative mt-3">
            <ProgressBar value={completionRate} label="Task completion rate" tone="success" />
            <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
              {me?.wallet ? `Tracking ${shortWallet(me.wallet)}` : "No wallet bound"} · Campaign PTS
              is separate from FLOW rewards
            </p>
          </div>
        </section>

        {/* Achievement shelf — display only, no reward state */}
        {!needsSignIn && achievements.length > 0 && (
          <section className="fb-surface p-3.5">
            <p className="fb-eyebrow">Achievements</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {achievements.map((a) => (
                <AchievementChip key={a.label} label={a.label} icon={a.icon} tone={a.tone} />
              ))}
            </div>
          </section>
        )}

        {/* Tabs */}
        <div role="tablist" aria-label="Participant sections" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-[34px] items-center rounded-xl border px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                tab === t.id
                  ? "border-primary/45 bg-primary/12 text-primary"
                  : "border-hairline text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {pError && (
          <p className="fb-surface p-4 font-mono text-[10.5px] text-danger">{pError}</p>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : tab === "overview" ? (
          <section className="space-y-3">
            {needsSignIn ? (
              <ConnectState />
            ) : (
              <>
                <div className="fb-surface p-4">
                  <p className="fb-eyebrow">Most recent completion</p>
                  {recent ? (
                    <p className="mt-1.5 font-mono text-[11px]">
                      {recent.points.toLocaleString("en-US")} PTS ·{" "}
                      {formatDateTime(recent.completedAt)}
                    </p>
                  ) : (
                    <p className="mt-1.5 font-mono text-[10.5px] text-muted">
                      No verified completion yet. Finish a campaign task to start earning
                      Campaign PTS.
                    </p>
                  )}
                </div>
                {inProgress.length > 0 && (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {inProgress.slice(0, 2).map(({ campaign, progress }) => (
                      <li key={campaign.campaignId}>
                        <CampaignCard
                          campaign={campaign}
                          progress={progress}
                          authenticated={authenticated}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        ) : tab === "campaigns" ? (
          <section className="space-y-4">
            <Group title="In progress" empty="Nothing in progress right now.">
              {inProgress.map(({ campaign, progress }) => (
                <li key={campaign.campaignId}>
                  <CampaignCard
                    campaign={campaign}
                    progress={progress}
                    authenticated={authenticated}
                  />
                </li>
              ))}
            </Group>
            <Group title="Completed" empty="No completed campaigns yet.">
              {completedCampaigns.map(({ campaign, progress }) => (
                <li key={campaign.campaignId}>
                  <CampaignCard
                    campaign={campaign}
                    progress={progress}
                    authenticated={authenticated}
                  />
                </li>
              ))}
            </Group>
          </section>
        ) : tab === "activity" ? (
          <section className="space-y-3">
            {needsSignIn ? (
              <ConnectState />
            ) : (me?.activity.length ?? 0) === 0 ? (
              <EmptyCard
                title="No verified activity yet"
                body="Verified bridge activity appears here once source-chain verification confirms it."
              />
            ) : (
              <>
                <ActivityTimeline items={me!.activity} />
                <p className="px-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                  Verification confirms the source-chain action only — it is not destination
                  bridge completion.
                </p>
              </>
            )}
          </section>
        ) : (
          <section className="space-y-3">
            {leaderboard.length === 0 ? (
              <EmptyCard
                title="Leaderboard is empty"
                body="Ranks appear as soon as Campaign PTS is settled for participating wallets."
              />
            ) : (
              <>
                <LeaderboardTable rows={leaderboard} wallet={me?.wallet ?? null} />
                {me?.wallet && me.rank && me.rank > leaderboard.length && (
                  <LeaderboardTable
                    rows={[
                      {
                        rank: me.rank,
                        wallet: me.wallet,
                        campaignPoints: me.campaignPointsTotal,
                      },
                    ]}
                    wallet={me.wallet}
                  />
                )}
                <p className="px-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                  {leaderboard.length} of {leaderboardTotal} ranked wallets · totals from the
                  Campaign PTS ledger
                </p>
              </>
            )}
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function Group({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const has = items.flat().filter(Boolean).length > 0;
  return (
    <div className="space-y-2">
      <p className="fb-eyebrow px-1">{title}</p>
      {has ? (
        <ul className="grid gap-3 sm:grid-cols-2">{children}</ul>
      ) : (
        <p className="fb-surface p-4 font-mono text-[10.5px] text-muted">{empty}</p>
      )}
    </div>
  );
}

function ConnectState() {
  return (
    <div className="fb-surface p-5 text-center">
      <p className="font-mono text-[11px] font-black uppercase tracking-[0.08em]">
        Sign in to see your progress
      </p>
      <p className="mx-auto mt-1.5 max-w-sm font-mono text-[10px] leading-relaxed text-muted">
        Private progress and verified activity are bound to the wallet on your account. The
        campaign explorer and leaderboard stay public.
      </p>
      <div className="mt-3 flex justify-center">
        <SignInButton />
      </div>
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="fb-surface p-5 text-center">
      <p className="font-mono text-[11px] font-black uppercase tracking-[0.08em]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm font-mono text-[10px] leading-relaxed text-muted">
        {body}
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="fb-inset min-w-0 p-2.5">
      <dt className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
        <span className="text-primary">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-[13px] font-black tabular-nums">{value}</dd>
    </div>
  );
}
