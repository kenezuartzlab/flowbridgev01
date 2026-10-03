/**
 * Growth Activation + Conversion V1 — the ONE dominant next action (pure).
 *
 * Inputs are verified facts only (receipt-confirmed trades, on-chain positions,
 * stake reads, campaign records). Nothing here signs, approves, or rewards.
 */
export type NextActionId =
  | "EXPLORE"
  | "CONTINUE_MISSION"
  | "VERIFY_EMAIL"
  | "BIND_WALLET"
  | "FIRST_TRADE"
  | "VIEW_POSITIONS"
  | "CHECK_STAKING"
  | "CONTINUE_CAMPAIGN"
  | "EXPLORE_FEATURE";

export interface NextActionInput {
  signedIn: boolean;
  emailVerified: boolean;
  walletBound: boolean;
  activeMissionHref?: string | null;
  confirmedTrades: number;
  liquidityPositions: number;
  activeStakes: number;
  activeCampaigns: number;
}

export interface NextAction {
  id: NextActionId;
  label: string;
  /** Plain explanation of why this is next. */
  reason: string;
  href: string;
  /** Optional single text link — never a second primary button. */
  secondary: { label: string; href: string } | null;
  signsTransaction: false;
  grantsReward: false;
}

const mk = (id: NextActionId, label: string, reason: string, href: string, secondary: NextAction["secondary"] = null): NextAction => ({
  id, label, reason, href, secondary, signsTransaction: false, grantsReward: false,
});

export function resolveNextAction(i: NextActionInput): NextAction {
  if (!i.signedIn)
    return mk("EXPLORE", "Explore FlowBridge", "See what you can do on BOT Chain first. No account is needed to look around.", "/discover", { label: "Start trading", href: "/trade" });
  if (i.activeMissionHref)
    return mk("CONTINUE_MISSION", "Continue mission", "You have a mission in progress. Pick up where you left off.", i.activeMissionHref);
  if (!i.emailVerified)
    return mk("VERIFY_EMAIL", "Verify email", "Verifying keeps your FlowBridge profile and progress across sessions. Swap and Bridge stay open either way.", "/account");
  if (!i.walletBound)
    return mk("BIND_WALLET", "Bind wallet", "Binding links your verified wallet activity to your profile. It is a signature, not a token approval, and FlowBridge never holds your funds.", "/account");
  if (i.confirmedTrades === 0)
    return mk("FIRST_TRADE", "Make your first FlowBridge trade", "You are ready. Auto finds supported routes and shows every detail before your wallet signs.", "/trade");
  if (i.liquidityPositions > 0)
    return mk("VIEW_POSITIONS", "View positions", "You have liquidity positions. Review their current status.", "/liquidity", { label: "Explore Earn", href: "/earn" });
  if (i.activeStakes > 0)
    return mk("CHECK_STAKING", "Check staking position", "Review your stake, lock and maturity.", "/stake");
  if (i.activeCampaigns > 0)
    return mk("CONTINUE_CAMPAIGN", "Continue eligible activity", "A campaign you joined still has eligible steps.", "/campaigns");
  return mk("EXPLORE_FEATURE", "Explore another ecosystem feature", "You have traded. Learn how liquidity, staking or campaigns work next.", "/earn", { label: "Discover", href: "/discover" });
}

/** For You Now — one plain sentence derived from the same verified state. */
export function forYouNow(i: NextActionInput & { walletConnected?: boolean }): string {
  const a = resolveNextAction(i);
  switch (a.id) {
    case "EXPLORE": return i.walletConnected ? "You connected your wallet. Sign in and verify your email to keep your FlowBridge profile." : "Take a look around — trading and bridging need no account.";
    case "VERIFY_EMAIL": return "Next, verify your email to preserve your FlowBridge profile.";
    case "BIND_WALLET": return "Your email is verified. Bind your wallet to link your verified activity.";
    case "FIRST_TRADE": return "You are ready. Try your first Smart Trade.";
    case "VIEW_POSITIONS": return "You have a liquidity position. Review its range and status.";
    case "CHECK_STAKING": return "Check your staking position and maturity.";
    case "CONTINUE_CAMPAIGN": return "Continue your eligible campaign activity.";
    case "CONTINUE_MISSION": return "Continue your active mission.";
    default: return "You completed a trade. Explore how liquidity works.";
  }
}
