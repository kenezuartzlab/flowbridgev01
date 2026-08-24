/**
 * FlowBridge V29 §2/§4/§6 — the participation profile model (pure).
 *
 * Hard rules encoded here:
 *  - Every fact comes from verified FlowBridge records. Nothing is estimated,
 *    invented or extrapolated.
 *  - There is NO Flow Score, level, rank, percentile or progress-to-level meter,
 *    because no approved FlowBridge scoring formula exists (V29 §4 fail-closed).
 *  - Rendering a profile creates no Mission, no ActionIntent, no reward and no
 *    transaction. It is presentation over already-settled records.
 *  - Private data (full email, full wallet address, internal ids) never enters
 *    the view; only masked hints do.
 */

export const PROFILE_SCHEMA_VERSION = "flowbridge.profile/1" as const;
export const PROFILE_POLICY_VERSION = "V29" as const;

/** V29 §4 — the explicit, testable refusal to invent a score. */
export const FLOW_SCORE_FORMULA_APPROVED = false as const;
export const PARTICIPATION_SUMMARY_NOTE =
  "This is a plain summary of what FlowBridge can verify. There is no score, level or rank.";

/** Verified facts, all server-resolved. */
export interface ParticipationFacts {
  signedIn: boolean;
  emailVerified: boolean;
  walletBound: boolean;
  /** Masked hints only — never the full values. */
  emailHint: string | null;
  walletHint: string | null;
  displayName: string | null;
  swaps: number;
  bridges: number;
  sends: number;
  verifiedActivities: number;
  campaignCompletions: number;
  campaignPoints: number;
  flowPoints: number;
  claimedFlow: number;
  stakes: number;
  missionsCompleted: number;
  referrals: number;
  /** ISO timestamps of the first and most recent verified record. */
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  /** Distinct days with at least one verified record. */
  activeDays: number;
}

export const EMPTY_PARTICIPATION_FACTS: ParticipationFacts = {
  signedIn: false,
  emailVerified: false,
  walletBound: false,
  emailHint: null,
  walletHint: null,
  displayName: null,
  swaps: 0,
  bridges: 0,
  sends: 0,
  verifiedActivities: 0,
  campaignCompletions: 0,
  campaignPoints: 0,
  flowPoints: 0,
  claimedFlow: 0,
  stakes: 0,
  missionsCompleted: 0,
  referrals: 0,
  firstActivityAt: null,
  lastActivityAt: null,
  activeDays: 0,
};

/** V29 §6 — progress story, from real completed milestones only. */
export type ProfileStage = "PUBLIC" | "SETTING_UP" | "ACCOUNT_READY" | "PARTICIPATING" | "GROWING";

export const STAGE_LABEL: Record<ProfileStage, string> = {
  PUBLIC: "Not signed in",
  SETTING_UP: "Setting up",
  ACCOUNT_READY: "Account ready",
  PARTICIPATING: "Participating",
  GROWING: "Growing",
};

/** V29 §2 — friendly labels, shown ONLY when the data proves them. */
export type ParticipationTagId =
  | "ACTIVE"
  | "LEARNING"
  | "PARTICIPATING"
  | "STAKING"
  | "CAMPAIGN_PARTICIPANT"
  | "MISSION_COMPLETED"
  | "VERIFIED_ACCOUNT";

export interface ParticipationTag {
  id: ParticipationTagId;
  label: string;
  /** The verified record that earns this label. */
  evidence: string;
}

export interface ParticipationStat {
  id: string;
  label: string;
  value: string;
  /** Plain-English source, never a table name (V29 §10). */
  source: string;
}

export interface ProfileNextStep {
  id: string;
  label: string;
  body: string;
  href: string;
  /** True when the user must confirm something in their own wallet. */
  requiresWalletConfirmation: boolean;
}

export interface ParticipationView {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  policyVersion: typeof PROFILE_POLICY_VERSION;
  stage: ProfileStage;
  stageLabel: string;
  headline: string;
  message: string;
  readiness: { emailVerified: boolean; walletBound: boolean; setupComplete: boolean };
  tags: readonly ParticipationTag[];
  stats: readonly ParticipationStat[];
  /** True when there is genuinely nothing to summarize yet. */
  emptyParticipation: boolean;
  emptyNote: string | null;
  nextStep: ProfileNextStep;
  /** Only present when a concrete mechanism can be explained (V29 §5). */
  whyBotChain: string | null;
  summaryNote: string;
  /** V29 §4 — asserted constants. */
  hasFlowScore: false;
  hasLevel: false;
  hasRank: false;
  /** V29 §14 — asserted authority constants. */
  createsMission: false;
  createsActionIntent: false;
  settlesReward: false;
  signsTransaction: false;
}

const fmt = (n: number) => Math.max(0, Math.floor(n)).toLocaleString("en-US");

/** Masks an email to a safe hint, e.g. "ke•••2@g•••.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const [user, domain] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const tld = dot > 0 ? domain.slice(dot) : "";
  const head = domain.slice(0, 1);
  const u = user.length <= 2 ? `${user.slice(0, 1)}•••` : `${user.slice(0, 2)}•••${user.slice(-1)}`;
  return `${u}@${head}•••${tld}`;
}

/** Masks a wallet address to a safe hint, e.g. "0x9f…4c21". */
export function maskWallet(address: string | null | undefined): string | null {
  if (!address || address.length < 10) return null;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function totalActions(f: ParticipationFacts): number {
  return f.swaps + f.bridges + f.sends + f.campaignCompletions + f.stakes;
}

function resolveTags(f: ParticipationFacts): ParticipationTag[] {
  const tags: ParticipationTag[] = [];
  if (f.emailVerified && f.walletBound) {
    tags.push({
      id: "VERIFIED_ACCOUNT",
      label: "Verified account",
      evidence: "Email confirmed and a wallet bound to this account.",
    });
  }
  if (totalActions(f) > 0) {
    tags.push({
      id: "ACTIVE",
      label: "Active on FlowBridge",
      evidence: "At least one completed action in your FlowBridge records.",
    });
  }
  if (f.verifiedActivities > 0) {
    tags.push({
      id: "PARTICIPATING",
      label: "Participating",
      evidence: "FlowBridge verified your on-chain activity.",
    });
  }
  if (f.stakes > 0) {
    tags.push({ id: "STAKING", label: "Staking", evidence: "A recorded staking action." });
  }
  if (f.campaignCompletions > 0) {
    tags.push({
      id: "CAMPAIGN_PARTICIPANT",
      label: "Campaign participant",
      evidence: "A verified campaign task completion.",
    });
  }
  if (f.missionsCompleted > 0) {
    tags.push({
      id: "MISSION_COMPLETED",
      label: "Mission completed",
      evidence: "A completed FlowBridge mission with verified evidence.",
    });
  }
  if (f.activeDays >= 2) {
    tags.push({
      id: "LEARNING",
      label: "Learning",
      evidence: "You came back on more than one day.",
    });
  }
  return tags;
}

function resolveStats(f: ParticipationFacts): ParticipationStat[] {
  const stats: ParticipationStat[] = [];
  const push = (id: string, label: string, n: number, source: string) => {
    if (n > 0) stats.push({ id, label, value: fmt(n), source });
  };
  push("swaps", "Swaps", f.swaps, "Your FlowBridge records");
  push("bridges", "Bridges", f.bridges, "Your FlowBridge records");
  push("verified", "Verified activities", f.verifiedActivities, "Verified FlowBridge data");
  push("campaigns", "Campaign tasks completed", f.campaignCompletions, "Verified FlowBridge data");
  push("campaignPts", "Campaign PTS", f.campaignPoints, "Verified FlowBridge data");
  push("flowPoints", "FLOW Points", f.flowPoints, "Verified FlowBridge data");
  push("claimed", "FLOW claimed", f.claimedFlow, "Verified FlowBridge data");
  push("stakes", "Staking actions", f.stakes, "Your FlowBridge records");
  push("missions", "Missions completed", f.missionsCompleted, "Verified FlowBridge data");
  push("referrals", "People you referred", f.referrals, "Verified FlowBridge data");
  return stats;
}

function resolveStage(f: ParticipationFacts): ProfileStage {
  if (!f.signedIn) return "PUBLIC";
  if (!f.emailVerified || !f.walletBound) return "SETTING_UP";
  const actions = totalActions(f);
  if (actions === 0) return "ACCOUNT_READY";
  if (f.missionsCompleted > 0 || f.campaignCompletions > 0 || f.stakes > 0 || actions >= 3) {
    return "GROWING";
  }
  return "PARTICIPATING";
}

function resolveNextStep(f: ParticipationFacts, stage: ProfileStage): ProfileNextStep {
  if (stage === "PUBLIC") {
    return {
      id: "SIGN_IN",
      label: "Create or verify account",
      body: "Swapping and bridging stay open. An account is what lets FlowBridge show your own activity and eligibility.",
      href: "/account",
      requiresWalletConfirmation: false,
    };
  }
  if (!f.emailVerified) {
    return {
      id: "VERIFY_EMAIL",
      label: "Verify your email",
      body: "A simple email confirmation — never a wallet transaction.",
      href: "/home",
      requiresWalletConfirmation: false,
    };
  }
  if (!f.walletBound) {
    return {
      id: "BIND_WALLET",
      label: "Bind your wallet",
      body: "Tell FlowBridge which wallet this account uses. It never moves funds.",
      href: "/rewards#bind",
      requiresWalletConfirmation: false,
    };
  }
  if (totalActions(f) === 0) {
    return {
      id: "EXPLORE_BEGINNER",
      label: "Explore beginner opportunities",
      body: "Start with what is really live today: a small swap, or a plain-English guide first.",
      href: "/discover",
      requiresWalletConfirmation: false,
    };
  }
  if (f.campaignCompletions === 0) {
    return {
      id: "CAMPAIGNS",
      label: "See active campaigns",
      body: "Campaign tasks state their own rules, and verification still applies in full.",
      href: "/campaigns",
      requiresWalletConfirmation: true,
    };
  }
  if (f.flowPoints > 0 || f.claimedFlow > 0) {
    return {
      id: "REWARDS",
      label: "Check your rewards state",
      body: "See exactly what is convertible or claimable right now, and what rule is still missing.",
      href: "/rewards",
      requiresWalletConfirmation: true,
    };
  }
  return {
    id: "LEARN",
    label: "Learn ways to earn",
    body: "Plain-English explanations of every earning path FlowBridge actually supports.",
    href: "/learn",
    requiresWalletConfirmation: false,
  };
}

function resolveWhyBotChain(f: ParticipationFacts): string | null {
  if (f.swaps > 0 || f.verifiedActivities > 0) {
    return "Your swaps run on BOT Chain, so each confirmed trade is real network usage that BOT Chain projects can see and measure. It is participation, not a promise of growth.";
  }
  if (f.bridges > 0) {
    return "Bridging moves value into or across supported ecosystems. It helps you use BOT Chain with assets you already hold; it does not automatically earn FLOW Points.";
  }
  if (f.campaignCompletions > 0) {
    return "Verified campaign participation helps BOT Chain projects reach real users and measure real activity instead of guesswork.";
  }
  if (f.stakes > 0) {
    return "Staking keeps FLOW committed under the currently published rules, which supports the staking programme FlowBridge already runs.";
  }
  return null;
}

export function resolveParticipation(f: ParticipationFacts): ParticipationView {
  const stage = resolveStage(f);
  const tags = resolveTags(f);
  const stats = resolveStats(f);
  const setupComplete = f.signedIn && f.emailVerified && f.walletBound;
  const emptyParticipation = f.signedIn && stats.length === 0;

  let headline: string;
  let message: string;
  if (stage === "PUBLIC") {
    headline = "Your FlowBridge profile";
    message =
      "Sign in to see your own activity, achievements and next useful step. Nothing private is shown here until you do.";
  } else if (stage === "SETTING_UP") {
    headline = "Finish setting up your account";
    message =
      "Your profile gets richer the moment your email is confirmed and a wallet is bound — verified history, achievements and clearer eligibility.";
  } else if (stage === "ACCOUNT_READY") {
    headline = "Your account is ready";
    message =
      "Everything is set up. There is no activity to summarize yet, and that is fine — one small real action is enough to start your history.";
  } else if (stage === "PARTICIPATING") {
    headline = "You are participating on BOT Chain";
    message = "This is what FlowBridge can verify about your activity so far.";
  } else {
    headline = "Your participation keeps growing";
    message =
      "Your verified history, achievements and eligibility explanations all come from records FlowBridge can prove.";
  }

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    policyVersion: PROFILE_POLICY_VERSION,
    stage,
    stageLabel: STAGE_LABEL[stage],
    headline,
    message,
    readiness: {
      emailVerified: f.signedIn && f.emailVerified,
      walletBound: f.signedIn && f.walletBound,
      setupComplete,
    },
    tags,
    stats,
    emptyParticipation,
    emptyNote: emptyParticipation
      ? "No verified activity yet. Your history starts with your first confirmed action."
      : null,
    nextStep: resolveNextStep(f, stage),
    whyBotChain: resolveWhyBotChain(f),
    summaryNote: PARTICIPATION_SUMMARY_NOTE,
    hasFlowScore: false,
    hasLevel: false,
    hasRank: false,
    createsMission: false,
    createsActionIntent: false,
    settlesReward: false,
    signsTransaction: false,
  };
}
