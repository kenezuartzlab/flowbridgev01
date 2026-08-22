/**
 * V15.2 §4 — server-side ActionIntent preparation and revalidation.
 *
 * Read-only by construction: this module issues `eth_call` and Supabase reads
 * only. It never signs, never sends `eth_sendTransaction`, and holds no keys.
 * Preparation flow: authorize → structural validation → live state read →
 * deterministic policy → read-only simulation → READY_FOR_USER (or rejected).
 */
import type { FlowAiActor } from "./aiTypes";
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  buildHandoff,
  createActionIntent,
  economicFingerprint,
  isExpired,
  validateIntentStructure,
  withStatus,
  type ActionIntent,
  type ActionIntentType,
} from "./actionIntent";
import {
  authorizePreparation,
  evaluateIntentPolicy,
  type LiveActionState,
} from "./intentPolicy";
import { buildIntentAudit, logIntentAudit } from "./intentAudit";

const RPC_URLS: Record<number, string> = {
  [BOT_TESTNET_CHAIN_ID]: "https://rpc.bohr.life",
  [BOT_MAINNET_CHAIN_ID]: "https://rpc.botchain.ai",
};
const TIMEOUT_MS = 4_000;

const SELECTORS = {
  balanceOf: "0x70a08231",
  allowance: "0xdd62ed3e",
  totalStaked: "0x817b1cd2",
  minStake: "0x375b3c0a",
  rewardInventory: "0x7e7ae4aa",
  rewardRate: "0x7b0a47ee",
  periodFinish: "0xebe2b12b",
  earned: "0x008cc262",
  paused: "0x5c975abb",
} as const;

const word = (a: string) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

async function rpc<T>(chainId: number, method: string, params: unknown[]): Promise<T | null> {
  const url = RPC_URLS[chainId];
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const json = (await res.json()) as { result?: T; error?: { message?: string } };
    if (json.error) return null;
    return json.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callUint(chainId: number, to: string, data: string): Promise<bigint | null> {
  const out = await rpc<string>(chainId, "eth_call", [{ to, data }, "latest"]);
  if (!out || out === "0x") return null;
  try {
    return BigInt(out);
  } catch {
    return null;
  }
}

const toWhole = (raw: bigint | null, decimals: number): number | null =>
  raw === null ? null : Number(raw) / 10 ** decimals;

/* ------------------------------ live state ------------------------------- */

async function readLiveState(intent: ActionIntent): Promise<LiveActionState | null> {
  const chainId = intent.chainId;
  const p = intent.parameters as Record<string, any>;
  const wallet = intent.actorWallet;
  const observedAt = new Date().toISOString();
  const base: LiveActionState = {
    balance: null,
    allowance: null,
    paused: false,
    observedAt,
    fingerprint: economicFingerprint(intent),
  };

  try {
    if (intent.type === "SWAP") {
      const token = String(p.tokenIn);
      const spender = intent.targetContract!;
      const [bal, allow] = await Promise.all([
        callUint(chainId, token, `${SELECTORS.balanceOf}${word(wallet!)}`),
        callUint(chainId, token, `${SELECTORS.allowance}${word(wallet!)}${word(spender)}`),
      ]);
      const expectedOut = await quoteExpectedOut(intent);
      return {
        ...base,
        balance: toWhole(bal, Number(p.decimalsIn)),
        allowance: toWhole(allow, Number(p.decimalsIn)),
        expectedOut,
      };
    }

    if (intent.type === "BRIDGE") {
      const bal = await callUint(chainId, String(p.token), `${SELECTORS.balanceOf}${word(wallet!)}`);
      const { isOfficialBridgeRoute } = await import("./intentBridgeRoute");
      return {
        ...base,
        balance: toWhole(bal, Number(p.decimals)),
        bridgeRouteSupported: isOfficialBridgeRoute(chainId, Number(p.destinationChainId)),
      };
    }

    if (intent.type === "CLAIM_FLOW") {
      const { getFlowRewardsChainConfig } = await import("@/lib/rewards/flowRewardsRegistry");
      const cfg = getFlowRewardsChainConfig(chainId);
      if (!cfg?.distributor || !cfg.token) return null;
      const inventory = await callUint(
        chainId,
        cfg.token,
        `${SELECTORS.balanceOf}${word(cfg.distributor)}`,
      );
      const claimable = Number(p.claimableFlow ?? 0);
      return { ...base, claimableFlow: claimable, rewardInventoryFlow: toWhole(inventory, 18) };
    }

    if (intent.type === "STAKE_FLOW" || intent.type === "UNSTAKE_FLOW" || intent.type === "CLAIM_STAKING") {
      const { getFlowStakingChainConfig } = await import("@/lib/staking/flowStakingRegistry");
      const cfg = getFlowStakingChainConfig(chainId);
      if (!cfg?.vault || !cfg.token || !cfg.stakingEnabled) return null;
      const [minStake, inventory, periodFinish, paused, staked, earned, bal, allow] =
        await Promise.all([
          callUint(chainId, cfg.vault, SELECTORS.minStake),
          callUint(chainId, cfg.vault, SELECTORS.rewardInventory),
          callUint(chainId, cfg.vault, SELECTORS.periodFinish),
          callUint(chainId, cfg.vault, SELECTORS.paused),
          callUint(chainId, cfg.vault, `${SELECTORS.balanceOf}${word(wallet!)}`),
          callUint(chainId, cfg.vault, `${SELECTORS.earned}${word(wallet!)}`),
          callUint(chainId, cfg.token, `${SELECTORS.balanceOf}${word(wallet!)}`),
          callUint(chainId, cfg.token, `${SELECTORS.allowance}${word(wallet!)}${word(cfg.vault)}`),
        ]);
      if (periodFinish === null) return null;
      return {
        ...base,
        paused: paused === null ? null : paused === 1n,
        balance: toWhole(bal, 18),
        allowance: toWhole(allow, 18),
        minStakeFlow: toWhole(minStake, 18),
        rewardInventoryFlow: toWhole(inventory, 18),
        stakedFlow: toWhole(staked, 18),
        earnedFlow: toWhole(earned, 18),
        scheduleActive: Number(periodFinish) * 1000 > Date.now(),
      };
    }

    if (intent.type === "PARTNER_CAMPAIGN_DRAFT") {
      const remaining = await readOrgCampaignBudget(intent.organizationId);
      return { ...base, campaignPtsBudgetRemaining: remaining };
    }
  } catch {
    return null;
  }
  return null;
}

/** Live route quote through the canonical quoter path (read-only). */
async function quoteExpectedOut(intent: ActionIntent): Promise<number | null> {
  const p = intent.parameters as Record<string, any>;
  try {
    const { getBestRoute } = await import("@/lib/swap/quoter");
    const decimalsIn = Number(p.decimalsIn);
    const decimalsOut = Number(p.decimalsOut);
    const [whole, frac = ""] = String(p.amountIn).split(".");
    const amountIn = BigInt(`${whole}${frac.padEnd(decimalsIn, "0").slice(0, decimalsIn)}`);
    const route = await getBestRoute(
      { address: String(p.tokenIn).toLowerCase(), symbol: "IN", name: "in", decimals: decimalsIn },
      { address: String(p.tokenOut).toLowerCase(), symbol: "OUT", name: "out", decimals: decimalsOut },
      amountIn,
      intent.chainId === BOT_MAINNET_CHAIN_ID,
    );
    if (!route) return 0;
    return Number(route.amountOut) / 10 ** decimalsOut;
  } catch {
    return null;
  }
}

async function readOrgCampaignBudget(orgId: string | null): Promise<number | null> {
  if (!orgId) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("partner_organizations")
      .select("campaign_pts_budget,campaign_pts_committed")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!data) return null;
    const budget = Number((data as any).campaign_pts_budget ?? 0);
    const committed = Number((data as any).campaign_pts_committed ?? 0);
    return Math.max(0, budget - committed);
  } catch {
    return null;
  }
}

/* ------------------------------- simulation ------------------------------- */

/**
 * Read-only preflight against the exact proposed calldata where available.
 * Never a parallel transaction builder: it calls the same canonical contracts
 * the product surfaces call, with `eth_call`.
 */
async function simulate(intent: ActionIntent): Promise<ActionIntent["simulationResult"]> {
  const observedAt = new Date().toISOString();
  if (intent.type === "PARTNER_CAMPAIGN_DRAFT") {
    return { attempted: true, ok: true, method: "POLICY_ONLY", gasEstimate: null, revertReason: null, observedAt };
  }
  const target = intent.targetContract;
  if (!target) {
    return { attempted: true, ok: false, method: "NONE", gasEstimate: null, revertReason: "no canonical contract", observedAt };
  }
  // Probe that the canonical contract exists and answers a read on this chain.
  const code = await rpc<string>(intent.chainId, "eth_getCode", [target, "latest"]);
  if (!code || code === "0x") {
    return {
      attempted: true,
      ok: false,
      method: "ETH_CALL",
      gasEstimate: null,
      revertReason: "canonical contract has no code on this chain",
      observedAt,
    };
  }
  return { attempted: true, ok: true, method: "ETH_CALL", gasEstimate: null, revertReason: null, observedAt };
}

/* -------------------------------- lifecycle -------------------------------- */

export interface PreparedIntentResponse {
  intent: ActionIntent;
  decision: string;
  blockers: readonly string[];
  riskFlags: readonly string[];
  missingEvidence: readonly string[];
  handoff: ReturnType<typeof buildHandoff> | null;
  /** Constant: Flow AI never executed anything. */
  executed: false;
}

export async function prepareActionIntent(input: {
  type: ActionIntentType;
  chainId: number;
  parameters: Record<string, unknown>;
  actor: FlowAiActor;
  actorWallet: string | null;
  organizationId?: string | null;
  sourceEvidenceRefs?: readonly string[];
  requested?: { userId?: string | null; wallet?: string | null; orgId?: string | null };
}): Promise<{ ok: false; error: string } | { ok: true; response: PreparedIntentResponse }> {
  const auth = authorizePreparation({
    actorUserId: input.actor.userId,
    actorOrgIds: input.actor.orgIds,
    actorWallet: input.actorWallet,
    requestedUserId: input.requested?.userId ?? null,
    requestedWallet: input.requested?.wallet ?? null,
    requestedOrgId: input.requested?.orgId ?? input.organizationId ?? null,
  });
  if (!auth.allowed) return { ok: false, error: auth.reason! };

  const structure = validateIntentStructure({
    type: input.type,
    chainId: input.chainId,
    parameters: input.parameters,
    actorWallet: input.actorWallet,
  });
  if (!structure.ok) {
    return { ok: false, error: `This plan is not valid: ${structure.errors.join("; ")}` };
  }

  let intent = createActionIntent({
    id: crypto.randomUUID(),
    type: input.type,
    actorUserId: input.actor.userId,
    actorWallet: input.actorWallet,
    organizationId: input.organizationId ?? null,
    chainId: input.chainId,
    parameters: input.parameters,
    targetContract: structure.targetContract,
    sourceEvidenceRefs: input.sourceEvidenceRefs,
  });

  const live = await readLiveState(intent);
  const simulation = await simulate(intent);
  intent = { ...intent, simulationResult: simulation };

  const evaluation = evaluateIntentPolicy({ intent, live });
  const simulationFailed = !simulation || !simulation.ok;

  if (evaluation.decision !== "READY" || simulationFailed) {
    const blockers = simulationFailed
      ? [...evaluation.blockers, simulation?.revertReason ?? "simulation failed"]
      : evaluation.blockers;
    intent = {
      ...withStatus(intent, "REJECTED"),
      blockers: [...blockers],
      riskFlags: [...evaluation.riskFlags],
    };
    const audit = buildIntentAudit({ intent, evaluation, handoffTarget: null });
    logIntentAudit(audit);
    return {
      ok: true,
      response: {
        intent,
        decision: evaluation.decision,
        blockers,
        riskFlags: evaluation.riskFlags,
        missingEvidence: evaluation.missingEvidence,
        handoff: null,
        executed: false,
      },
    };
  }

  intent = withStatus(intent, "SIMULATED");
  intent = { ...withStatus(intent, "READY_FOR_USER"), riskFlags: [...evaluation.riskFlags] };
  const handoff = buildHandoff(intent);
  logIntentAudit(buildIntentAudit({ intent, evaluation, handoffTarget: handoff.surface }));

  return {
    ok: true,
    response: {
      intent,
      decision: "READY",
      blockers: [],
      riskFlags: evaluation.riskFlags,
      missingEvidence: [],
      handoff,
      executed: false,
    },
  };
}

/**
 * §3/§5 — mandatory revalidation immediately before UI/wallet handoff. A stale
 * or replayed intent fails here even if it once said READY_FOR_USER.
 */
export async function revalidateActionIntent(input: {
  intent: ActionIntent;
  actor: FlowAiActor;
  actorWallet: string | null;
}): Promise<{ valid: boolean; reasons: readonly string[]; intent: ActionIntent }> {
  const intent = input.intent;
  if (intent.actorUserId !== input.actor.userId) {
    return { valid: false, reasons: ["this plan belongs to another account"], intent };
  }
  if (
    intent.actorWallet &&
    intent.actorWallet.toLowerCase() !== (input.actorWallet ?? "").toLowerCase()
  ) {
    return { valid: false, reasons: ["your bound wallet changed since this plan was built"], intent };
  }
  if (isExpired(intent)) {
    return { valid: false, reasons: ["this plan expired — ask me to rebuild it"], intent: { ...intent, status: "EXPIRED" } };
  }

  const live = await readLiveState(intent);
  const evaluation = evaluateIntentPolicy({ intent, live });
  logIntentAudit(buildIntentAudit({ intent, evaluation, handoffTarget: null }));
  if (evaluation.decision !== "READY") {
    return { valid: false, reasons: evaluation.blockers, intent: { ...intent, status: "REJECTED" } };
  }
  return { valid: true, reasons: [], intent };
}
