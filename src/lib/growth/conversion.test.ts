import { describe, expect, it } from "vitest";
import { resolveNextAction, forYouNow, type NextActionInput } from "./nextAction";
import { missionProgress } from "./missionProgress";
import { buildShareCard, buildShareUrl, isValidReferralCode, newReferralCode, REFERRAL_REWARDS_ENABLED } from "./shareReferral";
import { assignVariant, buildRegistry, EXPERIMENTS, validateExperiment } from "./experiments";
import { conversionFunnel, conversionSignals } from "../ops/conversionFunnel";
import { isPrivatePath, PUBLIC_PAGES } from "../seo/publicPages";
import { ONBOARDING_STEPS } from "./onboarding";

const base: NextActionInput = { signedIn: true, emailVerified: true, walletBound: true, confirmedTrades: 0, liquidityPositions: 0, activeStakes: 0, activeCampaigns: 0 };

describe("Growth V1 dominant next action", () => {
  it.each([
    [{ ...base, signedIn: false }, "EXPLORE"],
    [{ ...base, emailVerified: false }, "VERIFY_EMAIL"],
    [{ ...base, walletBound: false }, "BIND_WALLET"],
    [base, "FIRST_TRADE"],
    [{ ...base, confirmedTrades: 1, liquidityPositions: 1 }, "VIEW_POSITIONS"],
    [{ ...base, confirmedTrades: 1, activeStakes: 1 }, "CHECK_STAKING"],
    [{ ...base, confirmedTrades: 1, activeCampaigns: 1 }, "CONTINUE_CAMPAIGN"],
    [{ ...base, confirmedTrades: 2 }, "EXPLORE_FEATURE"],
    [{ ...base, emailVerified: false, activeMissionHref: "/assistant" }, "CONTINUE_MISSION"],
  ])("state → one action", (input, id) => {
    const a = resolveNextAction(input as NextActionInput);
    expect(a.id).toBe(id);
    expect(a.signsTransaction).toBe(false);
    expect(a.grantsReward).toBe(false);
  });
  it("never asks to verify once done, and binding implies no custody or approval", () => {
    expect(resolveNextAction(base).label).not.toMatch(/verify|bind/i);
    expect(resolveNextAction({ ...base, walletBound: false }).reason).toMatch(/not a token approval/);
  });
  it("public visitor is invited to explore, not verify", () => {
    expect(resolveNextAction({ ...base, signedIn: false }).label).toBe("Explore FlowBridge");
  });
  it("copy has no profit or urgency claims", () => {
    const bad = /(guarantee|profit|hurry|last chance|apy|apr)/i;
    for (const i of [base, { ...base, signedIn: false }, { ...base, confirmedTrades: 3 }]) {
      expect(resolveNextAction(i).reason).not.toMatch(bad);
      expect(forYouNow(i)).not.toMatch(bad);
    }
  });
});

describe("Growth V1 mission progress", () => {
  it("DONE / NOW / NEXT with exactly one NOW", () => {
    const m = missionProgress({ explored: true, emailVerified: true, walletBound: false, confirmedTrades: 0, earnExplored: false, verifiedEcosystemActivities: 0 });
    expect(m.steps.map((s) => s.status)).toEqual(["DONE", "DONE", "NOW", "NEXT", "NEXT", "NEXT"]);
  });
  it("trade step needs a confirmed trade", () => {
    const m = missionProgress({ explored: true, emailVerified: true, walletBound: true, confirmedTrades: 0, earnExplored: false, verifiedEcosystemActivities: 0 });
    expect(m.steps.find((s) => s.id === "FIRST_TRADE")!.status).toBe("NOW");
  });
});

describe("Growth V1 onboarding", () => {
  it("includes a Trade step and no forced wallet", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toContain("TRADE");
    expect(ONBOARDING_STEPS.find((s) => s.id === "PERSONALIZE")!.points.join(" ")).toMatch(/skip/i);
  });
});

describe("Growth V1 share / referral privacy", () => {
  it("referral has no rewards and random codes", () => {
    expect(REFERRAL_REWARDS_ENABLED).toBe(false);
    expect(isValidReferralCode(newReferralCode())).toBe(true);
    expect(isValidReferralCode("0x3D8a7Fa4")).toBe(false);
  });
  it("only public paths are shareable", () => {
    expect(buildShareUrl("/ops")).toBeNull();
    expect(buildShareUrl("/learn", "abcd1234")).toBe("https://flowbridge.space/learn?ref=abcd1234");
  });
  it("share card strips email, wallet, amounts by default", () => {
    const c = buildShareCard({ title: "Mission done me@x.com", milestone: "First trade 0x3D8a7Fa490F9db09dd8006b74688213AcE9C0164", email: "me@x.com", walletAddress: "0x3D8a7Fa490F9db09dd8006b74688213AcE9C0164", balance: 5, rewardAmount: 3, txAmount: 9 });
    const json = JSON.stringify(c);
    expect(json).not.toMatch(/@|0x3D8a7Fa490F9|"balance"|"rewardAmount"|"txAmount"/);
    expect(c.wallet).toBeNull();
    expect(buildShareCard({ title: "t", milestone: "m", walletAddress: "0x3D8a7Fa490F9db09dd8006b74688213AcE9C0164" }, { showShortWallet: true }).wallet).toBe("0x3D8a…0164");
  });
});

describe("Growth V1 experiment safety", () => {
  it("rejects forbidden scopes and topics", () => {
    expect(validateExperiment({ id: "x", scope: "protocol_fee", variants: ["a", "b"] }).ok).toBe(false);
    expect(validateExperiment({ id: "slippage_copy", scope: "cta_wording", variants: ["a", "b"] }).ok).toBe(false);
    expect(validateExperiment({ id: "x", scope: "cta_wording", variants: ["a", "b"], touches: ["approval"] }).ok).toBe(false);
    expect(() => buildRegistry([{ id: "router_pick", scope: "card_placement", variants: ["a", "b"] }])).toThrow();
  });
  it("assignment is deterministic per pseudonymous session", () => {
    const e = EXPERIMENTS[0]!;
    expect(assignVariant(e, "abc")).toBe(assignVariant(e, "abc"));
  });
});

describe("Growth V1 conversion + drop-off", () => {
  const ev = (h: string, e: string) => ({ session_hash: h, event_name: e });
  const rows = [
    ev("a", "visit"), ev("b", "visit"), ev("c", "visit"),
    ev("a", "quote_success"), ev("b", "quote_success"), ev("c", "quote_success"),
    ev("a", "review_opened"), ev("b", "review_opened"), ev("c", "review_opened"),
    ev("a", "tx_submitted"), ev("b", "wallet_rejected"), ev("c", "rpc_failure"),
    ev("a", "tx_confirmed"), ev("a", "tx_confirmed"), ev("a", "page_view"),
  ];
  it("separates user cancellation from technical failure", () => {
    const s = conversionFunnel(rows).find((x) => x.key === "FIRST_SUBMITTED")!;
    expect(s.completed).toBe(1);
    expect(s.userCancelled).toBe(1);
    expect(s.technicalFailure).toBe(1);
    expect(s.abandoned).toBe(0);
  });
  it("page views never complete a stage; repeat = 2+ confirmed", () => {
    const f = conversionFunnel(rows);
    expect(f.find((x) => x.key === "EXPLORE")!.completed).toBe(0);
    expect(f.find((x) => x.key === "REPEAT")!.completed).toBe(1);
  });
  it("signals are advisory only", () => {
    for (const g of conversionSignals(conversionFunnel(rows), 1)) expect(g.autoApplied).toBe(false);
  });
});

describe("Growth V1 SEO privacy", () => {
  it("private pages never in sitemap", () => {
    for (const p of PUBLIC_PAGES) expect(isPrivatePath(p.path)).toBe(false);
    for (const p of ["/ops", "/admin", "/account", "/wallet", "/sets"]) expect(isPrivatePath(p)).toBe(true);
  });
});
