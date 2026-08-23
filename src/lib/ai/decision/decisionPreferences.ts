/**
 * FlowBridge V22 §3/§6 — opt-in preference SIGNAL extraction.
 *
 * Memory can express *shape* preferences ("I prefer staking", "fewer steps").
 * It can never express economics: any memory entry that looks like an amount,
 * price, slippage, contract, token quantity or fee is IGNORED and reported as
 * ignored, so a stored sentence can never become a transaction parameter.
 */
import { EMPTY_PREFERENCES, type DecisionPreferences } from "./decisionTypes";

const ECONOMIC_PATTERN =
  /(amount|qty|quantity|balance|price|slippage|gas|fee|limit|cap|contract|address|0x[0-9a-f]{6,}|\d+(\.\d+)?\s*(flow|usdt|bot|bnb|ca|pts|xp)\b|\b\d{2,}\b)/i;

const OPT_IN_KEYS = /^(pref|preference|prefers|goal_style|interaction)\b/i;

export function extractDecisionPreferences(
  entries: readonly { key: string; value: string }[],
): DecisionPreferences {
  const used: string[] = [];
  const ignored: string[] = [];
  let prefersStaking = false;
  let prefersRewards = false;
  let prefersLowInteraction = false;

  for (const entry of entries) {
    const key = entry.key ?? "";
    const value = entry.value ?? "";
    if (!OPT_IN_KEYS.test(key)) continue;

    if (ECONOMIC_PATTERN.test(value) || ECONOMIC_PATTERN.test(key)) {
      ignored.push(key);
      continue;
    }

    const text = `${key} ${value}`.toLowerCase();
    let matched = false;
    if (/\bstak(e|ing)\b/.test(text)) {
      prefersStaking = true;
      matched = true;
    }
    if (/\b(reward|claim|flow points|pts)\b/.test(text)) {
      prefersRewards = true;
      matched = true;
    }
    if (/(low[- ]interaction|fewer steps|minimal steps|less clicking|simple)/.test(text)) {
      prefersLowInteraction = true;
      matched = true;
    }
    if (matched) used.push(key);
  }

  if (used.length === 0 && ignored.length === 0) return EMPTY_PREFERENCES;

  return {
    optedIn: used.length > 0,
    prefersStaking,
    prefersRewards,
    prefersLowInteraction,
    usedKeys: used,
    ignoredEconomicKeys: ignored,
  };
}
