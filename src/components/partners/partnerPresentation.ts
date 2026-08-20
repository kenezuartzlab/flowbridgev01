/**
 * FlowBridge V10 — partner presentation resolver.
 *
 * Presentation only. Every value here is derived deterministically from the
 * authoritative admin-managed partner record in app config (name, category,
 * status, imageUrl) — no new eligibility, reward or routing semantics, and no
 * invented partner status. A missing image always degrades to preset art, so a
 * broken URL can never produce a broken partner card.
 */
import type { PartnerCard } from "@/lib/config/appConfig";

export type PartnerArtPreset = "rings" | "beams" | "nodes" | "prism";

export interface PartnerVisualConfig {
  artPreset: PartnerArtPreset;
  accentColor: string;
  gradient: string;
  imageUrl: string | null;
  seed: number;
}

const PRESETS: PartnerArtPreset[] = ["rings", "beams", "nodes", "prism"];

/** Secondary accent families — emerald stays reserved for primary actions. */
const ACCENTS = ["#22d3ee", "#818cf8", "#38bdf8", "#f59e0b", "#2dd4bf"];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type PartnerAvailability = "live" | "soon" | "development";

/** Availability is read from the admin status string only — never guessed. */
export function partnerAvailability(partner: PartnerCard): PartnerAvailability {
  const status = (partner.status ?? "").toLowerCase();
  if (/soon|launch|waitlist|beta/.test(status)) return "soon";
  if (/dev|build|progress|planned|preview/.test(status)) return "development";
  if (/live|active|open/.test(status)) return "live";
  return partner.href ? "live" : "development";
}

export function availabilityLabel(state: PartnerAvailability): string {
  if (state === "live") return "Live";
  if (state === "soon") return "Coming soon";
  return "In development";
}

export function partnerVisual(partner: PartnerCard): PartnerVisualConfig {
  const seedSource = `${partner.id}|${partner.name}|${partner.category ?? ""}`;
  const h = hash(seedSource);
  const accentColor = ACCENTS[h % ACCENTS.length];
  const artPreset = PRESETS[(h >> 3) % PRESETS.length];

  return {
    artPreset,
    accentColor,
    gradient: `linear-gradient(140deg, ${accentColor}26 0%, transparent 55%, ${accentColor}14 100%)`,
    imageUrl: partner.imageUrl || null,
    seed: (h % 100) / 100,
  };
}

/** Partner categories with counts, in stable display order. */
export function partnerCategories(partners: PartnerCard[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  partners.forEach((p) => {
    const key = p.category?.trim();
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
  });
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
