import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Compass,
  Gamepad2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { KitIcon } from "@/components/kit/KitIcon";
import { PageIcon } from "@/components/layout/PageIcon";
import { PartnerProfileModal } from "@/components/partners/PartnerProfileModal";
import { getPartners, useAppConfig, type PartnerCard } from "@/lib/config/appConfig";
import { useAccountData } from "@/lib/app/useAccountData";
import { formatUsd } from "@/lib/format";

export const Route = createFileRoute("/partners")({
  head: () => ({
    meta: [
      { title: "Partners & Quests — FlowBridge Mini-App Marketplace" },
      {
        name: "description",
        content:
          "Browse FlowBridge partner mini-apps and campaigns — BOT Chain, CaryPact, Flow Fortune Wheel and more — and track your open FLOW quests in one place.",
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

function PartnersPage() {
  const { incentives } = useAccountData();
  const config = useAppConfig();
  const [active, setActive] = useState<PartnerCard | null>(null);

  const partners = useMemo(() => getPartners(config), [config]);
  const featured = partners.filter((p) => p.featured);
  const rest = partners.filter((p) => !p.featured);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    partners.forEach((p) => {
      const key = p.category?.trim();
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    });
    return [...map.entries()];
  }, [partners]);

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
        {/* Featured partner cards */}
        {featured.length > 0 && (
          <section>
            <p className="fb-eyebrow mb-2 px-1">Featured</p>
            <ul className="space-y-2.5">
              {featured.map((p) => (
                <li key={p.id}>
                  <FeaturedPartnerCard partner={p} onOpen={() => setActive(p)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Top categories */}
        {categories.length > 0 && (
          <section>
            <p className="fb-eyebrow mb-2 px-1">Top categories</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {categories.map(([name, count]) => (
                <li
                  key={name}
                  className="glass-card flex flex-col items-center gap-1.5 rounded-[var(--fb-radius-md)] p-3 text-center"
                >
                  <PageIcon page="partners" slot="category" size={30} />
                  <span className="block w-full truncate font-mono text-[10px] font-black uppercase tracking-[0.08em]">
                    {name}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                    {count} app{count > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* All partners */}
        {rest.length > 0 && (
          <section>
            <p className="fb-eyebrow mb-2 px-1">Mini-app marketplace</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {rest.map((p) => (
                <li key={p.id}>
                  <PartnerListCard partner={p} onOpen={() => setActive(p)} />
                </li>
              ))}
            </ul>
          </section>
        )}

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

      {active && <PartnerProfileModal partner={active} onClose={() => setActive(null)} />}

      <BottomNav />
    </div>
  );
}

function FeaturedPartnerCard({
  partner,
  onOpen,
}: {
  partner: PartnerCard;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fb-surface relative block w-full overflow-hidden p-4 text-left transition-transform active:scale-[0.995]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-primary/25 blur-3xl"
      />
      <span className="relative flex items-center gap-3">
        {partner.imageUrl ? (
          <img
            src={partner.imageUrl}
            alt={`${partner.name} logo`}
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-2xl border border-hairline object-cover"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/12">
            <PageIcon page="partners" slot="empty" size={38} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {partner.category && (
              <span className="rounded-lg bg-primary/12 px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-primary">
                {partner.category}
              </span>
            )}
            {partner.status && (
              <span className="rounded-lg border border-hairline px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted">
                {partner.status}
              </span>
            )}
          </span>
          <span className="mt-1.5 block truncate text-[15px] font-black leading-tight">
            {partner.name}
          </span>
          {partner.tagline && (
            <span className="mt-0.5 block line-clamp-2 font-mono text-[10.5px] leading-relaxed text-muted">
              {partner.tagline}
            </span>
          )}
          <span className="mt-2.5 inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-primary px-3.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground">
            {partner.ctaLabel || "Participate"}
            <ArrowUpRight className="h-3 w-3" />
          </span>
        </span>
      </span>
    </button>
  );
}

function PartnerListCard({ partner, onOpen }: { partner: PartnerCard; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-card flex h-full w-full flex-col gap-2 rounded-[var(--fb-radius-md)] p-3.5 text-left"
    >
      <span className="flex items-center gap-2">
        {partner.imageUrl ? (
          <img
            src={partner.imageUrl}
            alt={`${partner.name} logo`}
            loading="lazy"
            className="h-9 w-9 shrink-0 rounded-lg border border-hairline object-cover"
          />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <Gamepad2 className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-mono text-[12px] font-black uppercase tracking-[0.07em]">
            {partner.name}
          </span>
          <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
            {partner.category || "Partner"}
          </span>
        </span>
      </span>
      {partner.tagline && (
        <span className="line-clamp-2 font-mono text-[10.5px] leading-relaxed text-muted">
          {partner.tagline}
        </span>
      )}
      <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-lg bg-primary/12 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-primary">
        {partner.status || "View profile"}
        <TrendingUp className="h-3 w-3" />
      </span>
    </button>
  );
}
