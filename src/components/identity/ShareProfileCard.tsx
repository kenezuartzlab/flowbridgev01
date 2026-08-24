/**
 * FlowBridge V29 §7 — the optional, privacy-first share card.
 *
 * Sharing is off until the user opens it and picks what to include. The preview
 * is exactly what would be copied, and it never contains email, wallet address,
 * balances, reward entitlement or private mission detail.
 */
import { useMemo, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { buildShareCard } from "@/lib/identity/shareCard";
import type { AchievementsView } from "@/lib/identity/achievements";
import type { ParticipationFacts } from "@/lib/identity/participationProfile";

export function ShareProfileCard({
  facts,
  achievements,
  displayName,
  className = "",
}: {
  facts: ParticipationFacts;
  achievements: AchievementsView;
  displayName: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const shareable = achievements.earned.filter((a) => a.shareable);
  const card = useMemo(
    () =>
      buildShareCard({
        facts,
        earned: achievements.earned,
        selectedAchievementIds: selected,
        displayName,
      }),
    [facts, achievements.earned, selected, displayName],
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* copying is optional */
    }
  };

  if (!facts.signedIn) return null;

  return (
    <section className={`fb-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-black tracking-[-0.01em]">Share your progress</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{card.privacyNote}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-card px-3 py-1.5 text-[11.5px] font-bold text-muted transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          {open ? "Close" : "Create card"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {shareable.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {shareable.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        on
                          ? "border-primary/45 bg-primary/12 text-primary"
                          : "border-hairline text-muted hover:text-foreground"
                      }`}
                    >
                      {on && <Check className="h-3 w-3" aria-hidden />}
                      {a.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11.5px] text-muted">
              You have no unlocked achievements to include yet — the card can still show your
              verified participation count.
            </p>
          )}

          <p className="rounded-[var(--fb-radius-md)] border border-hairline bg-card/60 p-3 text-[12px] leading-relaxed">
            {card.text}
          </p>

          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-[var(--fb-radius-md)] bg-primary px-3.5 text-[12.5px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy card text"}
          </button>
        </div>
      )}
    </section>
  );
}
