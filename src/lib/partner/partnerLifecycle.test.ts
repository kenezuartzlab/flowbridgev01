import { describe, expect, it } from "vitest";
import {
  canEditDrafts,
  canSubmit,
  canTransition,
  isRewardTypePartnerConfigurable,
  normalizeOrgSlug,
  orgMayOperate,
  rewardTypeBlocksPublish,
  validateOrgApplication,
  PARTNER_EDITABLE_STATES,
} from "./partnerTypes";

describe("V14 partner lifecycle authority", () => {
  it("only a partner admin may submit", () => {
    expect(canSubmit("partner_admin")).toBe(true);
    expect(canSubmit("partner_editor")).toBe(false);
    expect(canTransition("submit", "draft", "partner_admin")).toBe(true);
    expect(canTransition("submit", "draft", "partner_editor")).toBe(false);
  });

  it("editors may still edit drafts", () => {
    expect(canEditDrafts("partner_editor")).toBe(true);
    expect(PARTNER_EDITABLE_STATES).toEqual(["draft", "changes_requested"]);
  });

  it("partners can never publish, pause or end", () => {
    for (const action of ["publish", "pause", "end", "approve", "request_changes"]) {
      expect(canTransition(action, "approved", "partner_admin")).toBe(false);
      expect(canTransition(action, "published", "partner_admin")).toBe(false);
    }
  });

  it("internal roles drive review transitions", () => {
    expect(canTransition("approve", "submitted", "internal")).toBe(true);
    expect(canTransition("request_changes", "submitted", "internal")).toBe(true);
    expect(canTransition("publish", "approved", "internal")).toBe(true);
    expect(canTransition("pause", "published", "internal")).toBe(true);
    // Publishing straight from submitted is not a legal transition.
    expect(canTransition("publish", "submitted", "super_admin")).toBe(false);
  });

  it("resubmission from changes_requested is allowed", () => {
    expect(canTransition("submit", "changes_requested", "partner_admin")).toBe(true);
  });

  it("Campaign PTS is the only partner-configurable reward type", () => {
    expect(isRewardTypePartnerConfigurable("campaign_pts")).toBe(true);
    expect(isRewardTypePartnerConfigurable("flow_points_bonus")).toBe(false);
    expect(isRewardTypePartnerConfigurable("flow_token")).toBe(false);
  });

  it("non-PTS reward types fail closed before approval/publish", () => {
    expect(rewardTypeBlocksPublish("campaign_pts")).toBeNull();
    expect(rewardTypeBlocksPublish("flow_points_bonus")).toMatch(/budget authorization/i);
    expect(rewardTypeBlocksPublish("flow_token")).toMatch(/budget authorization/i);
  });

  it("only verified organizations may operate", () => {
    expect(orgMayOperate("verified")).toBe(true);
    for (const status of ["pending", "rejected", "suspended"] as const) {
      expect(orgMayOperate(status)).toBe(false);
    }
  });
});

describe("V14 organization application validation", () => {
  it("normalizes handles", () => {
    expect(normalizeOrgSlug("  Acme Labs!! ")).toBe("acme-labs");
  });

  it("rejects bad input", () => {
    const errors = validateOrgApplication({ name: "", slug: "A", website: "not-a-url" });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("accepts a clean application", () => {
    expect(
      validateOrgApplication({
        name: "Acme Labs",
        slug: "acme-labs",
        website: "https://acme.example",
        description: "Building on BOT Chain.",
      }),
    ).toEqual([]);
  });
});
