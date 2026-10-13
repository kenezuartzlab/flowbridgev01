/**
 * Official BOT Chain launch (Day 0). Started by the owner's explicit
 * "START OFFICIAL BOT CHAIN LAUNCH" instruction; equals the publication
 * time of the official launch article. Fixed in code so it can never be
 * backdated or moved through the evidence tracker.
 */
export const OFFICIAL_LAUNCH_AT = "2026-10-13T14:15:07Z";
export const LAUNCH_ARTICLE_PATH = "/blog/flowbridge-officially-launches-on-bot-chain-mainnet";

const DAY = 86_400_000;
export const INTERACTION_WINDOW_ENDS_AT = new Date(Date.parse(OFFICIAL_LAUNCH_AT) + 8 * DAY).toISOString();
export const SOCIAL_WINDOW_ENDS_AT = new Date(Date.parse(OFFICIAL_LAUNCH_AT) + 30 * DAY).toISOString();

/** Window state never claims qualification: after the window it awaits BOT Chain review. */
export function windowStatus(endsAt: string, now = Date.now()): "IN PROGRESS" | "WINDOW CLOSED — AWAITING REVIEW" {
  return now < Date.parse(endsAt) ? "IN PROGRESS" : "WINDOW CLOSED — AWAITING REVIEW";
}
