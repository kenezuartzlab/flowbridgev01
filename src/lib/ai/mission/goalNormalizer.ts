/**
 * FlowBridge V17 §2 — deterministic goal normalization.
 *
 * A natural-language outcome becomes a typed MissionGoal BEFORE any planning.
 * Invariants:
 *  - Missing economic constraints are never invented ("small" is not an amount).
 *  - Slots supplied in a later turn are merged, so one-shot and multi-turn
 *    phrasings converge on the SAME normalized goal.
 *  - Chains, tokens and contracts come from canonical registries elsewhere; this
 *    module only resolves symbols/ids, never addresses.
 */
import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from "../actionIntent";
import { extractExactAmount } from "../preparationRouting";
import {
  EMPTY_CONSTRAINTS,
  type MissionConstraints,
  type MissionGoal,
  type MissionOutcome,
} from "./missionTypes";

const KNOWN_SYMBOLS = ["USDT", "CA", "WBOT", "BOT", "FLOW"] as const;

const VAGUE_AMOUNT_RE =
  /\b(small|smallest|tiny|little|a bit|a little|some|minimal|micro|test|modest)\b/;

function chainFrom(q: string): { chainId: number; explicit: boolean } {
  if (/\b968\b/.test(q) || /\btestnet\b/.test(q)) {
    return { chainId: BOT_TESTNET_CHAIN_ID, explicit: true };
  }
  if (/\b677\b/.test(q) || /\bmainnet\b/.test(q)) {
    return { chainId: BOT_MAINNET_CHAIN_ID, explicit: true };
  }
  return { chainId: BOT_TESTNET_CHAIN_ID, explicit: false };
}

function symbolsInOrder(q: string): string[] {
  const found: { idx: number; sym: string }[] = [];
  for (const sym of KNOWN_SYMBOLS) {
    const re = new RegExp(`\\b${sym.toLowerCase()}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(q)) !== null) found.push({ idx: m.index, sym });
  }
  // "BOT Testnet"/"BOT Chain" is a network mention, not an asset mention.
  const filtered = found.filter(
    (f) => !(f.sym === "BOT" && /^bot\s+(testnet|mainnet|chain|scan)/.test(q.slice(f.idx))),
  );
  const list = (filtered.length > 0 ? filtered : found).sort((a, b) => a.idx - b.idx);
  const unique: string[] = [];
  for (const f of list) if (!unique.includes(f.sym)) unique.push(f.sym);
  return unique;
}

/** Explicit limits only. Absence of a limit is never read as permission. */
export function extractConstraints(text: string): MissionConstraints {
  const q = text.toLowerCase();
  const c: MissionConstraints = { ...EMPTY_CONSTRAINTS };

  const spend = q.match(/\b(?:max(?:imum)?|no more than|up to|spend at most|budget)\s*(\d+(?:\.\d{1,18})?)\s*(usdt|ca|bot|wbot|flow)\b/);
  if (spend) c.maxSpend = { amount: spend[1], symbol: spend[2].toUpperCase() };

  const slip = q.match(/\b(?:max(?:imum)?\s*)?slippage\s*(?:of\s*)?(\d+(?:\.\d{1,2})?)\s*%/);
  if (slip) c.maxSlippageBps = Math.min(500, Math.max(1, Math.round(Number(slip[1]) * 100)));

  const chain = chainFrom(q);
  if (chain.explicit) c.targetChainId = chain.chainId;

  const portion = q.match(/\b(?:stake|re-?stake)\s*(\d{1,3})\s*%/) ?? q.match(/(\d{1,3})\s*%\s*(?:of\s*)?(?:it|the (?:flow|result|output))/);
  if (portion) {
    const pct = Number(portion[1]);
    if (pct > 0 && pct <= 100) c.stakePortionPercent = pct;
  }
  if (/\bhalf\b/.test(q) && /\bstake\b/.test(q)) c.stakePortionPercent = 50;

  if (/\bnever bridge\b|\bno bridging\b|\bdon'?t bridge\b|\bwithout bridging\b/.test(q)) {
    c.neverBridge = true;
  }
  if (/\bwithout spending\b|\bno (?:token )?spend\b|\bfree\b|\bwithout spending tokens\b/.test(q)) {
    c.noTokenSpend = true;
  }
  return c;
}

function outcomeFor(q: string): MissionOutcome | null {
  const swap = /\b(swap|trade|exchange)\b/.test(q);
  const stake = /\bstake\b/.test(q) && !/\bunstake\b/.test(q);
  const claim = /\bclaim\b/.test(q);
  const campaigns = /\bcampaign/.test(q);
  if (swap && stake) return "SWAP_THEN_STAKE";
  if (claim && stake) return "CLAIM_THEN_STAKE";
  if (campaigns) return "CAMPAIGNS_NO_SPEND";
  if (swap) return "SWAP_ONLY";
  if (stake) return "STAKE_ONLY";
  if (claim) return "CLAIM_ONLY";
  return null;
}

/**
 * Parses a goal sentence into a typed MissionGoal. Returns null when the text is
 * not a multi/single-surface outcome request at all.
 */
export function normalizeGoal(input: { text: string; defaultChainId?: number }): MissionGoal | null {
  const raw = input.text.trim();
  const q = raw.toLowerCase();
  const outcome = outcomeFor(q);
  if (!outcome) return null;

  const chain = chainFrom(q);
  const chainId = chain.explicit ? chain.chainId : (input.defaultChainId ?? chain.chainId);
  const constraints = extractConstraints(raw);
  const recognized: string[] = [outcome.replace(/_/g, " ").toLowerCase(), `chain ${chainId}`];

  const syms = symbolsInOrder(q);
  let assetInSymbol: string | null = null;
  let assetOutSymbol: string | null = null;

  if (outcome === "SWAP_THEN_STAKE" || outcome === "SWAP_ONLY") {
    assetInSymbol = syms[0] ?? null;
    assetOutSymbol = syms[1] ?? null;
    if (assetInSymbol && assetOutSymbol) recognized.push(`${assetInSymbol} → ${assetOutSymbol}`);
  } else if (outcome === "CLAIM_THEN_STAKE" || outcome === "CLAIM_ONLY") {
    assetInSymbol = "FLOW";
    recognized.push("FLOW rewards");
  } else if (outcome === "STAKE_ONLY") {
    assetInSymbol = "FLOW";
    recognized.push("FLOW staking vault");
  }

  const amountNeeded =
    outcome === "SWAP_THEN_STAKE" || outcome === "SWAP_ONLY" || outcome === "STAKE_ONLY";
  const amount = amountNeeded ? extractExactAmount(raw, assetInSymbol) : null;
  if (amountNeeded && !amount && VAGUE_AMOUNT_RE.test(q)) {
    recognized.push("vague size qualifier — exact amount required");
  }
  if (constraints.stakePortionPercent != null) {
    recognized.push(`stake ${constraints.stakePortionPercent}% of the result`);
  }
  if (constraints.neverBridge) recognized.push("never bridge");
  if (constraints.noTokenSpend) recognized.push("no token spend");

  const missingSlots: ("amount" | "chain")[] = [];
  if (amountNeeded && !amount) missingSlots.push("amount");

  return {
    outcome,
    chainId,
    assetInSymbol,
    assetOutSymbol,
    amount,
    missingSlots,
    constraints,
    recognized,
  };
}

/**
 * Merges a follow-up turn into an existing goal (multi-turn convergence). Only
 * genuinely missing slots and explicit constraints may be filled; the outcome
 * and assets are never silently rewritten.
 */
export function mergeGoalTurn(input: { goal: MissionGoal; text: string }): MissionGoal {
  const { goal } = input;
  const nextAmount = goal.amount ?? extractExactAmount(input.text, goal.assetInSymbol);
  const extra = extractConstraints(input.text);
  const constraints: MissionConstraints = {
    maxSpend: goal.constraints.maxSpend ?? extra.maxSpend,
    maxSlippageBps: goal.constraints.maxSlippageBps ?? extra.maxSlippageBps,
    targetChainId: goal.constraints.targetChainId ?? extra.targetChainId,
    stakePortionPercent: goal.constraints.stakePortionPercent ?? extra.stakePortionPercent,
    neverBridge: goal.constraints.neverBridge || extra.neverBridge,
    noTokenSpend: goal.constraints.noTokenSpend || extra.noTokenSpend,
  };
  const missingSlots = goal.missingSlots.filter((s) => !(s === "amount" && nextAmount));
  return { ...goal, amount: nextAmount, constraints, missingSlots };
}

/** Stable identity of the economic substance of a goal — used to detect edits. */
export function goalSignature(goal: MissionGoal): string {
  return [
    goal.outcome,
    goal.chainId,
    goal.assetInSymbol ?? "-",
    goal.assetOutSymbol ?? "-",
    goal.amount ?? "-",
    goal.constraints.maxSpend ? `${goal.constraints.maxSpend.amount}${goal.constraints.maxSpend.symbol}` : "-",
    goal.constraints.maxSlippageBps ?? "-",
    goal.constraints.stakePortionPercent ?? "-",
    goal.constraints.neverBridge ? "no-bridge" : "-",
    goal.constraints.noTokenSpend ? "no-spend" : "-",
  ].join("|");
}
