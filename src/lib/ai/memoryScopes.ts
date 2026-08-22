/**
 * V15 §5/§11 — privacy-scoped memory & feedback layer.
 *
 * Memory is opt-in and strictly scoped. `readableScopes` is derived from a
 * SERVER-resolved actor; a model-supplied scope is never trusted. Secrets are
 * rejected at write time so they can never enter memory.
 */
import type { FlowAiActor, MemoryScope } from "./aiTypes";

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  /** Owner id: userId for USER_PRIVATE, orgId for PARTNER_ORG_PRIVATE. */
  ownerId: string | null;
  key: string;
  value: string;
  createdAt: string;
  /** Where it came from: a user statement, a correction, or product ingestion. */
  origin: "USER_STATED" | "USER_CORRECTION" | "PRODUCT_INGESTION";
  /** Candidate knowledge is never shared until validated/reviewed. */
  promoted: boolean;
}

export function readableScopes(actor: FlowAiActor): readonly MemoryScope[] {
  const scopes: MemoryScope[] = ["SESSION", "FLOWBRIDGE_GLOBAL", "PUBLIC_BOT_ECOSYSTEM"];
  if (actor.userId) scopes.push("USER_PRIVATE");
  if (actor.orgIds.length > 0) scopes.push("PARTNER_ORG_PRIVATE");
  return scopes;
}

/** Filters a memory store down to what this actor may read. No cross-scope leaks. */
export function filterReadableMemory(
  entries: readonly MemoryEntry[],
  actor: FlowAiActor,
): readonly MemoryEntry[] {
  const scopes = readableScopes(actor);
  return entries.filter((e) => {
    if (!scopes.includes(e.scope)) return false;
    if (e.scope === "USER_PRIVATE") return !!actor.userId && e.ownerId === actor.userId;
    if (e.scope === "PARTNER_ORG_PRIVATE") return !!e.ownerId && actor.orgIds.includes(e.ownerId);
    return true;
  });
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b[a-f0-9]{64}\b/i, // raw private key / hex secret
  /\b(seed phrase|mnemonic|private key|secret key)\b/i,
  /\b(sk|sb_secret|eyJ)[A-Za-z0-9_\-.]{16,}/,
  /\bBearer\s+[A-Za-z0-9_\-.]{16,}/i,
  /(?:\b\w+\b\s+){11,23}\b\w+\b$/i, // 12/24-word phrase shape (checked last)
];

export type MemoryWriteResult =
  | { accepted: true; entry: MemoryEntry }
  | { accepted: false; reason: string };

export function writeMemory(input: {
  actor: FlowAiActor;
  scope: MemoryScope;
  ownerId?: string | null;
  key: string;
  value: string;
  origin: MemoryEntry["origin"];
  optedIn: boolean;
  now?: Date;
}): MemoryWriteResult {
  if (!input.optedIn) return { accepted: false, reason: "memory is opt-in and is currently off" };

  if (looksSecret(input.value)) {
    return { accepted: false, reason: "refused: value looks like a secret or recovery phrase" };
  }

  if (input.scope === "USER_PRIVATE") {
    if (!input.actor.userId) return { accepted: false, reason: "sign in required" };
    if (input.ownerId && input.ownerId !== input.actor.userId) {
      return { accepted: false, reason: "cannot write memory for another user" };
    }
  }
  if (input.scope === "PARTNER_ORG_PRIVATE") {
    if (!input.ownerId || !input.actor.orgIds.includes(input.ownerId)) {
      return { accepted: false, reason: "cannot write memory for another organization" };
    }
  }
  if (input.scope === "FLOWBRIDGE_GLOBAL" || input.scope === "PUBLIC_BOT_ECOSYSTEM") {
    if (input.origin !== "PRODUCT_INGESTION" || !input.actor.isInternalOperator) {
      return {
        accepted: false,
        reason: "shared knowledge requires deterministic validation or admin-reviewed ingestion",
      };
    }
  }

  return {
    accepted: true,
    entry: {
      id: `${input.scope}:${input.ownerId ?? "-"}:${input.key}`,
      scope: input.scope,
      ownerId: input.ownerId ?? (input.scope === "USER_PRIVATE" ? input.actor.userId : null),
      key: input.key,
      value: input.value.slice(0, 500),
      createdAt: (input.now ?? new Date()).toISOString(),
      origin: input.origin,
      promoted: input.origin === "PRODUCT_INGESTION",
    },
  };
}

export function looksSecret(value: string): boolean {
  const v = value.trim();
  return SECRET_PATTERNS.some((re) => re.test(v));
}

/** Users can always inspect and clear their own memory. */
export function clearMemoryFor(
  entries: readonly MemoryEntry[],
  actor: FlowAiActor,
  scope: Extract<MemoryScope, "USER_PRIVATE" | "SESSION">,
): readonly MemoryEntry[] {
  return entries.filter((e) => {
    if (e.scope !== scope) return true;
    if (scope === "SESSION") return false;
    return e.ownerId !== actor.userId;
  });
}
