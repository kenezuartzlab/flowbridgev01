import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Compass,
  Gamepad2,
  Gift,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { useAccountData } from "@/lib/app/useAccountData";
import { formatUsd } from "@/lib/format";

export const Route = createFileRoute("/partners")({
  head: () => ({
    meta: [
      { title: "Partners & Quests — FlowBridge Mini-App Marketplace" },
      {
        name: "description",
        content:
          "Browse FlowBridge partner mini-apps — Flow Fortune Wheel, ArcadeFlix P2E and Ecosurge Growth Hub — and track your open FLOW quests in one place.",
      },
      { property: "og:title", content: "FlowBridge Partners & Quest Center" },
      {
        property: "og:description",
        content: "Partner mini-apps on BOT Chain plus your live FLOW quest progress.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/partners" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/partners" }],
  }),
  component: PartnersPage,
});

const PARTNERS = [
  {
    to: "/fortune",
    name: "Flow Fortune Wheel",
    tag: "Daily spins",
    blurb: "Two free spins a day with a 50 FLOW jackpot.",
    status: "Launching soon",
    Icon: Gift,
  },
  {
    to: "/arcadeflix",
    name: "ArcadeFlix P2E",
    tag: "Play to earn",
    blurb: "Skill-based arcade with weekly FLOW prize pools.",
    status: "In development",
    Icon: Gamepad2,
  },
  {
    to: "/ecosurge",
    name: "Ecosurge Growth Hub",
    tag: "Ecosystem quests",
    blurb: "Partner campaigns that stack FLOW multipliers.",
    status: "Partner onboarding",
    Icon: TrendingUp,
  },
] as const;

function PartnersPage() {
  const { incentives } = useAccountData();

  const socials = (["youtube", "x", "telegram"] as const).filter(
    (k) => incentives?.socials?.[k],
  ).length;
  const volume = Number(incentives?.totalSwapVolumeUsd ?? 0);
  const invites = Number(incentives?.inviteCount ?? 0);
  const selfPoints = Number(incentives?.pointsSelf ?? 0);

  const QUESTS = [
    {
      label: "Complete your first swap",
      detail: `${selfPoints.toLocaleString("en-US")} FLOW from swaps`,
      progress: selfPoints > 0 ? 1 : 0,
      Icon: Sparkles,
    },
    {
      label: "Reach $100 swap volume",
      detail: `${formatUsd(volume)} / ${formatUsd(100)}`,
      progress: volume / 100,
      Icon: Target,
    },
    {
      label: "Invite 3 traders",
      detail: `${invites} invited`,
      progress: invites / 3,
      Icon: Users,
    },
    {
      label: "Link all social accounts",
      detail: `${socials} / 3 linked`,
      progress: socials / 3,
      Icon: Compass,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Compass className="h-4 w-4" />
            </span>
            <h1 className="truncate font-mono text-[13px] font-black uppercase tracking-[0.14em]">
              Partners<span className="text-primary">.</span>
            </h1>
          </div>
          <Link
            to="/rewards"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            Rewards <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-3 sm:p-4">
        {/* Marketplace */}
        <section>
          <p className="fb-eyebrow mb-2 px-1">Mini-app marketplace</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PARTNERS.map(({ to, name, tag, blurb, status, Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="glass-card flex h-full flex-col gap-2 rounded-[var(--fb-radius-md)] p-3.5"
                >
                  <span className="flex items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[12px] font-black uppercase tracking-[0.07em]">
                        {name}
                      </span>
                      <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                        {tag}
                      </span>
                    </span>
                  </span>
                  <span className="font-mono text-[10.5px] leading-relaxed text-muted">{blurb}</span>
                  <span className="mt-auto inline-flex w-fit items-center rounded-lg bg-primary/12 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-primary">
                    {status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Quest center */}
        <section className="fb-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <p className="fb-eyebrow">Quest center</p>
            <Link
              to="/rewards"
              className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
            >
              All rewards
            </Link>
          </div>
          <ul className="divide-y divide-hairline">
            {QUESTS.map(({ label, detail, progress, Icon }) => {
              const pct = Math.max(0, Math.min(1, progress));
              const done = pct >= 1;
              return (
                <li key={label} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                      done ? "bg-success/15 text-success" : "bg-primary/12 text-primary"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11.5px] font-black uppercase tracking-[0.06em]">
                      {label}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className={`h-full rounded-full ${done ? "bg-success" : "bg-primary"}`}
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                      {detail}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] font-black tabular-nums text-muted">
                    {Math.round(pct * 100)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
