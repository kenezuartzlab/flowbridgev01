/**
 * V15.3A §2/§3 — runtime action-preparation routing and pending slot completion.
 *
 * Pure module. It decides whether a sentence is an ACTION PREPARATION request
 * before the generic knowledge responder can consume it, and it models the
 * short-lived pending state used to ask for a genuinely missing economic input
 * (typically the exact amount).
 *
 * Invariants:
 * - "small"/"a bit"/"some" is NEVER an amount. No default is ever substituted.
 * - A suggested example ("for example, 10 USDT") is not consent.
 * - Nothing here is authoritative: the server re-resolves chain, tokens, router,
 *   decimals, balance, allowance, quote and simulation before READY_FOR_USER.
 */
import {
  BOT_TESTNET_CHAIN_ID,
  BOT_MAINNET_CHAIN_ID,
  contractsForChain,
  type ActionIntentType,
} from "./actionIntent";

/** Pending preparation state lives only minutes, and dies on any context change. */
export const PENDING_PREPARATION_TTL_MS = 5 * 60_000;

export type PendingField = "amount";

export interface PreparationShape {
  type: ActionIntentType;
  chainId: number;
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  destinationChainId: number | null;
  /** Exact amount if the user actually supplied one; never inferred. */
  amount: string | null;
  missingFields: readonly PendingField[];
  recognized: readonly string[];
}

export interface PendingPreparation extends Omit<PreparationShape, "amount"> {
  createdAt: string;
  expiresAt: string;
  /** Binds the pending slot to actor + wallet + chain; any change invalidates. */
  actorKey: string;
}

const SYMBOLS: Record<
  string,
  { key: "usdtBot" | "caToken" | "wbot"; decimals: number; native?: true }
> = {
  USDT: { key: "usdtBot", decimals: 6 },
  CA: { key: "caToken", decimals: 18 },
  WBOT: { key: "wbot", decimals: 18 },
  // V15.3K §5 — "BOT" means NATIVE BOT. The route leg is the canonical wrapped
  // contract, but the asset the user reviews and receives stays native BOT.
  BOT: { key: "wbot", decimals: 18, native: true },
};


/** Imperative preparation language — routed to ACTION_PREPARATION first. */
const PREPARE_RE =
  /\b(prepare|prep|set\s?up|setup|get\s+(?:me\s+)?ready|ready\s+up|simulate|build|draft|plan|stage)\b/;

/** Vague size qualifiers that must trigger a clarification, never a default. */
const VAGUE_AMOUNT_RE = /\b(small|smallest|tiny|little|a bit|a little|some|minimal|micro|test|modest)\b/;

const ACTION_RE: readonly { re: RegExp; type: ActionIntentType }[] = [
  { re: /\bbridge\b/, type: "BRIDGE" },
  { re: /\b(swap|trade|exchange)\b/, type: "SWAP" },
  { re: /\bunstake\b/, type: "UNSTAKE_FLOW" },
  { re: /\bstake\b/, type: "STAKE_FLOW" },
  { re: /\bclaim\b/, type: "CLAIM_FLOW" },
];

export function tokenFor(symbol: string, chainId: number) {
  const entry = SYMBOLS[symbol.toUpperCase()];
  if (!entry) return null;
  const c = contractsForChain(chainId);
  return {
    address: c[entry.key].toLowerCase(),
    decimals: entry.decimals,
    symbol: symbol.toUpperCase(),
  };
}

function chainFromText(q: string, fallback: number): number {
  if (/\b968\b/.test(q) || /\btestnet\b/.test(q)) return BOT_TESTNET_CHAIN_ID;
  if (/\bmainnet\b/.test(q)) return BOT_MAINNET_CHAIN_ID;
  return fallback;
}

/** Reads an exact amount only when it is attached to a token or stands alone. */
export function extractExactAmount(text: string, tokenSymbol: string | null): string | null {
  const q = text.toLowerCase();
  const symbols = tokenSymbol ? [tokenSymbol.toLowerCase()] : Object.keys(SYMBOLS).map((s) => s.toLowerCase());
  for (const sym of symbols) {
    const m = q.match(new RegExp(`(\\d+(?:\\.\\d{1,18})?)\\s*${sym}\\b`));
    if (m) return m[1];
  }
  // Bare numeric reply ("10", "10.5") — a direct answer to the clarification.
  const bare = text.trim().match(/^(\d+(?:\.\d{1,18})?)$/);
  if (bare) return bare[1];
  return null;
}

function symbolsInOrder(q: string): string[] {
  const found: { idx: number; sym: string }[] = [];
  for (const sym of Object.keys(SYMBOLS)) {
    const re = new RegExp(`\\b${sym.toLowerCase()}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(q)) !== null) found.push({ idx: m.index, sym });
  }
  // "BOT Testnet" / "BOT Chain" is a network mention, not a token mention.
  const filtered = found.filter(
    (f) => !(f.sym === "BOT" && /^bot\s+(testnet|mainnet|chain|scan)/.test(q.slice(f.idx))),
  );
  const ordered = (filtered.length > 0 ? filtered : found).sort((a, b) => a.idx - b.idx);
  const unique: string[] = [];
  for (const f of ordered) if (!unique.includes(f.sym)) unique.push(f.sym);
  return unique;
}

/**
 * Detects an action-preparation request. Returns null for questions that are
 * genuinely informational ("how do I bridge?") so those keep the normal
 * knowledge path.
 */
export function detectPreparationRequest(input: {
  question: string;
  defaultChainId?: number;
}): PreparationShape | null {
  const q = input.question.toLowerCase();
  const explicitPrepare = PREPARE_RE.test(q);
  const imperative =
    explicitPrepare ||
    /\b(do it|for me|go ahead|please)\b/.test(q) ||
    /^(swap|bridge|stake|unstake|claim)\b/.test(q.trim());
  if (!imperative) return null;
  // Informational phrasing wins even when it contains a verb.
  if (/^(how|what|why|when|where|can i|should i|is it|does)\b/.test(q.trim()) && !explicitPrepare) {
    return null;
  }

  const action = ACTION_RE.find((a) => a.re.test(q));
  if (!action) return null;

  const chainId = chainFromText(q, input.defaultChainId ?? BOT_TESTNET_CHAIN_ID);
  const recognized: string[] = [action.type.replace(/_/g, " "), `chain ${chainId}`];

  let tokenInSymbol: string | null = null;
  let tokenOutSymbol: string | null = null;
  let destinationChainId: number | null = null;

  if (action.type === "SWAP") {
    const syms = symbolsInOrder(q);
    if (syms.length < 2) return null;
    tokenInSymbol = syms[0];
    tokenOutSymbol = syms[1];
    if (tokenFor(tokenInSymbol, chainId)?.address === tokenFor(tokenOutSymbol, chainId)?.address) {
      return null;
    }
    recognized.push(`${tokenInSymbol} → ${tokenOutSymbol}`);
  } else if (action.type === "BRIDGE") {
    tokenInSymbol = "USDT";
    destinationChainId = /\b(bnb|bsc)\b/.test(q)
      ? chainId === BOT_TESTNET_CHAIN_ID
        ? 97
        : 56
      : null;
    if (!destinationChainId) return null;
    recognized.push(`USDT → destination chain ${destinationChainId}`);
  } else if (action.type === "STAKE_FLOW") {
    tokenInSymbol = "FLOW";
    recognized.push("FLOW staking vault");
  }

  const needsAmount =
    action.type === "SWAP" || action.type === "BRIDGE" || action.type === "STAKE_FLOW";
  // A vague qualifier such as "small" can never become an amount; only an
  // explicit numeric value attached to the token counts.
  const amount = needsAmount ? extractExactAmount(input.question, tokenInSymbol) : null;
  if (!amount && VAGUE_AMOUNT_RE.test(q)) recognized.push("vague size qualifier — exact amount required");

  return {
    type: action.type,
    chainId,
    tokenInSymbol,
    tokenOutSymbol,
    destinationChainId,
    amount,
    missingFields: needsAmount && !amount ? ["amount"] : [],
    recognized,
  };
}

export function buildActorKey(input: {
  userId: string | null;
  wallet: string | null;
  chainId: number;
  orgId?: string | null;
}): string {
  return [
    input.userId ?? "anon",
    (input.wallet ?? "none").toLowerCase(),
    String(input.chainId),
    input.orgId ?? "no-org",
  ].join("|");
}

export function createPending(input: {
  shape: PreparationShape;
  actorKey: string;
  now?: Date;
}): PendingPreparation {
  const now = input.now ?? new Date();
  return {
    type: input.shape.type,
    chainId: input.shape.chainId,
    tokenInSymbol: input.shape.tokenInSymbol,
    tokenOutSymbol: input.shape.tokenOutSymbol,
    destinationChainId: input.shape.destinationChainId,
    missingFields: input.shape.missingFields,
    recognized: input.shape.recognized,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PENDING_PREPARATION_TTL_MS).toISOString(),
    actorKey: input.actorKey,
  };
}

export type PendingResolution =
  | { kind: "NONE" }
  | { kind: "EXPIRED" }
  | { kind: "CONTEXT_CHANGED" }
  | { kind: "SUPERSEDED"; shape: PreparationShape }
  | { kind: "STILL_MISSING"; pending: PendingPreparation }
  | { kind: "COMPLETED"; shape: PreparationShape };

/**
 * Applies the next user turn to a pending slot. A new, incompatible action
 * request supersedes the pending state instead of silently completing it.
 */
export function resolvePending(input: {
  pending: PendingPreparation | null;
  question: string;
  actorKey: string;
  now?: Date;
}): PendingResolution {
  const pending = input.pending;
  if (!pending) return { kind: "NONE" };
  const now = input.now ?? new Date();
  if (new Date(pending.expiresAt).getTime() <= now.getTime()) return { kind: "EXPIRED" };
  if (pending.actorKey !== input.actorKey) return { kind: "CONTEXT_CHANGED" };

  const fresh = detectPreparationRequest({
    question: input.question,
    defaultChainId: pending.chainId,
  });
  if (
    fresh &&
    (fresh.type !== pending.type ||
      fresh.chainId !== pending.chainId ||
      (fresh.tokenInSymbol ?? null) !== (pending.tokenInSymbol ?? null) ||
      (fresh.tokenOutSymbol ?? null) !== (pending.tokenOutSymbol ?? null))
  ) {
    return { kind: "SUPERSEDED", shape: fresh };
  }

  const amount = extractExactAmount(input.question, pending.tokenInSymbol);
  if (!amount) {
    // Any clearly different topic drops the pending slot rather than lingering.
    const offTopic = !new RegExp(
      `(${[pending.tokenInSymbol, pending.tokenOutSymbol, pending.type.split("_")[0]]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase())
        .join("|")}|amount|yes|ok)`,
    ).test(input.question.toLowerCase());
    if (offTopic) return { kind: "CONTEXT_CHANGED" };
    return { kind: "STILL_MISSING", pending };
  }

  return {
    kind: "COMPLETED",
    shape: {
      type: pending.type,
      chainId: pending.chainId,
      tokenInSymbol: pending.tokenInSymbol,
      tokenOutSymbol: pending.tokenOutSymbol,
      destinationChainId: pending.destinationChainId,
      amount,
      missingFields: [],
      recognized: [...pending.recognized, `${amount} ${pending.tokenInSymbol ?? ""}`.trim()],
    },
  };
}

/** One concise clarification — with an EXAMPLE, never a stored default. */
export function clarificationFor(shape: PreparationShape | PendingPreparation): string {
  const symbol = shape.tokenInSymbol ?? "token";
  return `How much ${symbol} would you like to ${
    shape.type === "BRIDGE" ? "bridge" : shape.type === "STAKE_FLOW" ? "stake" : "swap"
  }? For example, 10 ${symbol}. I'll only use the exact amount you give me — I won't pick one for you.`;
}

/**
 * Turns a completed shape into canonical ActionIntent parameters. Addresses and
 * decimals come from the registry; the sentence only supplies the amount.
 */
export function parametersForShape(input: {
  shape: PreparationShape;
  wallet: string;
  claimableFlow?: number | null;
}): { type: ActionIntentType; chainId: number; parameters: Record<string, unknown> } | null {
  const { shape, wallet } = input;
  const chainId = shape.chainId;

  if (shape.type === "SWAP") {
    if (!shape.amount || !shape.tokenInSymbol || !shape.tokenOutSymbol) return null;
    const tokenIn = tokenFor(shape.tokenInSymbol, chainId);
    const tokenOut = tokenFor(shape.tokenOutSymbol, chainId);
    if (!tokenIn || !tokenOut || tokenIn.address === tokenOut.address) return null;
    return {
      type: "SWAP",
      chainId,
      parameters: {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        decimalsIn: tokenIn.decimals,
        decimalsOut: tokenOut.decimals,
        amountIn: shape.amount,
        slippageBps: 50,
        recipient: wallet,
      },
    };
  }

  if (shape.type === "BRIDGE") {
    if (!shape.amount || !shape.destinationChainId) return null;
    const token = tokenFor("USDT", chainId);
    if (!token) return null;
    return {
      type: "BRIDGE",
      chainId,
      parameters: {
        token: token.address,
        amountIn: shape.amount,
        decimals: token.decimals,
        destinationChainId: shape.destinationChainId,
        recipient: wallet,
      },
    };
  }

  if (shape.type === "STAKE_FLOW") {
    if (!shape.amount) return null;
    return { type: "STAKE_FLOW", chainId, parameters: { amountFlow: shape.amount, recipient: wallet } };
  }

  if (shape.type === "UNSTAKE_FLOW" || shape.type === "CLAIM_STAKING") {
    return { type: shape.type, chainId, parameters: { recipient: wallet } };
  }

  if (shape.type === "CLAIM_FLOW") {
    return {
      type: "CLAIM_FLOW",
      chainId,
      parameters: { claimableFlow: String(input.claimableFlow ?? 0), recipient: wallet },
    };
  }

  return null;
}
