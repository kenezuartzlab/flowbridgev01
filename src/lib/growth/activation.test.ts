/**
 * FlowBridge V28 §10/§13/§14/§15 — deterministic activation + discovery tests.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIVATION_AUTHORITY,
  ACTIVATION_BENEFITS,
  activationNeeded,
  resolveActivation,
  type ActivationInput,
} from "./accountActivation";
import {
  ACTIVATION_PROMPT_COOLDOWN_MS,
  ACTIVATION_PROMPT_MAX_DECLINES,
  ACTIVATION_PROMPT_MIN_GAP_MS,
  EMPTY_ACTIVATION_PROMPT_STATE,
  shouldShowActivationPrompt,
} from "./activationPrompt";
import { buildDiscovery } from "./ecosystemDiscovery";
import { BOT_CHAIN_IMPACT, impactTopicForDomain } from "./botChainImpact";

const base: ActivationInput = {
  signedIn: true,
  emailVerified: false,
  walletBound: false,
  rewardRequirementsMet: true,
  missingRequirementLabel: null,
  activeMissionTitle: null,
  activeMissionHref: null,
};

describe("V28 account activation states", () => {
  it("public actor is invited to explore, never blocked", () => {
    const v = resolveActivation({ ...base, signedIn: false });
    expect(v.state).toBe("PUBLIC");
    expect(v.primary.kind).toBe("SIGN_IN");
    expect(v.completed).toBe(0);
  });

  it("unverified email asks for email only", () => {
    const v = resolveActivation(base);
    expect(v.state).toBe("EMAIL_UNVERIFIED");
    expect(v.primary.kind).toBe("SEND_VERIFICATION_EMAIL");
    expect(v.percent).toBe(0);
  });

  it("verified but unbound continues from the remaining step", () => {
    const v = resolveActivation({ ...base, emailVerified: true });
    expect(v.state).toBe("WALLET_UNBOUND");
    expect(v.primary.kind).toBe("BIND_WALLET");
    expect(v.completed).toBe(1);
    expect(v.steps[0]!.done).toBe(true);
  });

  it("verified + bound is ready and shows opportunities", () => {
    const v = resolveActivation({ ...base, emailVerified: true, walletBound: true });
    expect(v.state).toBe("READY");
    expect(v.accountComplete).toBe(true);
    expect(v.percent).toBe(100);
    expect(activationNeeded(v)).toBe(false);
  });

  it("names the exact missing reward requirement", () => {
    const v = resolveActivation({
      ...base,
      emailVerified: true,
      walletBound: true,
      rewardRequirementsMet: false,
      missingRequirementLabel: "Follow on YouTube",
    });
    expect(v.state).toBe("REQUIREMENT_MISSING");
    expect(v.message).toContain("Follow on YouTube");
    expect(v.primary.kind).toBe("COMPLETE_REQUIREMENT");
  });

  it("active mission takes over the primary action", () => {
    const v = resolveActivation({
      ...base,
      emailVerified: true,
      walletBound: true,
      activeMissionTitle: "Claim then stake FLOW",
      activeMissionHref: "/assistant",
    });
    expect(v.state).toBe("ACTIVE_MISSION");
    expect(v.primary.kind).toBe("CONTINUE_MISSION");
    expect(v.primary.href).toBe("/assistant");
  });

  it("never claims a reward, mission or signature, and never blocks trading", () => {
    for (const input of [
      base,
      { ...base, signedIn: false },
      { ...base, emailVerified: true },
      { ...base, emailVerified: true, walletBound: true },
    ]) {
      const v = resolveActivation(input);
      expect(v.createsMission).toBe(false);
      expect(v.createsActionIntent).toBe(false);
      expect(v.signsTransaction).toBe(false);
      expect(v.grantsReward).toBe(false);
    }
    expect(ACTIVATION_AUTHORITY.blocksTrading).toBe(false);
  });

  it("copy never promises rewards, urgency or scarcity", () => {
    const banned =
      /(guaranteed|risk-?free|hurry|last chance|only \d+ left|expires soon|don't miss|free flow|bonus for verifying)/i;
    const texts = [
      ...ACTIVATION_BENEFITS.flatMap((b) => [b.title, b.body, b.limit]),
      ...([base, { ...base, signedIn: false }, { ...base, emailVerified: true }] as ActivationInput[]).flatMap(
        (i) => {
          const v = resolveActivation(i);
          return [v.headline, v.message, v.truthNote, ...v.steps.map((s) => s.body)];
        },
      ),
    ];
    for (const t of texts) expect(t).not.toMatch(banned);
  });

  it("states plainly that swapping and bridging stay open", () => {
    expect(resolveActivation(base).truthNote.toLowerCase()).toContain("stay open");
  });
});

describe("V28 post-action prompt bounds", () => {
  const on = {
    outcomeSuccessful: true,
    signedIn: true,
    emailVerified: false,
    walletBound: false,
    state: EMPTY_ACTIVATION_PROMPT_STATE,
  };

  it("never shows without a successful outcome", () => {
    expect(shouldShowActivationPrompt({ ...on, outcomeSuccessful: false }).reason).toBe(
      "OUTCOME_NOT_SUCCESSFUL",
    );
  });

  it("shows once for an incomplete account", () => {
    expect(shouldShowActivationPrompt(on).show).toBe(true);
  });

  it("stays quiet when the account is already complete", () => {
    expect(
      shouldShowActivationPrompt({ ...on, emailVerified: true, walletBound: true }).reason,
    ).toBe("ACCOUNT_ALREADY_COMPLETE");
  });

  it("respects the decline cooldown", () => {
    const now = 1_000_000_000;
    const d = shouldShowActivationPrompt({
      ...on,
      state: { ...EMPTY_ACTIVATION_PROMPT_STATE, dismissedUntil: now + ACTIVATION_PROMPT_COOLDOWN_MS, declineCount: 1 },
      now,
    });
    expect(d.show).toBe(false);
    expect(d.reason).toBe("USER_DECLINED_COOLDOWN");
  });

  it("is not shown on every transaction", () => {
    const now = 5_000_000;
    expect(
      shouldShowActivationPrompt({
        ...on,
        state: { ...EMPTY_ACTIVATION_PROMPT_STATE, lastShownAt: now - ACTIVATION_PROMPT_MIN_GAP_MS / 2 },
        now,
      }).reason,
    ).toBe("FREQUENCY_BOUNDED");
  });

  it("stops asking after repeated declines", () => {
    expect(
      shouldShowActivationPrompt({
        ...on,
        state: { ...EMPTY_ACTIVATION_PROMPT_STATE, declineCount: ACTIVATION_PROMPT_MAX_DECLINES },
      }).reason,
    ).toBe("DECLINED_TOO_OFTEN");
  });
});

describe("V28 ecosystem discovery", () => {
  it("builds only real items and answers every question", () => {
    const view = buildDiscovery({ decision: null, signedIn: false });
    expect(view.items.length).toBeGreaterThan(0);
    for (const item of view.items) {
      expect(item.what.length).toBeGreaterThan(10);
      expect(item.whyCare.length).toBeGreaterThan(5);
      expect(item.learnOrEarn.length).toBeGreaterThan(5);
      expect(item.rules.length).toBeGreaterThan(5);
      expect(item.whyBotChain.length).toBeGreaterThan(10);
      expect(item.whatNext.length).toBeGreaterThan(5);
      expect(["VERIFIED", "EXTERNAL", "PREVIEW"]).toContain(item.label);
    }
    expect(view.createsMission).toBe(false);
    expect(view.createsActionIntent).toBe(false);
  });

  it("invents no yield, pool, countdown or trending claim", () => {
    const view = buildDiscovery({ decision: null, signedIn: true });
    const banned = /(apy|apr|trending|reward pool|ends in|countdown|\d+\s*% *(apy|apr))/i;
    for (const item of view.items) {
      for (const t of [item.title, item.what, item.whyCare, item.learnOrEarn, item.rules, item.whatNext]) {
        expect(t).not.toMatch(banned);
      }
    }
  });

  it("has unique ids so a remount cannot duplicate a card", () => {
    const ids = buildDiscovery({ decision: null, signedIn: true }).items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tells signed-out users what is missing without pressure", () => {
    expect(buildDiscovery({ decision: null, signedIn: false }).notice).toContain("Sign in");
  });
});

describe("V28 BOT Chain impact copy", () => {
  it("explains a concrete mechanism per topic", () => {
    for (const text of Object.values(BOT_CHAIN_IMPACT)) {
      expect(text.length).toBeGreaterThan(40);
      expect(text).not.toMatch(/grows the (whole|entire) ecosystem/i);
    }
  });

  it("claims no impact for domains without one", () => {
    expect(impactTopicForDomain("REWARDS")).toBeNull();
    expect(impactTopicForDomain(null)).toBeNull();
    expect(impactTopicForDomain("STAKING")).toBe("STAKING");
  });
});
