/**
 * V15 §5 — revisioned knowledge object model + retrieval.
 *
 * Knowledge is a set of immutable, revisioned facts. A chat response can NEVER
 * rewrite canonical truth: `ingestKnowledge` only accepts trusted sources and
 * always appends a new revision; user corrections land as CANDIDATES that must
 * pass deterministic validation or admin review before promotion.
 */
import type {
  DataClass,
  EvidenceItem,
  FreshnessClass,
  MemoryScope,
  SourceAuthority,
} from "./aiTypes";

export interface KnowledgeFact {
  id: string;
  revision: number;
  entity: string;
  relation: string;
  value: unknown;
  /** Human sentence used for grounding prose answers. */
  statement: string;
  source: string;
  sourceHash: string;
  validFrom: string;
  validTo: string | null;
  freshnessClass: FreshnessClass;
  authority: SourceAuthority;
  dataClass: DataClass;
  visibilityScope: MemoryScope;
  confidence: "high" | "medium" | "low";
  keywords: readonly string[];
}

export type TrustedIngestionSource = "PRODUCT_DOC" | "VERIFIED_PRODUCT_EVENT" | "OFFICIAL_BOT_DOC";

/** Deterministic, dependency-free hash (FNV-1a) so ingestion is reproducible. */
export function sourceHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16).padStart(8, "0")}`;
}

function fact(
  partial: Omit<KnowledgeFact, "revision" | "sourceHash" | "validTo"> &
    Partial<Pick<KnowledgeFact, "revision" | "validTo">>,
): KnowledgeFact {
  return {
    revision: partial.revision ?? 1,
    validTo: partial.validTo ?? null,
    sourceHash: sourceHash(`${partial.source}|${partial.statement}`),
    ...partial,
  } as KnowledgeFact;
}

const PRODUCT_DOC = (source: string) => ({
  source,
  authority: "PRODUCT_DOCS" as SourceAuthority,
  dataClass: "FLOWBRIDGE_KNOWLEDGE" as DataClass,
  visibilityScope: "FLOWBRIDGE_GLOBAL" as MemoryScope,
  confidence: "high" as const,
});

const OFFICIAL_BOT = (source: string) => ({
  source,
  authority: "OFFICIAL_DOCS" as SourceAuthority,
  dataClass: "BOT_OFFICIAL" as DataClass,
  visibilityScope: "PUBLIC_BOT_ECOSYSTEM" as MemoryScope,
  confidence: "high" as const,
});

/**
 * Canonical offline knowledge snapshot. Everything here is answerable with NO
 * network access and is labelled with its `validFrom` as-of date.
 */
export const FLOW_AI_KNOWLEDGE: readonly KnowledgeFact[] = [
  fact({
    id: "kb.trade.tabs",
    entity: "FlowBridge/trade",
    relation: "surfaces",
    value: ["CA/BOT", "SWAP", "BRIDGE"],
    statement:
      "Trade has three surfaces: CA/BOT (fixed pair), SWAP (any BOT Chain pair via FlowBridgeRouter) and BRIDGE (USDT between BOT Chain and BNB/ETH/TRON).",
    validFrom: "2026-08-01T00:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["swap", "trade", "bridge", "tab", "ca", "bot", "pair"],
    ...PRODUCT_DOC("docs/bridge/README.md"),
  }),
  fact({
    id: "kb.fees.swap",
    entity: "FlowBridge/fees",
    relation: "platformFee",
    value: { swapFeeBps: 10, bridgeFee: 0, bridgeMinimumUsdt: 10 },
    statement:
      "A 0.1% platform fee applies to swaps only and is disclosed before signing. Bridging charges no platform fee and has a 10 USDT minimum.",
    validFrom: "2026-08-01T00:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["fee", "fees", "cost", "0.1%", "minimum", "bridge"],
    ...PRODUCT_DOC("src/lib/swap/platformFee.ts"),
  }),
  fact({
    id: "kb.points.v2",
    entity: "FlowBridge/FlowPoints",
    relation: "policy",
    value: { perWholeUsd: 1, minimumSwapUsd: 5, dailyCap: 1000, version: "FLOW_POINTS_V2" },
    statement:
      "FLOW Points V2: 1 point per whole $1 of qualifying swap volume, swaps must be at least $5, and daily earning is capped at 1,000 points.",
    validFrom: "2026-08-20T15:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["points", "pts", "flow points", "cap", "earn", "accrual", "volume"],
    ...PRODUCT_DOC("docs/rewards/V12_4A_FLOW_POINTS_V2.md"),
  }),
  fact({
    id: "kb.points.vs.campaign",
    entity: "FlowBridge/rewards",
    relation: "distinguishes",
    value: { flowPoints: "swap volume", campaignPts: "campaign tasks", xp: "engagement levels" },
    statement:
      "FLOW Points come from swap volume and convert to FLOW token; Campaign PTS are earned from partner campaign tasks and are excluded from FLOW conversion; XP tracks engagement levels only.",
    validFrom: "2026-08-10T00:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["pts", "xp", "campaign", "difference", "convert", "flow"],
    ...PRODUCT_DOC("docs/rewards/V12_4_ACCRUAL_INTEGRITY.md"),
  }),
  fact({
    id: "kb.flow.claim.testnet",
    entity: "FlowBridge/FLOW",
    relation: "claimReadiness",
    value: {
      chainId: 968,
      token: "0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac",
      distributor: "0x559605fa3120cd472b86966FE4b5dC7e9e0b2b34",
      conversion: "1 FLOW Point = 1 FLOW, cumulative, Campaign PTS excluded",
    },
    statement:
      "On BOT Testnet (968) FLOW claims are live: FlowToken 0xCE14Ca…41Ac and FlowRewardsDistributor 0x559605…2b34, converting 1 FLOW Point to 1 FLOW cumulatively. BOT Mainnet claims are pending promotion.",
    validFrom: "2026-08-21T00:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["claim", "flow token", "distributor", "testnet", "mainnet", "conversion"],
    ...PRODUCT_DOC("src/lib/rewards/flowRewardsRegistry.ts"),
  }),
  fact({
    id: "kb.staking.testnet",
    entity: "FlowBridge/staking",
    relation: "policy",
    value: {
      chainId: 968,
      vault: "0x36f2318027edf79D083Aac98D66C9a1b3e2AAdD1",
      minStake: "10 FLOW",
      rewardBudgetPerEpoch: "100000 FLOW",
      epochDurationSeconds: 2592000,
      emergencyWithdraw: "ALWAYS_WITHDRAWABLE_PRINCIPAL",
    },
    statement:
      "FLOW staking on BOT Testnet uses vault 0x36f231…AdD1 with a 10 FLOW minimum, a 100,000 FLOW budget per 30-day epoch, and principal that is always withdrawable. Rates are estimates from live vault state, never a guaranteed APY.",
    validFrom: "2026-08-21T00:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["stake", "staking", "vault", "apr", "apy", "rewards", "epoch", "withdraw"],
    ...PRODUCT_DOC("docs/staking/README.md"),
  }),
  fact({
    id: "kb.gas.bot",
    entity: "FlowBridge/gas",
    relation: "guidance",
    value: { warnBelowBot: 0.05 },
    statement:
      "Transactions on BOT Chain need a small BOT balance for gas; below 0.05 BOT FlowBridge warns you before you try to sign.",
    validFrom: "2026-08-01T00:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["gas", "bot", "balance", "fail", "low"],
    ...PRODUCT_DOC("src/modals/BotGasNoticeModal.tsx"),
  }),
  fact({
    id: "kb.campaign.publish",
    entity: "FlowBridge/PartnerStudio",
    relation: "authority",
    value: { partnerCanPublish: false, rewardType: "CAMPAIGN_PTS" },
    statement:
      "Partners draft and submit campaigns in their own org scope; only internal operators approve and publish revisions, and campaign rewards are Campaign PTS only.",
    validFrom: "2026-08-21T00:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["campaign", "studio", "partner", "publish", "approve", "review", "draft"],
    ...PRODUCT_DOC("src/lib/partner/partnerStudio.server.ts"),
  }),
  fact({
    id: "kb.bot.chainids",
    entity: "BOTChain/network",
    relation: "chainIds",
    value: { testnet: 968, mainnet: 677, rpc: "Geth-compatible JSON-RPC" },
    statement:
      "BOT Chain is EVM compatible with testnet chainId 968 and mainnet chainId 677, exposing Geth-compatible JSON-RPC and standard Ethereum tooling.",
    validFrom: "2026-08-06T00:00:00.000Z",
    freshnessClass: "SLOW",
    keywords: ["chain id", "chainid", "rpc", "evm", "968", "677", "network"],
    ...OFFICIAL_BOT("BOT Chain Developer Quick Guide (botchain.ai)"),
  }),
  fact({
    id: "kb.bot.launchpad",
    entity: "BOTChain/AgentLaunchpad",
    relation: "releaseStatus",
    value: { status: "coming_soon" },
    statement:
      "BOT Chain's AI Agent Launchpad V1 — agent creation, on-chain identity, Agent Wallet smart accounts, token issuance, MemeX trading and fee sharing — is announced as coming soon and is not live.",
    validFrom: "2026-08-06T00:00:00.000Z",
    freshnessClass: "DAILY",
    keywords: ["launchpad", "agent", "erc-8004", "erc-4337", "memex", "identity", "wallet", "vcompute"],
    ...OFFICIAL_BOT("BOT Chain official announcements (@BOTChain_ai, botchain.ai)"),
  }),
  fact({
    id: "kb.ai.authority",
    entity: "FlowAI/authority",
    relation: "boundary",
    value: { canSign: false, canPublish: false, canChangeEconomics: false },
    statement:
      "Flow AI can research, explain, plan and prepare, but it never signs transactions, never holds keys and never changes rewards, staking or campaign authority — you always confirm in your wallet.",
    validFrom: "2026-08-22T00:00:00.000Z",
    freshnessClass: "STATIC",
    keywords: ["ai", "sign", "authority", "safe", "keys", "seed", "autonomous"],
    ...PRODUCT_DOC("docs/ai/V15_FLOW_AI_INTELLIGENCE_FABRIC.md"),
  }),
] as const;

export interface KnowledgeQuery {
  text: string;
  /** Scopes the caller is allowed to read. */
  allowedScopes: readonly MemoryScope[];
  limit?: number;
  now?: Date;
}

/** Simple deterministic keyword/entity retrieval over the revisioned snapshot. */
export function retrieveKnowledge(
  query: KnowledgeQuery,
  corpus: readonly KnowledgeFact[] = FLOW_AI_KNOWLEDGE,
): readonly KnowledgeFact[] {
  const now = query.now ?? new Date();
  const words = tokenize(query.text);
  const scored = corpus
    .filter((f) => query.allowedScopes.includes(f.visibilityScope))
    .filter((f) => Date.parse(f.validFrom) <= now.getTime())
    .filter((f) => f.validTo === null || Date.parse(f.validTo) > now.getTime())
    .map((f) => ({ f, score: scoreFact(f, words) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.f.id.localeCompare(b.f.id));
  return scored.slice(0, query.limit ?? 4).map((s) => s.f);
}

function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$%.\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function scoreFact(f: KnowledgeFact, words: readonly string[]): number {
  const haystack = `${f.entity} ${f.relation} ${f.statement}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (f.keywords.some((k) => k === w || k.includes(w) || w.includes(k))) score += 3;
    else if (haystack.includes(w)) score += 1;
  }
  return score;
}

/** Knowledge facts become evidence items with an as-of timestamp. */
export function factToEvidence(f: KnowledgeFact): EvidenceItem {
  return {
    id: `${f.id}@r${f.revision}`,
    label: f.source,
    dataClass: f.dataClass,
    authority: f.authority,
    freshness: f.freshnessClass,
    observedAt: f.validFrom,
    value: f.value,
    excerpt: f.statement,
  };
}

/* --------------------------- ingestion pipeline --------------------------- */

export interface IngestionInput {
  fact: Omit<KnowledgeFact, "revision" | "sourceHash">;
  trustedSource: TrustedIngestionSource | null;
}

export type IngestionResult =
  | { accepted: true; fact: KnowledgeFact; supersededRevision: number | null }
  | { accepted: false; reason: string; candidate: true };

/**
 * Append-only ingestion. Untrusted input (a chat turn, partner text, web page)
 * can never become canonical — it is returned as a candidate for review.
 */
export function ingestKnowledge(
  input: IngestionInput,
  corpus: readonly KnowledgeFact[] = FLOW_AI_KNOWLEDGE,
): IngestionResult {
  if (!input.trustedSource) {
    return {
      accepted: false,
      candidate: true,
      reason: "Untrusted source — recorded as a knowledge candidate pending admin-reviewed ingestion",
    };
  }
  const previous = corpus.filter((f) => f.id === input.fact.id);
  const nextRevision = previous.reduce((max, f) => Math.max(max, f.revision), 0) + 1;
  return {
    accepted: true,
    supersededRevision: nextRevision > 1 ? nextRevision - 1 : null,
    fact: {
      ...input.fact,
      revision: nextRevision,
      sourceHash: sourceHash(`${input.fact.source}|${input.fact.statement}`),
    },
  };
}
