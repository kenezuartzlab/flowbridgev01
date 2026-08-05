import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ExternalLink, Sparkles, Ticket, Trophy, X } from "lucide-react";
import { ModalPortal } from "@/modals/ModalPortal";
import { KitIcon } from "@/components/kit/KitIcon";
import type { PartnerCard } from "@/lib/config/appConfig";

/** Read-only partner profile sheet: socials, campaigns, rewards and about copy. */
export function PartnerProfileModal({
  partner,
  onClose,
}: {
  partner: PartnerCard;
  onClose: () => void;
}) {
  const links = partner.links ?? [];
  const campaigns = partner.campaigns ?? [];
  const cta = partner.ctaLabel || "Participate";
  const href = partner.href || undefined;
  const external = !!href && /^https?:\/\//i.test(href);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`${partner.name} profile`}
        onClick={onClose}
      >
        <div
          className="fb-surface relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--fb-radius-lg)] p-4 sm:rounded-[var(--fb-radius-lg)]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close partner profile"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-card text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Identity */}
          <div className="flex items-center gap-3 pr-12">
            {partner.imageUrl ? (
              <img
                src={partner.imageUrl}
                alt={`${partner.name} logo`}
                loading="lazy"
                className="h-14 w-14 shrink-0 rounded-2xl border border-hairline object-cover"
              />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/12">
                <KitIcon name="handshake" size={34} />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-black leading-tight">{partner.name}</h2>
              {partner.tagline && (
                <p className="mt-0.5 line-clamp-2 font-mono text-[10.5px] leading-relaxed text-muted">
                  {partner.tagline}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
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
              </div>
            </div>
          </div>

          {/* Socials */}
          {links.length > 0 && (
            <div className="mt-4">
              <p className="fb-eyebrow mb-2">Links</p>
              <div className="flex flex-wrap gap-1.5">
                {links.map((l) => (
                  <a
                    key={`${l.label}-${l.url}`}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {l.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Campaigns + rewards */}
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="fb-inset p-3">
              <p className="fb-eyebrow mb-2 flex items-center gap-1.5">
                <Ticket className="h-3 w-3 text-primary" /> Active campaigns
              </p>
              {campaigns.length === 0 ? (
                <p className="font-mono text-[10.5px] text-muted">No live campaigns right now.</p>
              ) : (
                <ul className="space-y-1.5">
                  {campaigns.map((c) => (
                    <li
                      key={c.title}
                      className="flex items-center justify-between gap-2 font-mono text-[10.5px]"
                    >
                      <span className="min-w-0 truncate font-black uppercase tracking-[0.06em]">
                        {c.title}
                      </span>
                      <span className="shrink-0 text-primary">{c.reward || "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="fb-inset flex min-w-[120px] flex-col justify-center p-3">
              <p className="fb-eyebrow flex items-center gap-1.5">
                <Trophy className="h-3 w-3 text-primary" /> Rewards
              </p>
              <p className="mt-1 font-mono text-[15px] font-black tabular-nums">
                {partner.totalRewards || "—"}
              </p>
            </div>
          </div>

          {/* About */}
          <div className="mt-4">
            <p className="fb-eyebrow mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" /> About
            </p>
            <p className="font-mono text-[11px] leading-relaxed text-muted">
              {partner.about || "Profile details are coming soon."}
            </p>
          </div>

          {/* CTA */}
          {href ? (
            external ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl bg-primary font-mono text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground"
              >
                {cta} <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <Link
                to={href}
                onClick={onClose}
                className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl bg-primary font-mono text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground"
              >
                {cta} <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
