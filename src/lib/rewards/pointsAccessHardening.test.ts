import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyPersistenceError,
  isFailureOutcome,
  REWARD_DIAGNOSTIC_OUTCOMES,
  sanitizeDiagnosticDetail,
} from "./rewardDiagnostics";

const sql = readFileSync("drizzle/migrations/0005_points_least_privilege_and_reward_diagnostics.sql", "utf8");
const v4Sql = readFileSync("drizzle/migrations/0003_allow_router_v4_swap_activity_evidence.sql", "utf8");

describe("FLOW Points ledger least privilege (migration invariants)", () => {
  it("revokes every client privilege on economic ledgers", () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.flow_points_ledger FROM anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON public\.referral_milestone_awards FROM anon, authenticated/);
  });
  it("grants signed-in users read only (own rows via RLS), never write", () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.flow_points_ledger TO authenticated/);
    expect(sql).not.toMatch(/GRANT (ALL|INSERT|UPDATE|DELETE)[^;]*flow_points_ledger TO (anon|authenticated)/);
    expect(sql).not.toMatch(/GRANT[^;]*TO anon/);
  });
  it("only the server role may write canonical reward entries", () => {
    expect(sql).toMatch(/GRANT ALL ON public\.flow_points_ledger TO service_role/);
  });
  it("enumerates ledger reasons and rejects negative points", () => {
    expect(sql).toMatch(/flow_points_ledger_reason_chk CHECK \(reason = ANY/);
    expect(sql).toMatch(/points >= 0 AND base_points >= 0/);
  });
  it("end-user profile inserts cannot seed economic fields", () => {
    expect(sql).toMatch(/NEW\.flow_points := 0/);
    expect(sql).toMatch(/NEW\.total_swap_volume_usd := 0/);
  });
  it("Router V4 evidence type is explicitly enumerated, not unrestricted", () => {
    expect(v4Sql).toMatch(/ARRAY\['SIGNED_INTENT','ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY'\]/);
  });
});

describe("reward diagnostics never swallow failures", () => {
  it("classifies duplicate canonical identity as DUPLICATE (no second credit)", () => {
    expect(classifyPersistenceError({ code: "23505" })).toBe("DUPLICATE");
  });
  it("classifies unknown record types as UNSUPPORTED_RECORD_TYPE", () => {
    expect(classifyPersistenceError({ code: "23514" })).toBe("UNSUPPORTED_RECORD_TYPE");
  });
  it("classifies permission/other errors as PERSISTENCE_REJECTED", () => {
    expect(classifyPersistenceError({ code: "42501" })).toBe("PERSISTENCE_REJECTED");
  });
  it("no error → no outcome", () => {
    expect(classifyPersistenceError(null)).toBeNull();
  });
  it("failure outcomes log at error level", () => {
    expect(isFailureOutcome("PERSISTENCE_REJECTED")).toBe(true);
    expect(isFailureOutcome("UNSUPPORTED_RECORD_TYPE")).toBe(true);
    expect(isFailureOutcome("CREDITED")).toBe(false);
  });
  it("covers every required diagnostic state", () => {
    for (const o of ["PERSISTENCE_REJECTED", "UNSUPPORTED_RECORD_TYPE", "VALUATION_UNAVAILABLE",
      "CANONICAL_EVENT_MISSING", "DUPLICATE", "ANTI_ABUSE_REVIEW", "RETRY_SCHEDULED", "PERMANENT_FAILURE"]) {
      expect(REWARD_DIAGNOSTIC_OUTCOMES).toContain(o);
    }
  });
  it("diagnostic details never carry wallet addresses or emails", () => {
    const d = sanitizeDiagnosticDetail("fail 0x628e237b73c5a37ef3968527563fa1a26b32bb97 a@b.com");
    expect(d).not.toMatch(/628e237b/);
    expect(d).not.toMatch(/a@b\.com/);
  });
});
