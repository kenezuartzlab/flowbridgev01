/**
 * FlowBridge V29 §7 — the optional, privacy-first share card (pure).
 *
 * Sharing is OFF by default and the user chooses what goes on the card. Only
 * safe public facts are allowed: selected achievement titles, a participation
 * count, the verified-account badge and a user-chosen display name.
 *
 * Never shared: email, full wallet address, balances, FLOW / FLOW Points /
 * Campaign PTS amounts, reward entitlement, private mission details, internal
 * identifiers. `redactShareCard` is the single gate every share text passes.
 */
import type { ParticipationFacts } from "./participationProfile";
import type { AchievementView } from "./achievements";

export const SHARE_SCHEMA_VERSION = "flowbridge.sharecard/1" as const;
export const SHARE_POLICY_VERSION = "V29" as const;

/** Sharing is opt-in (V29 §7). */
export const SHARE_ENABLED_BY_DEFAULT = false as const;

export const SHARE_PRIVACY_NOTE =
  "Your card never includes your email, your full wallet address, your balances or your rewards. You choose what to share.";

export interface ShareCardInput {
  facts: ParticipationFacts;
  earned: readonly AchievementView[];
  /** Achievement ids the user ticked. Empty means none. */
  selectedAchievementIds: readonly string[];
  /** A display name the user already chose in FlowBridge, or null. */
  displayName: string | null;
}

export interface ShareCard {
  schemaVersion: typeof SHARE_SCHEMA_VERSION;
  policyVersion: typeof SHARE_POLICY_VERSION;
  /** Safe name; falls back to a neutral label. */
  name: string;
  verifiedAccount: boolean;
  /** Count of verified actions — a count only, never amounts. */
  participationCount: number;
  achievementTitles: readonly string[];
  /** One-line, share-ready text. Already redacted. */
  text: string;
  privacyNote: string;
  /** V29 §14 — asserted constants. */
  includesEmail: false;
  includesWalletAddress: false;
  includesBalances: false;
  includesRewardEntitlement: false;
  includesMissionDetails: false;
  claimsThirdPartyStatus: false;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const ADDRESS_RE = /0x[a-fA-F0-9]{6,}/;

/** Strips anything private that ever slipped into a share string. */
export function redactShareCard(text: string): string {
  return text.replace(EMAIL_RE, "").replace(ADDRESS_RE, "").replace(/\s{2,}/g, " ").trim();
}

/** True when a candidate share string is safe to publish. */
export function isShareTextSafe(text: string): boolean {
  return !EMAIL_RE.test(text) && !ADDRESS_RE.test(text);
}

function safeName(displayName: string | null): string {
  const n = (displayName ?? "").trim();
  if (!n || EMAIL_RE.test(n) || ADDRESS_RE.test(n)) return "A FlowBridge member";
  return n.slice(0, 24);
}

export function buildShareCard(input: ShareCardInput): ShareCard {
  const { facts } = input;
  const selected = new Set(input.selectedAchievementIds);
  const titles = input.earned
    .filter((a) => a.shareable && selected.has(a.id))
    .map((a) => a.title)
    .slice(0, 4);

  const participationCount =
    facts.swaps + facts.bridges + facts.campaignCompletions + facts.stakes;
  const verifiedAccount = facts.signedIn && facts.emailVerified && facts.walletBound;
  const name = safeName(input.displayName);

  const parts = [
    `${name} on FlowBridge`,
    verifiedAccount ? "Verified account" : null,
    participationCount > 0
      ? `${participationCount} verified action${participationCount === 1 ? "" : "s"} on BOT Chain`
      : null,
    titles.length ? titles.join(" · ") : null,
    "Earn. Learn. Grow. Support BOT Chain.",
  ].filter(Boolean) as string[];

  return {
    schemaVersion: SHARE_SCHEMA_VERSION,
    policyVersion: SHARE_POLICY_VERSION,
    name,
    verifiedAccount,
    participationCount,
    achievementTitles: titles,
    text: redactShareCard(parts.join(" — ")),
    privacyNote: SHARE_PRIVACY_NOTE,
    includesEmail: false,
    includesWalletAddress: false,
    includesBalances: false,
    includesRewardEntitlement: false,
    includesMissionDetails: false,
    claimsThirdPartyStatus: false,
  };
}
