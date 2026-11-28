import { describe, expect, it } from "vitest";
import { authorizeAutoTradeAction, opsPermissions, paperQuotaDecision } from "./paperPermissions";

describe("AutoTrade paper-only permissions", () => {
  it("lets verified operators create paper orders and manage only their own", () => {
    expect(authorizeAutoTradeAction("internal_operator", "create")).toEqual({ ok: true, ownOrderOnly: false });
    expect(authorizeAutoTradeAction("internal_operator", "paper_reference").ok).toBe(true);
    for (const a of ["tick", "pause", "resume", "cancel"]) expect(authorizeAutoTradeAction("internal_operator", a)).toEqual({ ok: true, ownOrderOnly: true });
  });
  it("keeps policy, canary, infrastructure and registry actions super-admin only", () => {
    for (const a of ["emergency", "registry_preview", "prepare_canary", "validate_infrastructure"]) {
      expect(authorizeAutoTradeAction("internal_operator", a).ok).toBe(false);
      expect(authorizeAutoTradeAction("super_admin", a).ok).toBe(true);
    }
  });
  it("lets super admins manage every paper order", () => {
    expect(authorizeAutoTradeAction("super_admin", "cancel")).toEqual({ ok: true, ownOrderOnly: false });
  });
  it("refuses unknown roles and unknown actions, so no role can escalate", () => {
    for (const role of [undefined, null, "", "viewer", "SUPER_ADMIN", "partner_admin"]) expect(authorizeAutoTradeAction(role, "create").ok).toBe(false);
    for (const a of ["set_live", "registry_write", "sign", 42, null]) expect(authorizeAutoTradeAction("super_admin", a).ok).toBe(false);
    expect(opsPermissions("viewer").createPaper).toBe(false);
  });
  it("limits each account to 5 active and 10 new paper orders per hour", () => {
    expect(paperQuotaDecision(9, 4).ok).toBe(true);
    expect(paperQuotaDecision(10, 0).ok).toBe(false);
    expect(paperQuotaDecision(0, 5).ok).toBe(false);
  });
});
