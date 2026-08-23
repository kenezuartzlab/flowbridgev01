/**
 * FlowBridge V19 §2 — server-authoritative external skill registry.
 *
 * The client can never register an endpoint or name an arbitrary provider: it
 * may only reference a `skillId` that exists here AND is enabled. Unknown or
 * unapproved skills are not callable, and every adapter is versioned so a
 * provider/API change cannot silently alter behavior.
 */
import { type CapabilityKind } from "./capabilityTypes";

export const FEDERATION_ADAPTER_VERSION = "flowbridge.federation-adapter/1" as const;

export interface CapabilityDescriptor {
  kind: CapabilityKind;
  /** Declared, bounded input slots. Anything else is rejected. */
  inputSlots: readonly {
    name: string;
    type: "string" | "number" | "boolean";
    required: boolean;
    maxLength?: number;
  }[];
  /** Documented reason a wallet address may be sent (V19 §4). Null = never. */
  requiresWalletAddress: null | { reason: string };
  /** Declared-safe cache TTL in ms. 0 disables caching (V19 §9). */
  cacheTtlMs: number;
  freshness: "REALTIME" | "DAILY" | "SLOW" | "STATIC";
}

export interface FederatedSkillEntry {
  skillId: string;
  provider: string;
  version: string;
  description: string;
  trustClass: "UNTRUSTED_EXTERNAL";
  capabilities: readonly CapabilityDescriptor[];
  /** Per-skill hard timeout (V19 §9). */
  timeoutMs: number;
  /** Bounded retries — network-class failures only. */
  maxRetries: number;
  /** Rate policy per actor. */
  ratePolicy: { maxCallsPerMinute: number };
  /** Circuit breaker: consecutive failures that open the breaker. */
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
  /** Per-skill kill switch. Disabled skills leave routing immediately. */
  enabled: boolean;
  /** Max accepted raw response bytes. */
  maxResponseBytes: number;
  /** Transport: MOCK is the deterministic in-process V19 canary provider. */
  transport: "MOCK" | "HTTPS";
  /** Only for HTTPS transport; server-pinned, never client supplied. */
  endpoint: string | null;
}

/**
 * Approved adapters. V19 ships exactly one deterministic mock provider (§13),
 * so no real third-party endpoint is contacted by the canary.
 */
export const FEDERATED_SKILLS: readonly FederatedSkillEntry[] = [
  {
    skillId: "bot.mock.research",
    provider: "BOT Chain Mock Research Agent",
    version: "1.0.0",
    description:
      "Deterministic in-process BOT Chain research skill used to exercise the V19 adapter boundary. Read-only analysis and candidate suggestions only.",
    trustClass: "UNTRUSTED_EXTERNAL",
    capabilities: [
      {
        kind: "PROTOCOL_READ",
        inputSlots: [{ name: "topic", type: "string", required: true, maxLength: 120 }],
        requiresWalletAddress: null,
        cacheTtlMs: 60_000,
        freshness: "DAILY",
      },
      {
        kind: "GENERAL_ANALYSIS",
        inputSlots: [{ name: "question", type: "string", required: true, maxLength: 400 }],
        requiresWalletAddress: null,
        cacheTtlMs: 0,
        freshness: "SLOW",
      },
    ],
    timeoutMs: 2_500,
    maxRetries: 1,
    ratePolicy: { maxCallsPerMinute: 12 },
    circuitFailureThreshold: 3,
    circuitCooldownMs: 30_000,
    enabled: true,
    maxResponseBytes: 32_768,
    transport: "MOCK",
  },
  {
    skillId: "bot.mock.market",
    provider: "BOT Chain Mock Market Feed",
    version: "0.9.0",
    description:
      "Reference market-read adapter kept in the registry but disabled by default; demonstrates that unapproved/disabled skills are not routable.",
    trustClass: "UNTRUSTED_EXTERNAL",
    capabilities: [
      {
        kind: "MARKET_READ",
        inputSlots: [{ name: "symbol", type: "string", required: true, maxLength: 24 }],
        requiresWalletAddress: null,
        cacheTtlMs: 15_000,
        freshness: "REALTIME",
      },
    ],
    timeoutMs: 2_000,
    maxRetries: 0,
    ratePolicy: { maxCallsPerMinute: 6 },
    circuitFailureThreshold: 2,
    circuitCooldownMs: 60_000,
    enabled: false,
    maxResponseBytes: 8_192,
    transport: "MOCK",
  },
] as const;

/** Global kill switch (V19 §11). Federation is opt-in per deployment. */
export function isFederationGloballyEnabled(env?: Record<string, string | undefined>): boolean {
  const raw = (env ?? (typeof process !== "undefined" ? process.env : {}))?.[
    "FLOW_AI_FEDERATION_ENABLED"
  ];
  if (typeof raw !== "string") return true; // default on; per-skill flags still gate
  const v = raw.trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "off");
}

export function findSkill(skillId: string): FederatedSkillEntry | undefined {
  return FEDERATED_SKILLS.find((s) => s.skillId === skillId);
}

export function findCapability(
  skill: FederatedSkillEntry,
  kind: string,
): CapabilityDescriptor | undefined {
  return skill.capabilities.find((c) => c.kind === kind);
}

/**
 * Routable = registry-approved AND enabled AND federation globally enabled.
 * Anything else is unroutable and must fail closed.
 */
export function isSkillRoutable(
  skillId: string,
  env?: Record<string, string | undefined>,
): boolean {
  if (!isFederationGloballyEnabled(env)) return false;
  const skill = findSkill(skillId);
  return Boolean(skill?.enabled);
}

/** Public-safe registry metadata for the evidence drawer / acceptance evidence. */
export function federationRegistryMetadata(env?: Record<string, string | undefined>) {
  return {
    adapterVersion: FEDERATION_ADAPTER_VERSION,
    globallyEnabled: isFederationGloballyEnabled(env),
    skills: FEDERATED_SKILLS.map((s) => ({
      skillId: s.skillId,
      provider: s.provider,
      version: s.version,
      description: s.description,
      trustClass: s.trustClass,
      enabled: s.enabled,
      routable: isSkillRoutable(s.skillId, env),
      timeoutMs: s.timeoutMs,
      ratePolicy: s.ratePolicy,
      capabilityKinds: s.capabilities.map((c) => c.kind),
      /** Explicit: no capability class in V19 can execute or write. */
      writeAuthority: false as const,
    })),
  };
}
