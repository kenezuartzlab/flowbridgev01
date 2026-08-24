/**
 * FlowBridge V25 §14 — experience-layer acceptance.
 *
 * These tests prove the presentation layer stays inert: it adds no economics, no
 * urgency and no duplicate cards, and it never re-labels preview data as
 * verified.
 */
import { describe, expect, it } from "vitest";
import type { DecisionItem, DecisionResult } from "../decision/decisionTypes";
import {
  contextualPrompts,
  dedupeItems,
  evidenceLevel,
  itemStatus,
  plainReason,
  primaryCta,
  resolveExperience,
} from "./experienceModel";

function item(over: Partial<DecisionItem> = {}): DecisionItem {
  return {
    kind: "OPPORTUNITY",
    id: "opp-1",
    opportunityId: "opp-1",
    missionId: null,
    rank: 1,
    score: 10,
    scoreParts: [],
    reasonCodes: ["READY_TO_CLAIM"],
    title: "Claim 1,000 FLOW",
    what: "You have claimable FLOW.",
    whyNow: "Your claim authorization is live.",
    whatNext: "You review and confirm in your wallet.",
    requiresWalletConfirmation: true,
    actionable: true,
    blocked: false,
    blockerText: null,
    domain: "REWARDS",
    provenance: "LIVE",
    expiresAt: null,
    containsPrivateEvidence: true,
    freshness: "LIVE",
    surface: { label: "Open rewards", href: "/rewards" },
    facts: [],
    evidenceRefs: [],
    supportsMission: true,
    ...over,
  } as DecisionItem;
}

function decision(items: DecisionItem[], over: Partial<DecisionResult> = {}): DecisionResult {
  return {
    schemaVersion: "flowbridge.decision/1",
    policyVersion: "V22",
    requestId: "req",
    actorScopes: [],
    generatedAt: new Date().toISOString(),
    evidenceFreshness: ["LIVE"],
    items,
    suppressed: [],
    memoryUsed: false,
    preferenceKeysUsed: [],
    activeMissionIds: [],
    completedMissionCount: 0,
    degradedDomains: [],
    status: items.length ? "OK" : "NOTHING_ACTIONABLE",
    notice: null,
    executed: false,
    createdActionIntent: false,
    missionsCreated: 0,
    ...over,
  } as DecisionResult;
}

describe("V25 experience model", () => {
  it("signed-out users get an honest capability summary and no primary action", () => {
    const e = resolveExperience({ decision: null, signedIn: false });
    expect(e.state).toBe("SIGNED_OUT");
    expect(e.primary).toBeNull();
  });

  it("an active mission always wins the primary slot", () => {
    const e = resolveExperience({
      decision: decision([
        item(),
        item({
          kind: "CONTINUE_MISSION",
          id: "mission:m1",
          missionId: "m1",
          opportunityId: null,
          rank: 2,
          reasonCodes: ["CONTINUE_ACTIVE_MISSION"],
        }),
      ]),
      signedIn: true,
    });
    expect(e.state).toBe("ACTIVE_MISSION");
    expect(e.primary?.kind).toBe("CONTINUE_MISSION");
    expect(e.secondary).toHaveLength(1);
    expect(e.headline).toBe("Your mission needs one action");
  });

  it("suppresses a duplicate card for the same economic action", () => {
    const deduped = dedupeItems([item(), item({ id: "opp-2", opportunityId: "opp-2" })]);
    expect(deduped).toHaveLength(1);
  });

  it("nothing actionable is stated plainly, never invented", () => {
    const e = resolveExperience({ decision: decision([]), signedIn: true });
    expect(e.state).toBe("NOTHING_ACTIONABLE");
    expect(e.headline).toBe("Nothing needs you right now");
    expect(e.primary).toBeNull();
  });

  it("non-canonical data can never be labelled verified", () => {
    expect(evidenceLevel(item())).toBe("VERIFIED");
    expect(evidenceLevel(item({ provenance: "UNAVAILABLE" as never }))).toBe("PREVIEW");
  });

  it("blocked items surface as blocked with a non-executing CTA", () => {
    const blocked = item({ blocked: true, blockerText: "Bind a wallet first" });
    expect(itemStatus(blocked)).toBe("BLOCKED");
    expect(primaryCta(blocked)).toBe("See what's needed");
  });

  it("reason codes are translated, never shown raw", () => {
    expect(plainReason("CONTINUE_ACTIVE_MISSION")).toBe("You already started this");
    expect(plainReason("SNOOZED_BY_USER")).toBe("You snoozed this");
  });

  it("quick prompts follow real state and never promise execution", () => {
    const prompts = contextualPrompts(
      decision([item({ kind: "CONTINUE_MISSION", id: "mission:m1", missionId: "m1" })]),
    );
    expect(prompts[0]).toBe("Continue my mission");
    expect(prompts.length).toBeLessThanOrEqual(4);
    expect(prompts.join(" ")).not.toMatch(/sign|submit|execute/i);
    expect(contextualPrompts(null).length).toBe(4);
  });
});
