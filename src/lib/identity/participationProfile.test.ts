import { describe, expect, it } from "vitest";
import {
  EMPTY_PARTICIPATION_FACTS,
  FLOW_SCORE_FORMULA_APPROVED,
  maskEmail,
  maskWallet,
  resolveParticipation,
  type ParticipationFacts,
} from "./participationProfile";
import { resolveAchievements } from "./achievements";
import { buildShareCard, isShareTextSafe, SHARE_ENABLED_BY_DEFAULT } from "./shareCard";

const facts = (over: Partial<ParticipationFacts> = {}): ParticipationFacts => ({
  ...EMPTY_PARTICIPATION_FACTS,
  ...over,
});

describe("V29 participation profile", () => {
  it("never invents a score, level or rank", () => {
    const v = resolveParticipation(facts({ signedIn: true, swaps: 9 }));
    expect(FLOW_SCORE_FORMULA_APPROVED).toBe(false);
    expect(v.hasFlowScore).toBe(false);
    expect(v.hasLevel).toBe(false);
    expect(v.hasRank).toBe(false);
  });

  it("is economically inert", () => {
    const v = resolveParticipation(facts({ signedIn: true, swaps: 1 }));
    expect(v.createsMission).toBe(false);
    expect(v.createsActionIntent).toBe(false);
    expect(v.settlesReward).toBe(false);
    expect(v.signsTransaction).toBe(false);
  });

  it("shows nothing private for a signed-out visitor", () => {
    const v = resolveParticipation(facts());
    expect(v.stage).toBe("PUBLIC");
    expect(v.stats).toHaveLength(0);
    expect(v.nextStep.id).toBe("SIGN_IN");
  });

  it("asks for the missing setup step, one at a time", () => {
    expect(resolveParticipation(facts({ signedIn: true })).nextStep.id).toBe("VERIFY_EMAIL");
    expect(
      resolveParticipation(facts({ signedIn: true, emailVerified: true })).nextStep.id,
    ).toBe("BIND_WALLET");
  });

  it("treats a ready account with no activity as an honest empty state", () => {
    const v = resolveParticipation(
      facts({ signedIn: true, emailVerified: true, walletBound: true }),
    );
    expect(v.stage).toBe("ACCOUNT_READY");
    expect(v.emptyParticipation).toBe(true);
    expect(v.emptyNote).toBeTruthy();
  });

  it("only shows stats backed by real records", () => {
    const v = resolveParticipation(
      facts({ signedIn: true, emailVerified: true, walletBound: true, swaps: 3, flowPoints: 12 }),
    );
    const ids = v.stats.map((s) => s.id);
    expect(ids).toContain("swaps");
    expect(ids).toContain("flowPoints");
    expect(ids).not.toContain("bridges");
  });

  it("masks identity hints", () => {
    expect(maskEmail("kentrosh2002@gmail.com")).toBe("ke•••2@g•••.com");
    expect(maskWallet("0x9f10aa2299bb44cc55dd66ee77ff88990011224c")).toBe("0x9f…224c");
    expect(maskEmail(null)).toBeNull();
    expect(maskWallet("0x12")).toBeNull();
  });
});

describe("V29 achievements", () => {
  it("grants no economic value", () => {
    const a = resolveAchievements(facts({ signedIn: true, swaps: 1 }));
    expect(a.grantsFlow).toBe(false);
    expect(a.grantsFlowPoints).toBe(false);
    expect(a.grantsCampaignPts).toBe(false);
    expect(a.createsActionIntent).toBe(false);
  });

  it("unlocks nothing without evidence", () => {
    expect(resolveAchievements(facts()).earnedCount).toBe(0);
    expect(resolveAchievements(facts({ swaps: 5, missionsCompleted: 2 })).earnedCount).toBe(0);
  });

  it("unlocks from verified facts only", () => {
    const a = resolveAchievements(
      facts({ signedIn: true, emailVerified: true, walletBound: true, swaps: 1, activeDays: 3 }),
    );
    const earned = a.earned.map((x) => x.id);
    expect(earned).toContain("VERIFIED_ACCOUNT");
    expect(earned).toContain("FIRST_SWAP");
    expect(earned).toContain("RETURNING_PARTICIPANT");
    expect(earned).not.toContain("FIRST_STAKE");
  });
});

describe("V29 share card", () => {
  it("is opt-in and leaks nothing private", () => {
    expect(SHARE_ENABLED_BY_DEFAULT).toBe(false);
    const f = facts({
      signedIn: true,
      emailVerified: true,
      walletBound: true,
      swaps: 2,
      flowPoints: 4200,
      emailHint: "ke•••2@g•••.com",
    });
    const a = resolveAchievements(f);
    const card = buildShareCard({
      facts: f,
      earned: a.earned,
      selectedAchievementIds: a.earned.map((x) => x.id),
      displayName: "kentrosh2002@gmail.com",
    });
    expect(isShareTextSafe(card.text)).toBe(true);
    expect(card.text).not.toContain("4200");
    expect(card.name).toBe("A FlowBridge member");
    expect(card.includesEmail).toBe(false);
    expect(card.includesWalletAddress).toBe(false);
    expect(card.includesBalances).toBe(false);
    expect(card.includesRewardEntitlement).toBe(false);
  });

  it("shares only the achievements the user picked", () => {
    const f = facts({ signedIn: true, emailVerified: true, walletBound: true, swaps: 1 });
    const a = resolveAchievements(f);
    const card = buildShareCard({
      facts: f,
      earned: a.earned,
      selectedAchievementIds: ["FIRST_SWAP"],
      displayName: "Ken",
    });
    expect(card.achievementTitles).toEqual(["First swap"]);
    expect(card.text).toContain("Ken on FlowBridge");
  });
});
