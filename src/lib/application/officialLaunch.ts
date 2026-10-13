/**
 * Official BOT Chain launch (Day 0). Started by the owner's explicit
 * "START OFFICIAL BOT CHAIN LAUNCH" instruction; equals the publication
 * first confirmed public availability of the official launch article on
 * flowbridge.space (HTTP 200 check; a 404 check at ~14:17 UTC preceded it). Fixed in code so it can never be
 * backdated or moved through the evidence tracker.
 */
export const OFFICIAL_LAUNCH_AT = "2026-10-13T14:19:32Z";
export const LAUNCH_ARTICLE_PATH = "/blog/flowbridge-officially-launches-on-bot-chain-mainnet";

const DAY = 86_400_000;
export const INTERACTION_WINDOW_ENDS_AT = new Date(Date.parse(OFFICIAL_LAUNCH_AT) + 8 * DAY).toISOString();
export const SOCIAL_WINDOW_ENDS_AT = new Date(Date.parse(OFFICIAL_LAUNCH_AT) + 30 * DAY).toISOString();

/** Window state never claims qualification: after the window it awaits BOT Chain review. */
export function windowStatus(endsAt: string, now = Date.now()): "IN PROGRESS" | "WINDOW CLOSED — AWAITING REVIEW" {
  return now < Date.parse(endsAt) ? "IN PROGRESS" : "WINDOW CLOSED — AWAITING REVIEW";
}
