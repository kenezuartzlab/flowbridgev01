/**
 * V15 §7 — BOT Chain compatibility adapter registry (status-aware).
 *
 * Flow AI may only describe a BOT Chain capability as live when THIS registry
 * says so, and the registry may only be promoted by verified release evidence
 * (`promotionEvidence`). Marketing copy is never sufficient — `describeCapability`
 * fails closed to "announced / not live" language.
 */
import type { AdapterAvailability } from "./aiTypes";

export type BotAdapterId =
  | "BotEvmAdapter"
  | "BotExplorerAdapter"
  | "BotAgentIdentityAdapter"
  | "BotSmartAccountAdapter"
  | "BotLaunchpadAdapter"
  | "BotComputeAdapter"
  | "BotAgentInteropAdapter";

export interface BotAdapterDescriptor {
  id: BotAdapterId;
  title: string;
  availability: AdapterAvailability;
  /** True only when FlowBridge can actually call it today. */
  live: boolean;
  /** Source-controlled proof required to promote past `announced`. */
  promotionEvidence: string | null;
  /** What Flow AI is allowed to say/do with it right now. */
  stance: string;
  /** Chains this adapter reads, when live. */
  chainIds: readonly number[];
}

export const BOT_TESTNET_CHAIN_ID = 968;
export const BOT_MAINNET_CHAIN_ID = 677;

export const BOT_ADAPTERS: readonly BotAdapterDescriptor[] = [
  {
    id: "BotEvmAdapter",
    title: "BOT EVM reads (JSON-RPC)",
    availability: "testnet",
    live: true,
    promotionEvidence:
      "BOT Chain Developer Quick Guide — EVM compatible, testnet 968 / mainnet 677, Geth-compatible JSON-RPC",
    stance:
      "Live: receipts, logs, balances, contract reads and network registry. Mainnet promotion gates stay enforced by FlowBridge registries.",
    chainIds: [BOT_TESTNET_CHAIN_ID, BOT_MAINNET_CHAIN_ID],
  },
  {
    id: "BotExplorerAdapter",
    title: "BOT explorer evidence",
    availability: "testnet",
    live: true,
    promotionEvidence: "scan.bohr.life transaction/address evidence used by FlowBridge canaries",
    stance: "Live: link and verify transaction, contract and address evidence.",
    chainIds: [BOT_TESTNET_CHAIN_ID],
  },
  {
    id: "BotAgentIdentityAdapter",
    title: "ERC-8004 agent identity",
    availability: "announced",
    live: false,
    promotionEvidence: null,
    stance:
      "Announced for AI Agent Launchpad V1. Interface prepared; registration disabled until official contracts and developer docs are published.",
    chainIds: [],
  },
  {
    id: "BotSmartAccountAdapter",
    title: "ERC-4337 / Agent Wallet",
    availability: "announced",
    live: false,
    promotionEvidence: null,
    stance:
      "Planned in official materials. Flow AI is non-signing in V15 and holds no keys; any future execution passes policy, simulation and authorization first.",
    chainIds: [],
  },
  {
    id: "BotLaunchpadAdapter",
    title: "AI Agent Launchpad V1 (agent creation, token issuance, MemeX, fee sharing)",
    availability: "announced",
    live: false,
    promotionEvidence: null,
    stance: "Coming soon per official messaging. Disabled: no agent creation or token issuance.",
    chainIds: [],
  },
  {
    id: "BotComputeAdapter",
    title: "vCompute / compute coordination",
    availability: "unavailable",
    live: false,
    promotionEvidence: null,
    stance:
      "Roadmap direction. Provider interface only, behind a flag; integrate after endpoints, auth model, pricing and verification are documented.",
    chainIds: [],
  },
  {
    id: "BotAgentInteropAdapter",
    title: "Multi-agent intent/result envelopes",
    availability: "unavailable",
    live: false,
    promotionEvidence: null,
    stance:
      "Research direction. Internal specialist orchestration is used today; on-chain agent coordination stays future work.",
    chainIds: [],
  },
] as const;

export function getBotAdapter(id: BotAdapterId): BotAdapterDescriptor {
  const found = BOT_ADAPTERS.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown BOT adapter ${id}`);
  return found;
}

export function liveBotAdapters(): readonly BotAdapterDescriptor[] {
  return BOT_ADAPTERS.filter((a) => a.live);
}

/**
 * Guard used before any answer describes a BOT capability. Returns text Flow AI
 * is permitted to use — never "live" unless the registry is promoted with proof.
 */
export function describeCapability(id: BotAdapterId): {
  live: boolean;
  availability: AdapterAvailability;
  sentence: string;
} {
  const a = getBotAdapter(id);
  const promoted = a.live && a.promotionEvidence !== null;
  return {
    live: promoted,
    availability: a.availability,
    sentence: promoted
      ? `${a.title} is available now (${a.availability}). ${a.stance}`
      : `${a.title} is not live yet — current status: ${a.availability}. ${a.stance}`,
  };
}

/** Promotion is only valid with verified release evidence. */
export function canPromoteAdapter(input: {
  id: BotAdapterId;
  targetAvailability: AdapterAvailability;
  releaseEvidence?: string | null;
}): { allowed: boolean; reason?: string } {
  if (input.targetAvailability === "unavailable" || input.targetAvailability === "announced") {
    return { allowed: true };
  }
  if (!input.releaseEvidence || input.releaseEvidence.trim().length < 8) {
    return {
      allowed: false,
      reason: `${input.id} cannot be promoted to ${input.targetAvailability} without verified release evidence`,
    };
  }
  return { allowed: true };
}
