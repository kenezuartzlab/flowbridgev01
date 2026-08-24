/**
 * FlowBridge V27 §9 — the in-app notification model (pure).
 *
 * A notification is a POINTER. It is derived only from canonical FlowBridge
 * state changes (V17.1B reward state and the frozen V22 decision result), it
 * always deep-links into an existing journey or product screen, and it can never
 * claim, convert, stake, swap, bridge, sign or settle anything.
 *
 * Anti-pressure rules encoded here:
 *  - No fear, no fake scarcity, no hidden countdown, no repeated nagging.
 *  - Stable ids so a refresh or remount can never duplicate a notice.
 *  - Per-notice cooldowns, plus user dismiss and snooze.
 *  - ACCOUNT notices (security/state) are separated from GROWTH notices.
 */
import type { DecisionResult } from "@/lib/ai/decision/decisionTypes";
import type { RewardState } from "@/lib/rewards/rewardStateTruth";

export const NOTIFICATION_SCHEMA_VERSION = "flowbridge.notifications/1" as const;
export const NOTIFICATION_POLICY_VERSION = "V27" as const;

export const NOTIFICATION_KINDS = [
  "FLOW_READY_TO_CLAIM",
  "POINTS_READY_TO_CONVERT",
  "MISSION_NEEDS_YOU",
  "MISSION_COMPLETED",
  "PREPARED_ACTION_EXPIRED",
  "CAMPAIGN_AVAILABLE",
  "WALLET_BINDING_REQUIRED",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationCategory = "ACCOUNT" | "GROWTH";

export const NOTIFICATION_CATEGORY: Record<NotificationKind, NotificationCategory> = {
  FLOW_READY_TO_CLAIM: "ACCOUNT",
  POINTS_READY_TO_CONVERT: "ACCOUNT",
  MISSION_NEEDS_YOU: "ACCOUNT",
  MISSION_COMPLETED: "ACCOUNT",
  PREPARED_ACTION_EXPIRED: "ACCOUNT",
  CAMPAIGN_AVAILABLE: "GROWTH",
  WALLET_BINDING_REQUIRED: "ACCOUNT",
};

/** V27 §9 — per-kind cooldown. Deliberately generous; no nagging. */
export const NOTIFICATION_COOLDOWN_MS: Record<NotificationKind, number> = {
  FLOW_READY_TO_CLAIM: 12 * 60 * 60 * 1000,
  POINTS_READY_TO_CONVERT: 12 * 60 * 60 * 1000,
  MISSION_NEEDS_YOU: 6 * 60 * 60 * 1000,
  MISSION_COMPLETED: 7 * 24 * 60 * 60 * 1000,
  PREPARED_ACTION_EXPIRED: 24 * 60 * 60 * 1000,
  CAMPAIGN_AVAILABLE: 24 * 60 * 60 * 1000,
  WALLET_BINDING_REQUIRED: 24 * 60 * 60 * 1000,
};

export const NOTIFICATION_SNOOZE_MS = 24 * 60 * 60 * 1000;

export interface AppNotification {
  /** Stable dedupe key. Same state ⇒ same id, forever. */
  id: string;
  kind: NotificationKind;
  category: NotificationCategory;
  title: string;
  /** Plain-English, no urgency language. */
  body: string;
  /** Navigation-only destination. */
  href: string;
  ctaLabel: string;
  /** Truthful state chip. */
  status: "VERIFIED" | "WAITING_FOR_USER" | "COMPLETED" | "PREVIEW";
  /** Higher sorts first. */
  weight: number;
  /** Constants: a notification never performs the financial action. */
  performsAction: false;
  createsMission: false;
}

export interface NotificationDeriveInput {
  signedIn: boolean;
  rewardState: RewardState | null;
  decision: DecisionResult | null;
  walletBound?: boolean;
}

function make(
  kind: NotificationKind,
  parts: Omit<AppNotification, "id" | "kind" | "category" | "performsAction" | "createsMission">,
  idSuffix = "",
): AppNotification {
  return {
    id: idSuffix ? `${kind}:${idSuffix}` : kind,
    kind,
    category: NOTIFICATION_CATEGORY[kind],
    performsAction: false,
    createsMission: false,
    ...parts,
  };
}

/**
 * Derives the full candidate set from canonical state. Deterministic: the same
 * inputs always produce the same ids, so a remount cannot duplicate anything.
 */
export function deriveNotifications(input: NotificationDeriveInput): AppNotification[] {
  const out: AppNotification[] = [];
  if (!input.signedIn) return out;

  const rs = input.rewardState;
  const decision = input.decision;

  const activeMission =
    decision?.items.find((i) => i.kind === "CONTINUE_MISSION") ?? null;

  if (rs) {
    if (rs.nextEconomicStep === "CLAIM_FLOW" && (rs.claimableFlow ?? 0) > 0) {
      out.push(
        make(
          "FLOW_READY_TO_CLAIM",
          {
            title: "FLOW is ready to claim",
            body: `${rs.claimableFlow!.toLocaleString("en-US")} FLOW is ready. You confirm the claim in your wallet.`,
            href: "/rewards",
            ctaLabel: "Open rewards",
            status: "WAITING_FOR_USER",
            weight: 90,
          },
          String(rs.claimableFlow),
        ),
      );
    }
    if (rs.nextEconomicStep === "CONVERT_FLOW_POINTS" && rs.convertibleFlowPoints > 0) {
      out.push(
        make(
          "POINTS_READY_TO_CONVERT",
          {
            title: "FLOW Points ready to convert",
            body: `${rs.convertibleFlowPoints.toLocaleString("en-US")} points are eligible. Converting is your explicit choice.`,
            href: "/rewards",
            ctaLabel: "See conversion",
            status: "VERIFIED",
            weight: 80,
          },
          String(rs.convertibleFlowPoints),
        ),
      );
    }
    if (!rs.requirementsMet) {
      const unmet = rs.requirements.filter((r) => !r.met);
      const wallet = unmet.find((r) => /wallet/i.test(r.id) || /wallet/i.test(r.label));
      if (wallet) {
        out.push(
          make("WALLET_BINDING_REQUIRED", {
            title: "Connect a wallet to continue",
            body: "Rewards need a wallet on your account before anything can be claimed. Connecting does not sign anything.",
            href: "/account",
            ctaLabel: "Open account",
            status: "WAITING_FOR_USER",
            weight: 70,
          }),
        );
      }
    }
  }

  if (activeMission?.missionId) {
    if (activeMission.blocked && activeMission.blockerText) {
      out.push(
        make(
          "MISSION_NEEDS_YOU",
          {
            title: "Your mission is waiting on something",
            body: activeMission.blockerText,
            href: activeMission.surface.href,
            ctaLabel: "Open mission",
            status: "WAITING_FOR_USER",
            weight: 95,
          },
          activeMission.missionId,
        ),
      );
    } else if (activeMission.requiresWalletConfirmation) {
      out.push(
        make(
          "MISSION_NEEDS_YOU",
          {
            title: "Mission needs you",
            body: `${activeMission.title} — the next step needs your wallet confirmation.`,
            href: activeMission.surface.href,
            ctaLabel: "Continue mission",
            status: "WAITING_FOR_USER",
            weight: 95,
          },
          activeMission.missionId,
        ),
      );
    }
  }

  if (decision) {
    for (const item of decision.items) {
      if (
        item.kind === "OPPORTUNITY" &&
        item.expiresAt &&
        Date.parse(item.expiresAt) < Date.now()
      ) {
        out.push(
          make(
            "PREPARED_ACTION_EXPIRED",
            {
              title: "A prepared action expired",
              body: `${item.title} timed out before it was confirmed. Nothing was submitted. You can prepare it again when you want.`,
              href: item.surface.href,
              ctaLabel: "Review",
              status: "VERIFIED",
              weight: 60,
            },
            item.id,
          ),
        );
      }
      if (item.kind === "OPPORTUNITY" && item.domain === "CAMPAIGN" && item.actionable) {
        out.push(
          make(
            "CAMPAIGN_AVAILABLE",
            {
              title: "A campaign is available",
              body: `${item.title} — ${item.what}`,
              href: item.surface.href,
              ctaLabel: "See campaign",
              status: "VERIFIED",
              weight: 40,
            },
            item.id,
          ),
        );
      }
    }
  }

  if (
    decision &&
    decision.completedMissionCount > 0 &&
    !activeMission
  ) {
    out.push(
      make(
        "MISSION_COMPLETED",
        {
          title: "Mission completed",
          body: `You have ${decision.completedMissionCount.toLocaleString("en-US")} completed mission${decision.completedMissionCount === 1 ? "" : "s"} on record, with verified evidence.`,
          href: "/assistant",
          ctaLabel: "See history",
          status: "COMPLETED",
          weight: 30,
        },
        String(decision.completedMissionCount),
      ),
    );
  }

  /** §9 — dedupe by id and sort by weight. No duplicates can survive. */
  const seen = new Set<string>();
  return out
    .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
}

export interface NotificationPresentation {
  dismissed: readonly string[];
  snoozedUntil: Readonly<Record<string, number>>;
  lastShownAt: Readonly<Record<string, number>>;
  readIds: readonly string[];
  /** V27 §9 — growth notices can be turned off entirely; account ones cannot. */
  growthEnabled: boolean;
}

export const EMPTY_NOTIFICATION_PRESENTATION: NotificationPresentation = {
  dismissed: [],
  snoozedUntil: {},
  lastShownAt: {},
  readIds: [],
  growthEnabled: true,
};

/**
 * Applies user preferences, dismissals, snoozes and per-kind cooldowns.
 * Pure — the caller decides when to persist `lastShownAt`.
 */
export function visibleNotifications(
  candidates: readonly AppNotification[],
  state: NotificationPresentation,
  now = Date.now(),
): AppNotification[] {
  return candidates.filter((n) => {
    if (state.dismissed.includes(n.id)) return false;
    const snoozed = state.snoozedUntil[n.id];
    if (typeof snoozed === "number" && snoozed > now) return false;
    if (n.category === "GROWTH" && !state.growthEnabled) return false;
    const last = state.lastShownAt[n.id];
    if (typeof last === "number" && now - last < NOTIFICATION_COOLDOWN_MS[n.kind]) {
      // Already shown recently AND already read → stay quiet (no nagging).
      if (state.readIds.includes(n.id)) return false;
    }
    return true;
  });
}

export function unreadCount(
  visible: readonly AppNotification[],
  state: NotificationPresentation,
): number {
  return visible.filter((n) => !state.readIds.includes(n.id)).length;
}

/** Constants a test can assert. */
export const NOTIFICATION_AUTHORITY = {
  performsAction: false,
  createsMission: false,
  createsActionIntent: false,
  signsTransaction: false,
} as const;
