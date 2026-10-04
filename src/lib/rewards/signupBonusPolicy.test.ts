import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  SIGNUP_BONUS_EFFECTIVE_AT,
  SIGNUP_BONUS_INITIAL_BUDGET,
  claimableFlowOneToOne,
  decideSignupBudget,
  eligibleBackedPoints,
  evaluateSignupEligibility,
  oneToOneClaimGate,
  MAINNET_CLAIM_GATE_FACTS,
  requiredSignupFunding,
} from "./signupBonusPolicy";

const W1 = "0x1111111111111111111111111111111111111111";
const W2 = "0x2222222222222222222222222222222222222222";
const after = "2026-10-05T00:00:00.000Z";
const base = {
  userId: "u1",
  accountCreatedAt: after,
  emailVerified: true,
  wallet: W1,
  alreadyBonusedAccount: false,
  alreadyBonusedWallet: false,
};

/** In-memory mirror of award_signup_bonus(): atomic, all-or-nothing. */
function makeProgram(total = SIGNUP_BONUS_INITIAL_BUDGET) {
  const state = { total, reserved: 0, ledger: [] as Array<{ user: string; reason: string; points: number; wallet: string }> };
  return {
    state,
    award(user: string, wallet: string, referrer: string | null) {
      if (state.ledger.some((l) => l.reason === "SIGNUP_BONUS_REFEREE" && (l.user === user || l.wallet === wallet))) return "DUPLICATE";
      const d = decideSignupBudget(state.total, state.reserved, !!referrer);
      if (d.outcome !== "CONFIRM") return "EXHAUSTED";
      state.ledger.push({ user, reason: "SIGNUP_BONUS_REFEREE", points: 100, wallet });
      if (referrer) state.ledger.push({ user: referrer, reason: "REFERRAL_SIGNUP_BONUS", points: 100, wallet: "ref" });
      state.reserved += d.reserve;
      return "CONFIRMED";
    },
  };
}

describe("funded signup bonus", () => {
  it("new eligible signup → +100 referee", () => {
    const p = makeProgram();
    expect(p.award("u1", W1, null)).toBe("CONFIRMED");
    expect(p.state.ledger).toEqual([{ user: "u1", reason: "SIGNUP_BONUS_REFEREE", points: 100, wallet: W1 }]);
    expect(p.state.reserved).toBe(100);
  });
  it("referred signup → +100 referee and +100 referrer, 200 reserved", () => {
    const p = makeProgram();
    expect(p.award("u1", W1, "r1")).toBe("CONFIRMED");
    expect(p.state.ledger.map((l) => [l.reason, l.points])).toEqual([
      ["SIGNUP_BONUS_REFEREE", 100],
      ["REFERRAL_SIGNUP_BONUS", 100],
    ]);
    expect(p.state.reserved).toBe(200);
  });
  it("duplicate processing → no second award; same wallet blocked", () => {
    const p = makeProgram();
    p.award("u1", W1, null);
    expect(p.award("u1", W1, null)).toBe("DUPLICATE");
    expect(p.award("u2", W1, null)).toBe("DUPLICATE");
    expect(p.state.reserved).toBe(100);
  });
  it("self referral blocked (same account and same wallet)", () => {
    expect(evaluateSignupEligibility({ ...base, referrerId: "u1" }).referrer).toBe("SELF_REFERRAL");
    expect(evaluateSignupEligibility({ ...base, referrerId: "r1", referrerWallet: W1.toUpperCase().replace("0X", "0x") }).referrer).toBe("SELF_REFERRAL");
    expect(evaluateSignupEligibility({ ...base, referrerId: "r1", referrerReferredByUser: true }).referrer).toBe("LOOP");
  });
  it("unverified or unbound → no confirmed bonus", () => {
    expect(evaluateSignupEligibility({ ...base, emailVerified: false }).eligible).toBe(false);
    expect(evaluateSignupEligibility({ ...base, wallet: null }).blockers).toContain("NO_WALLET");
  });
  it("accounts before effectiveAt are never backfilled", () => {
    const r = evaluateSignupEligibility({ ...base, accountCreatedAt: "2026-10-01T00:00:00.000Z" });
    expect(r.blockers).toContain("BEFORE_EFFECTIVE_AT");
    expect(Date.parse(SIGNUP_BONUS_EFFECTIVE_AT)).toBeGreaterThan(Date.parse("2026-10-03T00:00:00Z"));
  });
  it("999,900 consumed: direct signup takes final 100; referred rejected (needs 200)", () => {
    expect(decideSignupBudget(1_000_000, 999_900, false)).toEqual({ outcome: "CONFIRM", reserve: 100 });
    expect(decideSignupBudget(1_000_000, 999_900, true)).toEqual({ outcome: "EXHAUSTED", remaining: 100, required: 200 });
    const p = makeProgram();
    p.state.reserved = 999_900;
    expect(p.award("u9", W2, "r1")).toBe("EXHAUSTED");
    expect(p.state.ledger).toHaveLength(0); // never one side only
  });
  it("1,000,000 consumed → 0; resumes only after explicit budget increase", () => {
    const p = makeProgram();
    p.state.reserved = 1_000_000;
    expect(p.award("u1", W1, null)).toBe("EXHAUSTED");
    p.state.total += 1_000; // explicit increase_reward_budget()
    expect(p.award("u1", W1, null)).toBe("CONFIRMED");
    expect(p.state.reserved).toBeLessThanOrEqual(p.state.total);
  });
  it("monthly referrer cap enforced; referee still eligible", () => {
    const r = evaluateSignupEligibility({ ...base, referrerId: "r1", referrerRewardedThisMonth: 10, monthlyCap: 10 });
    expect(r.referrer).toBe("MONTHLY_CAP");
    expect(r.eligible).toBe(true);
    expect(requiredSignupFunding(false)).toBe(100);
    expect(evaluateSignupEligibility({ ...base, referrerId: "r1", referrerRewardedThisMonth: 9 }).referrer).toBe("PAY");
  });
  it("burst of same-referrer bindings → REVIEW", () => {
    expect(evaluateSignupEligibility({ ...base, referrerId: "r1", recentReferrerBindings: 4 }).referrer).toBe("REVIEW");
  });
});

describe("1:1 settlement", () => {
  it("1 backed point = 1 FLOW; claimable = backed − claimed", () => {
    expect(claimableFlowOneToOne(500, 200)).toBe(300);
    expect(claimableFlowOneToOne(175, 0)).toBe(175);
    expect(claimableFlowOneToOne(100, 300)).toBe(0);
  });
  it("unbacked points never become claimable; signup + milestone rows stay separate", () => {
    const rows = [
      { points: 100, funding_state: "FUNDED" },
      { points: 15, funding_state: "UNFUNDED" },
      { points: 5, funding_state: "UNFUNDED" },
    ];
    expect(eligibleBackedPoints(rows)).toBe(100);
  });
  it("manipulated stored aggregate cannot be claim authority", () => {
    // Only ledger rows are inputs; a profile flow_points of 99,999 has no path in.
    expect(eligibleBackedPoints([])).toBe(0);
    expect(eligibleBackedPoints.length).toBe(1);
  });
  it("claim gate closed until reconciliation, deployment and funding are verified", () => {
    const g = oneToOneClaimGate({ ...MAINNET_CLAIM_GATE_FACTS, distributorFlowBalance: null, totalReservedPoints: 0 });
    expect(g.open).toBe(false);
    expect(g.reasons).toEqual(["RECONCILIATION_PENDING", "DISTRIBUTOR_NOT_DEPLOYED", "FUNDING_UNVERIFIED"]);
    expect(oneToOneClaimGate({ reconciliationClean: true, distributorDeployed: true, distributorFlowBalance: 199, totalReservedPoints: 200 }).reasons).toEqual(["UNDERFUNDED"]);
    expect(oneToOneClaimGate({ reconciliationClean: true, distributorDeployed: true, distributorFlowBalance: 200, totalReservedPoints: 200 }).open).toBe(true);
  });
});

describe("migration invariants", () => {
  const dir = "drizzle/migrations";
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
  it("award is atomic, locked, service_role only, and budget cannot overdraw", () => {
    expect(sql).toMatch(/program_id = 'SIGNUP_BONUS' FOR UPDATE/);
    expect(sql).toMatch(/reserved_points <= total_points/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.award_signup_bonus[^;]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/flow_points_ledger_signup_wallet_uidx/);
  });
  it("legacy direct +50 signup credit retired", () => {
    const last = sql.lastIndexOf("FUNCTION public.handle_new_user");
    expect(sql.slice(last, last + 900)).toMatch(/new_code, 0, 0\)/);
  });
});
