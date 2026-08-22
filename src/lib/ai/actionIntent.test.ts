/**
 * V15.2 §11 — ActionIntent schema, tampering, policy, staleness and isolation.
 * Pure tests: no network, no wallet, and no path that could execute anything.
 */
import { describe, expect, it } from "vitest";
import {
  ACTION_INTENT_TYPES,
  ACTION_POLICY_VERSION,
  buildHandoff,
  canTransition,
  createActionIntent,
  economicFingerprint,
  isExpired,
  resolveCanonicalTargets,
  validateIntentStructure,
  withStatus,
  type ActionIntent,
} from "./actionIntent";
import {
  authorizePreparation,
  evaluateIntentPolicy,
  type LiveActionState,
} from "./intentPolicy";
import { buildIntentAudit, summarizeIntentAudits } from "./intentAudit";

const CHAIN = 968;
const WALLET = "0x3d8a7fa490f9db09dd8006b74688213ace9c0164";
const targets = resolveCanonicalTargets(CHAIN)!;
const USDT = Object.keys(targets.knownTokens).find((a) => targets.knownTokens[a] === 6)!;
const CA = Object.keys(targets.knownTokens).find((a) => a !== USDT)!;

function swapIntent(overrides: Partial<Record<string, unknown>> = {}): ActionIntent {
  return createActionIntent({
    id: "intent-swap-0001",
    type: "SWAP",
    actorUserId: "user-a",
    actorWallet: WALLET,
    chainId: CHAIN,
    targetContract: targets.router,
    parameters: {
      tokenIn: USDT,
      tokenOut: CA,
      decimalsIn: 6,
      decimalsOut: 18,
      amountIn: "10",
      slippageBps: 50,
      recipient: WALLET,
      ...overrides,
    },
  });
}

const liveSwapOk: LiveActionState = {
  balance: 100,
  allowance: 100,
  paused: false,
  expectedOut: 42,
  observedAt: new Date().toISOString(),
};

describe("V15.2 ActionIntent envelope", () => {
  it("creates a PREPARED, short-lived, versioned envelope", () => {
    const intent = swapIntent();
    expect(intent.status).toBe("PREPARED");
    expect(intent.policyVersion).toBe(ACTION_POLICY_VERSION);
    expect(new Date(intent.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(isExpired(intent)).toBe(false);
  });

  it("never allows an executed-style status", () => {
    for (const s of ["SUBMITTED", "CONFIRMED", "EXECUTED"]) {
      expect(() => withStatus(swapIntent(), s as any)).toThrow();
    }
  });

  it("enforces the status machine", () => {
    expect(canTransition("PREPARED", "SIMULATED")).toBe(true);
    expect(canTransition("PREPARED", "HANDED_OFF")).toBe(false);
    expect(canTransition("REJECTED", "READY_FOR_USER")).toBe(false);
    expect(canTransition("SIMULATED", "READY_FOR_USER")).toBe(true);
  });

  it("validates structure for every intent type name", () => {
    expect(ACTION_INTENT_TYPES).toContain("PARTNER_CAMPAIGN_DRAFT");
    for (const t of ACTION_INTENT_TYPES) {
      const res = validateIntentStructure({
        type: t,
        chainId: CHAIN,
        parameters: {},
        actorWallet: WALLET,
      });
      expect(res.ok).toBe(false); // empty params must never validate
    }
  });
});

describe("V15.2 tampering resistance", () => {
  it("rejects an unsupported chain", () => {
    const res = validateIntentStructure({
      type: "SWAP",
      chainId: 1,
      parameters: swapIntent().parameters,
      actorWallet: WALLET,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/not a supported/);
  });

  it("rejects an unknown token address", () => {
    const res = validateIntentStructure({
      type: "SWAP",
      chainId: CHAIN,
      parameters: { ...(swapIntent().parameters as any), tokenIn: "0x" + "ab".repeat(20) },
      actorWallet: WALLET,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/not in the canonical registry/);
  });

  it("rejects mismatched token decimals", () => {
    const res = validateIntentStructure({
      type: "SWAP",
      chainId: CHAIN,
      parameters: { ...(swapIntent().parameters as any), decimalsIn: 18 },
      actorWallet: WALLET,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/decimals do not match/);
  });

  it("rejects a foreign recipient", () => {
    const res = validateIntentStructure({
      type: "SWAP",
      chainId: CHAIN,
      parameters: { ...(swapIntent().parameters as any), recipient: "0x" + "11".repeat(20) },
      actorWallet: WALLET,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/your own bound wallet/);
  });

  it("rejects a non-canonical target contract", () => {
    const res = validateIntentStructure({
      type: "SWAP",
      chainId: CHAIN,
      parameters: swapIntent().parameters,
      actorWallet: WALLET,
      proposedContract: "0x" + "22".repeat(20),
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/canonical FlowBridge contract/);
  });

  it("re-resolves the canonical contract itself rather than trusting input", () => {
    const res = validateIntentStructure({
      type: "STAKE_FLOW",
      chainId: CHAIN,
      parameters: { amountFlow: "10", recipient: WALLET },
      actorWallet: WALLET,
    });
    expect(res.ok).toBe(true);
    expect(res.targetContract).toBe(targets.vault);
  });
});

describe("V15.2 policy engine", () => {
  it("reaches READY_FOR_USER only with complete live state", () => {
    const evaluation = evaluateIntentPolicy({ intent: swapIntent(), live: liveSwapOk });
    expect(evaluation.decision).toBe("READY");
    expect(evaluation.status).toBe("READY_FOR_USER");
  });

  it("is NOT_READY when live state is missing (never a false ready)", () => {
    const evaluation = evaluateIntentPolicy({ intent: swapIntent(), live: null });
    expect(evaluation.decision).toBe("NOT_READY");
    expect(evaluation.status).not.toBe("READY_FOR_USER");
    expect(evaluation.missingEvidence.length).toBeGreaterThan(0);
  });

  it("is NOT_READY when the quote is unavailable", () => {
    const evaluation = evaluateIntentPolicy({
      intent: swapIntent(),
      live: { ...liveSwapOk, expectedOut: null },
    });
    expect(evaluation.decision).toBe("NOT_READY");
    expect(evaluation.missingEvidence.join()).toMatch(/route quote/);
  });

  it("rejects when there is no liquidity", () => {
    const evaluation = evaluateIntentPolicy({
      intent: swapIntent(),
      live: { ...liveSwapOk, expectedOut: 0 },
    });
    expect(evaluation.decision).toBe("REJECTED");
  });

  it("rejects an insufficient balance and flags a needed approval", () => {
    const low = evaluateIntentPolicy({ intent: swapIntent(), live: { ...liveSwapOk, balance: 1 } });
    expect(low.decision).toBe("REJECTED");
    const noAllowance = evaluateIntentPolicy({
      intent: swapIntent(),
      live: { ...liveSwapOk, allowance: 0 },
    });
    expect(noAllowance.riskFlags.join()).toMatch(/approval transaction is required/);
  });

  it("rejects a paused contract", () => {
    const evaluation = evaluateIntentPolicy({
      intent: swapIntent(),
      live: { ...liveSwapOk, paused: true },
    });
    expect(evaluation.decision).toBe("REJECTED");
  });

  it("enforces vault minimum stake and funded schedule", () => {
    const stake = createActionIntent({
      id: "intent-stake-0001",
      type: "STAKE_FLOW",
      actorUserId: "user-a",
      actorWallet: WALLET,
      chainId: CHAIN,
      targetContract: targets.vault,
      parameters: { amountFlow: "1", recipient: WALLET },
    });
    const belowMin = evaluateIntentPolicy({
      intent: stake,
      live: {
        balance: 50,
        allowance: 50,
        paused: false,
        minStakeFlow: 10,
        scheduleActive: true,
        observedAt: new Date().toISOString(),
      },
    });
    expect(belowMin.decision).toBe("REJECTED");
    expect(belowMin.blockers.join()).toMatch(/minimum stake is 10 FLOW/);

    const noSchedule = evaluateIntentPolicy({
      intent: { ...stake, parameters: { amountFlow: "10", recipient: WALLET } },
      live: {
        balance: 50,
        allowance: 50,
        paused: false,
        minStakeFlow: 10,
        scheduleActive: false,
        observedAt: new Date().toISOString(),
      },
    });
    expect(noSchedule.decision).toBe("REJECTED");
  });

  it("rejects a campaign draft over the org Campaign PTS budget and keeps it a draft", () => {
    const draft = createActionIntent({
      id: "intent-draft-0001",
      type: "PARTNER_CAMPAIGN_DRAFT",
      actorUserId: "user-a",
      actorWallet: null,
      organizationId: "org-a",
      chainId: CHAIN,
      targetContract: null,
      parameters: {
        title: "Verified swap sprint",
        slug: "verified-swap-sprint",
        rewardType: "CAMPAIGN_PTS",
        rewardAmount: 500,
        taskCount: 4,
      },
    });
    const over = evaluateIntentPolicy({
      intent: draft,
      live: { balance: null, allowance: null, paused: false, campaignPtsBudgetRemaining: 100, observedAt: new Date().toISOString() },
    });
    expect(over.decision).toBe("REJECTED");

    const ok = evaluateIntentPolicy({
      intent: draft,
      live: { balance: null, allowance: null, paused: false, campaignPtsBudgetRemaining: 10_000, observedAt: new Date().toISOString() },
    });
    expect(ok.decision).toBe("READY");
    expect(ok.riskFlags.join()).toMatch(/reviewer must approve/);
  });
});

describe("V15.2 staleness and replay", () => {
  it("expires an old intent instead of honouring it", () => {
    const old = createActionIntent({
      id: "intent-old-0001",
      type: "SWAP",
      actorUserId: "user-a",
      actorWallet: WALLET,
      chainId: CHAIN,
      targetContract: targets.router,
      parameters: swapIntent().parameters as Record<string, unknown>,
      now: new Date(Date.now() - 10 * 60_000),
    });
    expect(isExpired(old)).toBe(true);
    const evaluation = evaluateIntentPolicy({ intent: old, live: liveSwapOk });
    expect(evaluation.status).toBe("EXPIRED");
    expect(evaluation.decision).toBe("REJECTED");
  });

  it("discards a simulation when an economic field changed", () => {
    const original = swapIntent();
    const changed = { ...original, parameters: { ...(original.parameters as any), amountIn: "999" } };
    expect(economicFingerprint(changed)).not.toBe(economicFingerprint(original));
    const evaluation = evaluateIntentPolicy({
      intent: changed,
      live: { ...liveSwapOk, fingerprint: economicFingerprint(original) },
    });
    expect(evaluation.decision).toBe("REJECTED");
    expect(evaluation.riskFlags.join()).toMatch(/stale simulation discarded/);
  });
});

describe("V15.2 cross-actor and cross-org isolation", () => {
  it("denies preparing for another user or wallet", () => {
    expect(
      authorizePreparation({
        actorUserId: "user-a",
        actorOrgIds: [],
        actorWallet: WALLET,
        requestedUserId: "user-b",
      }).allowed,
    ).toBe(false);
    expect(
      authorizePreparation({
        actorUserId: "user-a",
        actorOrgIds: [],
        actorWallet: WALLET,
        requestedWallet: "0x" + "33".repeat(20),
      }).allowed,
    ).toBe(false);
  });

  it("denies preparing for a foreign partner org", () => {
    expect(
      authorizePreparation({
        actorUserId: "user-a",
        actorOrgIds: ["org-a"],
        actorWallet: WALLET,
        requestedOrgId: "org-b",
      }).allowed,
    ).toBe(false);
    expect(
      authorizePreparation({
        actorUserId: "user-a",
        actorOrgIds: ["org-a"],
        actorWallet: WALLET,
        requestedOrgId: "org-a",
      }).allowed,
    ).toBe(true);
  });

  it("denies anonymous preparation", () => {
    expect(
      authorizePreparation({ actorUserId: null, actorOrgIds: [], actorWallet: null }).allowed,
    ).toBe(false);
  });
});

describe("V15.2 handoff and audit", () => {
  it("deep-links into the deterministic product surface, which revalidates", () => {
    const handoff = buildHandoff(swapIntent());
    expect(handoff.surface).toBe("/trade");
    expect(handoff.href).toMatch(/tab=swap/);
    expect(handoff.revalidatedByTarget).toBe(true);
    expect(handoff.cta).toMatch(/Review/);
  });

  it("audits a decision without executing and without leaking full addresses", () => {
    const intent = swapIntent();
    const evaluation = evaluateIntentPolicy({ intent, live: liveSwapOk });
    const audit = buildIntentAudit({ intent, evaluation, handoffTarget: "/trade" });
    expect(audit.executed).toBe(false);
    expect(audit.walletShort).not.toBe(WALLET);
    expect(JSON.stringify(audit)).not.toContain(WALLET);
    const metrics = summarizeIntentAudits([audit]);
    expect(metrics.executed).toBe(0);
    expect(metrics.prepared).toBe(1);
  });
});
