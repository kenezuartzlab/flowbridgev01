/**
 * V15.2 §2/§3 — typed, versioned ActionIntent envelope.
 *
 * An intent is DATA, never authority. Flow AI may propose one; this module is
 * the deterministic gate that decides whether the proposal is even well-formed:
 * every address, chain id, token decimal and contract target is re-resolved from
 * the canonical FlowBridge registries, never from model output. Intents are
 * short-lived and must be revalidated immediately before wallet handoff.
 *
 * Pure module: no network, no DB, no keys. Live state arrives via the policy
 * engine (`intentPolicy.ts`).
 */
import { z } from "zod";
import { getContracts, MAINNET_CONTRACTS, TESTNET_CONTRACTS } from "@/lib/contracts";
import { resolveFlowBridgeExecution } from "@/lib/flowbridge/executionRegistry";
import { getFlowRewardsChainConfig } from "@/lib/rewards/flowRewardsRegistry";
import { getFlowStakingChainConfig } from "@/lib/staking/flowStakingRegistry";
import { fingerprintDigest, handoffFingerprint } from "./intentHandoff";

export const ACTION_INTENT_SCHEMA_VERSION = "flowbridge.action-intent/1" as const;
export const ACTION_POLICY_VERSION = "V15.2" as const;

/** Intents expire fast: a plan is only valid against the state it was built on. */
export const ACTION_INTENT_TTL_MS = 90_000;

export const BOT_TESTNET_CHAIN_ID = 968;
export const BOT_MAINNET_CHAIN_ID = 677;

export const ACTION_INTENT_TYPES = [
  "SWAP",
  "BRIDGE",
  "CLAIM_FLOW",
  "STAKE_FLOW",
  "UNSTAKE_FLOW",
  "CLAIM_STAKING",
  "PARTNER_CAMPAIGN_DRAFT",
] as const;
export type ActionIntentType = (typeof ACTION_INTENT_TYPES)[number];

/**
 * No SUBMITTED/CONFIRMED status exists in V15.2 — Flow AI cannot execute, so
 * there is no state in this machine that could ever mean "executed".
 */
export const ACTION_INTENT_STATUSES = [
  "PREPARED",
  "SIMULATED",
  "READY_FOR_USER",
  "EXPIRED",
  "REJECTED",
  "HANDED_OFF",
] as const;
export type ActionIntentStatus = (typeof ACTION_INTENT_STATUSES)[number];

const TRANSITIONS: Record<ActionIntentStatus, readonly ActionIntentStatus[]> = {
  PREPARED: ["SIMULATED", "REJECTED", "EXPIRED"],
  SIMULATED: ["READY_FOR_USER", "REJECTED", "EXPIRED"],
  READY_FOR_USER: ["HANDED_OFF", "REJECTED", "EXPIRED"],
  EXPIRED: [],
  REJECTED: [],
  HANDED_OFF: ["EXPIRED"],
};

export function canTransition(from: ActionIntentStatus, to: ActionIntentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/* --------------------------------- schemas -------------------------------- */

const hex40 = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 20-byte address");
const amount = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/, "amount must be a positive decimal string")
  .refine((v) => Number(v) > 0, "amount must be greater than zero");

const swapParams = z.object({
  tokenIn: hex40,
  tokenOut: hex40,
  decimalsIn: z.number().int().min(0).max(36),
  decimalsOut: z.number().int().min(0).max(36),
  amountIn: amount,
  slippageBps: z.number().int().min(1).max(500),
  recipient: hex40,
});

const bridgeParams = z.object({
  token: hex40,
  amountIn: amount,
  decimals: z.number().int().min(0).max(36),
  destinationChainId: z.number().int().positive(),
  recipient: hex40,
});

const claimFlowParams = z.object({
  claimableFlow: z.string().regex(/^\d+(\.\d{1,18})?$/),
  recipient: hex40,
});

const stakeParams = z.object({
  amountFlow: amount,
  recipient: hex40,
});

const positionParams = z.object({ recipient: hex40 });

const campaignDraftParams = z.object({
  title: z.string().min(4).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  rewardType: z.literal("CAMPAIGN_PTS"),
  rewardAmount: z.number().int().min(1).max(100_000),
  taskCount: z.number().int().min(1).max(20),
});

export const ACTION_PARAMETER_SCHEMAS = {
  SWAP: swapParams,
  BRIDGE: bridgeParams,
  CLAIM_FLOW: claimFlowParams,
  STAKE_FLOW: stakeParams,
  UNSTAKE_FLOW: positionParams,
  CLAIM_STAKING: positionParams,
  PARTNER_CAMPAIGN_DRAFT: campaignDraftParams,
} as const;

export const simulationResultSchema = z.object({
  attempted: z.boolean(),
  ok: z.boolean(),
  method: z.enum(["ETH_CALL", "REGISTRY_ONLY", "POLICY_ONLY", "NONE"]),
  gasEstimate: z.string().nullable().default(null),
  revertReason: z.string().nullable().default(null),
  observedAt: z.string(),
});
export type ActionSimulationResult = z.infer<typeof simulationResultSchema>;

export const actionIntentSchema = z.object({
  schemaVersion: z.literal(ACTION_INTENT_SCHEMA_VERSION),
  id: z.string().min(8).max(64),
  type: z.enum(ACTION_INTENT_TYPES),
  actorUserId: z.string().min(1).nullable(),
  actorWallet: hex40.nullable(),
  organizationId: z.string().min(1).nullable(),
  chainId: z.number().int().positive(),
  /** Canonical contract the action would touch (registry-resolved, never model-supplied). */
  targetContract: hex40.nullable(),
  parameters: z.record(z.string(), z.unknown()),
  sourceEvidenceRefs: z.array(z.string().min(1)).max(24),
  createdAt: z.string(),
  expiresAt: z.string(),
  policyVersion: z.literal(ACTION_POLICY_VERSION),
  simulationResult: simulationResultSchema.nullable(),
  riskFlags: z.array(z.string().min(1)).max(24),
  blockers: z.array(z.string().min(1)).max(24),
  status: z.enum(ACTION_INTENT_STATUSES),
});
export type ActionIntent = z.infer<typeof actionIntentSchema>;

/* --------------------------- canonical target gate ------------------------- */

export interface CanonicalTargets {
  chainId: number;
  isMainnet: boolean;
  chainLabel: string;
  router: string | null;
  distributor: string | null;
  vault: string | null;
  flowToken: string | null;
  bridgeProxy: string | null;
  knownTokens: Readonly<Record<string, number>>;
}

/** Registry truth for a chain. Returns null for any chain FlowBridge doesn't run on. */
export function resolveCanonicalTargets(chainId: number): CanonicalTargets | null {
  if (chainId !== BOT_TESTNET_CHAIN_ID && chainId !== BOT_MAINNET_CHAIN_ID) return null;
  const isMainnet = chainId === BOT_MAINNET_CHAIN_ID;
  const c = isMainnet ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;
  const exec = resolveFlowBridgeExecution(chainId);
  const rewards = getFlowRewardsChainConfig(chainId);
  const staking = getFlowStakingChainConfig(chainId);

  const knownTokens: Record<string, number> = {
    [c.usdtBot.toLowerCase()]: 6,
    [c.caToken.toLowerCase()]: 18,
    [c.wbot.toLowerCase()]: 18,
  };
  if (rewards?.token) knownTokens[rewards.token.toLowerCase()] = 18;

  return {
    chainId,
    isMainnet,
    chainLabel: isMainnet ? "BOT Mainnet" : "BOT Testnet",
    router: exec.configured ? exec.router.toLowerCase() : null,
    distributor: rewards?.distributor?.toLowerCase() ?? null,
    vault: staking?.vault?.toLowerCase() ?? null,
    flowToken: rewards?.token?.toLowerCase() ?? null,
    bridgeProxy: c.botBridgeProxy ? c.botBridgeProxy.toLowerCase() : null,
    knownTokens,
  };
}

/** Which canonical contract each action type may ever address. */
export function canonicalTargetFor(
  type: ActionIntentType,
  targets: CanonicalTargets,
): string | null {
  switch (type) {
    case "SWAP":
      return targets.router;
    case "BRIDGE":
      return targets.bridgeProxy;
    case "CLAIM_FLOW":
      return targets.distributor;
    case "STAKE_FLOW":
    case "UNSTAKE_FLOW":
    case "CLAIM_STAKING":
      return targets.vault;
    case "PARTNER_CAMPAIGN_DRAFT":
      return null;
  }
}

export interface StructuralValidation {
  ok: boolean;
  errors: readonly string[];
  /** Registry-resolved contract; overrides anything the caller proposed. */
  targetContract: string | null;
  targets: CanonicalTargets | null;
}

/**
 * §3 — deterministic structural validation. Rejects unknown chains, unknown or
 * decimal-mismatched tokens, foreign recipients and any proposed contract that
 * is not the canonical one for the action.
 */
export function validateIntentStructure(input: {
  type: ActionIntentType;
  chainId: number;
  parameters: unknown;
  actorWallet: string | null;
  proposedContract?: string | null;
}): StructuralValidation {
  const errors: string[] = [];
  const targets = resolveCanonicalTargets(input.chainId);
  if (!targets) {
    return {
      ok: false,
      errors: [`chain ${input.chainId} is not a supported FlowBridge network`],
      targetContract: null,
      targets: null,
    };
  }

  const parsed = ACTION_PARAMETER_SCHEMAS[input.type].safeParse(input.parameters);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "parameters"}: ${i.message}`),
      targetContract: null,
      targets,
    };
  }
  const p = parsed.data as Record<string, any>;

  const canonical = canonicalTargetFor(input.type, targets);
  if (input.type !== "PARTNER_CAMPAIGN_DRAFT" && !canonical) {
    errors.push(`${input.type} is not configured on ${targets.chainLabel}`);
  }
  if (
    input.proposedContract &&
    canonical &&
    input.proposedContract.toLowerCase() !== canonical
  ) {
    errors.push("proposed contract does not match the canonical FlowBridge contract");
  }

  const checkToken = (addr: string, decimals: number, field: string) => {
    const known = targets.knownTokens[addr.toLowerCase()];
    if (known === undefined) errors.push(`${field}: token is not in the canonical registry`);
    else if (known !== decimals) errors.push(`${field}: decimals do not match the registry (${known})`);
  };

  const requireSelf = (addr: string, field: string) => {
    if (!input.actorWallet) {
      errors.push(`${field}: no wallet is bound to your account`);
      return;
    }
    if (addr.toLowerCase() !== input.actorWallet.toLowerCase()) {
      errors.push(`${field}: must be your own bound wallet`);
    }
  };

  if (input.type === "SWAP") {
    checkToken(p.tokenIn, p.decimalsIn, "tokenIn");
    checkToken(p.tokenOut, p.decimalsOut, "tokenOut");
    if (p.tokenIn.toLowerCase() === p.tokenOut.toLowerCase()) errors.push("tokenIn equals tokenOut");
    requireSelf(p.recipient, "recipient");
  } else if (input.type === "BRIDGE") {
    checkToken(p.token, p.decimals, "token");
    requireSelf(p.recipient, "recipient");
    if (p.destinationChainId === input.chainId) errors.push("destinationChainId equals source chain");
  } else if (input.type !== "PARTNER_CAMPAIGN_DRAFT") {
    requireSelf(p.recipient, "recipient");
  }

  return { ok: errors.length === 0, errors, targetContract: canonical, targets };
}

/* ------------------------------ construction ------------------------------ */

export function createActionIntent(input: {
  id: string;
  type: ActionIntentType;
  actorUserId: string | null;
  actorWallet: string | null;
  organizationId?: string | null;
  chainId: number;
  parameters: Record<string, unknown>;
  targetContract: string | null;
  sourceEvidenceRefs?: readonly string[];
  now?: Date;
  ttlMs?: number;
}): ActionIntent {
  const now = input.now ?? new Date();
  return actionIntentSchema.parse({
    schemaVersion: ACTION_INTENT_SCHEMA_VERSION,
    id: input.id,
    type: input.type,
    actorUserId: input.actorUserId,
    actorWallet: input.actorWallet,
    organizationId: input.organizationId ?? null,
    chainId: input.chainId,
    targetContract: input.targetContract,
    parameters: input.parameters,
    sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (input.ttlMs ?? ACTION_INTENT_TTL_MS)).toISOString(),
    policyVersion: ACTION_POLICY_VERSION,
    simulationResult: null,
    riskFlags: [],
    blockers: [],
    status: "PREPARED",
  });
}

export function isExpired(intent: ActionIntent, now: Date = new Date()): boolean {
  return new Date(intent.expiresAt).getTime() <= now.getTime();
}

export function withStatus(intent: ActionIntent, status: ActionIntentStatus): ActionIntent {
  if (!canTransition(intent.status, status)) {
    throw new Error(`illegal ActionIntent transition ${intent.status} → ${status}`);
  }
  return { ...intent, status };
}

/**
 * §5 — economic fingerprint. Any change to an economic field produces a new
 * fingerprint, so a stale simulation can never be reused for a changed plan.
 */
export function economicFingerprint(intent: ActionIntent): string {
  const p = intent.parameters as Record<string, unknown>;
  const fields = [
    intent.type,
    intent.chainId,
    intent.targetContract ?? "",
    p.tokenIn ?? p.token ?? "",
    p.tokenOut ?? "",
    p.amountIn ?? p.amountFlow ?? p.claimableFlow ?? p.rewardAmount ?? "",
    p.slippageBps ?? "",
    p.destinationChainId ?? "",
    p.recipient ?? "",
  ];
  return fields.map((f) => String(f).toLowerCase()).join("|");
}

/* -------------------------------- handoff --------------------------------- */

export interface ActionHandoff {
  /** Deep link into the deterministic product surface. Parameters are prefilled hints only. */
  href: string;
  cta: string;
  surface: string;
  /** Always true: the target surface revalidates everything before signing. */
  revalidatedByTarget: true;
}

export function buildHandoff(intent: ActionIntent): ActionHandoff {
  const p = intent.parameters as Record<string, any>;
  // V15.3J §3 — the link is now OPAQUE. It carries the intent id, the economic
  // fingerprint digest, the expiry and the surface routing hint only. No
  // authoritative economic field (amount, token, destination) depends on URL text
  // any more: Trade resolves the canonical snapshot by id from server authority.
  // Root cause fixed: the SPA router re-serialized a numeric search string
  // through JSON, so a prepared `amount=10` arrived as `amount="10"` and Trade
  // rejected the prepared amount as MALFORMED.
  const correlation = {
    intent: intent.id,
    fp: fingerprintDigest(
      handoffFingerprint({
        type: intent.type,
        chainId: intent.chainId,
        targetContract: intent.targetContract,
        tokenIn: p.tokenIn ?? p.token ?? null,
        tokenOut: p.tokenOut ?? null,
        amount: p.amountIn ?? p.amountFlow ?? p.claimableFlow ?? null,
        destinationChainId: p.destinationChainId ?? null,
      }),
    ),
    exp: intent.expiresAt,
    itype: intent.type,
    ichain: intent.chainId,
  };
  const q = (o: Record<string, string | number | undefined>) =>
    Object.entries({ ...o, ...correlation })
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");


  switch (intent.type) {
    case "SWAP":
      return {
        href: `/trade?${q({ tab: "swap" })}`,
        cta: "Review in Trade",
        surface: "/trade",
        revalidatedByTarget: true,
      };
    case "BRIDGE":
      return {
        href: `/trade?${q({ tab: "bridge" })}`,
        cta: "Review in Bridge",
        surface: "/trade",
        revalidatedByTarget: true,
      };

    case "CLAIM_FLOW":
      return {
        href: `/earn?${q({})}`,
        cta: "Review claim",
        surface: "/earn",
        revalidatedByTarget: true,
      };
    case "STAKE_FLOW":
      return {
        href: `/stake?${q({ amount: p.amountFlow })}`,
        cta: "Review stake",
        surface: "/stake",
        revalidatedByTarget: true,
      };
    case "UNSTAKE_FLOW":
      return {
        href: `/stake?${q({ action: "withdraw" })}`,
        cta: "Review withdrawal",
        surface: "/stake",
        revalidatedByTarget: true,
      };
    case "CLAIM_STAKING":
      return {
        href: `/stake?${q({ action: "claim" })}`,
        cta: "Review reward claim",
        surface: "/stake",
        revalidatedByTarget: true,
      };
    case "PARTNER_CAMPAIGN_DRAFT":
      return {
        href: `/studio?${q({ draft: p.slug })}`,
        cta: "Open draft in Studio",
        surface: "/studio",
        revalidatedByTarget: true,
      };
  }
}

/** Status copy that can never imply Flow AI executed anything. */
export const ACTION_STATUS_COPY: Record<ActionIntentStatus, string> = {
  PREPARED: "Prepared",
  SIMULATED: "Simulation passed",
  READY_FOR_USER: "Ready to review",
  EXPIRED: "Expired — rebuild to continue",
  REJECTED: "Not ready",
  HANDED_OFF: "Handed to you for review",
};

export function contractsForChain(chainId: number) {
  return getContracts(chainId === BOT_MAINNET_CHAIN_ID);
}
