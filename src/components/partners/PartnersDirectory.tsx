/**
 * FlowBridge V10 — Explore ▸ Partners.
 *
 * The single partner discovery surface. It renders only authoritative
 * admin-managed partner data, shows explicit Coming soon / In development states
 * for anything not launched, and no longer embeds a duplicate campaign list —
 * campaign discovery lives in Explore ▸ Campaigns.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { PartnerVisual } from "./PartnerVisual";
import { PartnerProfileModal } from "./PartnerProfileModal";
import {
  availabilityLabel,
  partnerAvailability,
  partnerCategories,
} from "./partnerPresentation";
import { getPartners, useAppConfig, type PartnerCard } from "@/lib/config/appConfig";

export function PartnersDirectory() {
  const config = useAppConfig();
  const [active, setActive] = useState<PartnerCard | null>(null);
  const [category, setCategory] = useState("all");

  const partners = useMemo(() => getPartners(config), [config]);
  const categories = useMemo(() => partnerCategories(partners), [partners]);

  const visible = partners.filter(
    (p) => category === "all" || (p.category ?? "").trim() === category,
  );
  const featured = visible.filter((p) => p.featured);
  const rest = visible.filter((p) => !p.featured);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[var(--fb-radius-lg,20px)] px-1 py-2">
        <h2 className="text-[19px] font-black leading-tight tracking-[-0.02em] sm:text-[23px]">
          Mini-apps and partners building on FlowBridge
        </h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">
          Partner experiences across BOT Chain. Campaign quests and Campaign PTS live in{" "}
          <Link to="/campaigns" className="font-bold text-primary">
            Explore ▸ Campaigns
          </Link>
          .
        </p>
      </section>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <CategoryChip
            label="All"
            count={partners.length}
            active={category === "all"}
            onClick={() => setCategory("all")}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.name}
              label={c.name}
              count={c.count}
              active={category === c.name}
              onClick={() => setCategory(c.name)}
            />
          ))}
        </div>
      )}

      {featured.length > 0 && (
        <section>
          <p className="fb-eyebrow mb-2 px-1">Featured</p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {featured.map((p) => (
              <li key={p.id}>
                <FeaturedPartner partner={p} onOpen={() => setActive(p)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <p className="fb-eyebrow mb-2 px-1">Mini-app marketplace</p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rest.map((p) => (
              <li key={p.id}>
                <PartnerTile partner={p} onOpen={() => setActive(p)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {visible.length === 0 && (
        <p className="px-1 text-[12.5px] text-muted">No partners in this category yet.</p>
      )}

      {active && <PartnerProfileModal partner={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition-colors ${
        active
          ? "border-primary/45 bg-primary/12 text-primary"
          : "border-hairline text-muted hover:text-foreground"
      }`}
    >
      {label}
      <span className="font-mono text-[10.5px] tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function AvailabilityBadge({ partner }: { partner: PartnerCard }) {
  const state = partnerAvailability(partner);
  const tone =
    state === "live"
      ? "border-success/30 bg-success/10 text-success"
      : state === "soon"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-hairline text-muted";
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] font-black uppercase tracking-[0.08em] ${tone}`}
    >
      {partner.status?.trim() || availabilityLabel(state)}
    </span>
  );
}

function FeaturedPartner({ partner, onOpen }: { partner: PartnerCard; onOpen: () => void }) {
  const state = partnerAvailability(partner);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full overflow-hidden rounded-[var(--fb-radius-lg,20px)] border border-hairline bg-card text-left transition-transform hover:-translate-y-0.5 active:scale-[0.995] motion-reduce:transform-none"
    >
      <PartnerVisual partner={partner} variant="banner" />
      <span className="block p-4">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-bold text-primary">
            <Sparkles className="h-3 w-3" aria-hidden /> Featured
          </span>
          {partner.category && (
            <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
              {partner.category}
            </span>
          )}
          <AvailabilityBadge partner={partner} />
        </span>
        <span className="mt-2 block truncate text-[17px] font-black leading-tight">
          {partner.name}
        </span>
        {partner.tagline && (
          <span className="mt-1 block line-clamp-2 text-[12.5px] leading-relaxed text-muted">
            {partner.tagline}
          </span>
        )}
        <span
          className={`mt-3 inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold ${
            state === "live"
              ? "bg-primary text-primary-foreground"
              : "border border-hairline text-muted"
          }`}
        >
          {state === "live" ? partner.ctaLabel || "Open" : availabilityLabel(state)}
          {state === "live" && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
        </span>
      </span>
    </button>
  );
}

function PartnerTile({ partner, onOpen }: { partner: PartnerCard; onOpen: () => void }) {
  const state = partnerAvailability(partner);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full flex-col overflow-hidden rounded-[var(--fb-radius-lg,20px)] border border-hairline bg-card text-left transition-colors hover:border-primary/35"
    >
      <PartnerVisual partner={partner} variant="tile" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13.5px] font-black">{partner.name}</span>
          <AvailabilityBadge partner={partner} />
        </span>
        <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
          {partner.category || "Partner"}
        </span>
        {partner.tagline && (
          <span className="line-clamp-2 text-[12px] leading-relaxed text-muted">
            {partner.tagline}
          </span>
        )}
        <span className="mt-auto pt-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary">
          {state === "live" ? "View profile" : availabilityLabel(state)}
        </span>
      </span>
    </button>
  );
}
