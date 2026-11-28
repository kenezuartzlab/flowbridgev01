import { z } from "zod";
import { formatUnits, parseUnits } from "viem";
import { pairById } from "./config";
import { newOrder, parsePrice } from "./engine";

const decimal = z.string().trim().max(64).regex(/^\d+(\.\d+)?$/, "Enter a decimal number, without commas or exponent notation.");
export const paperCreateBody = z.object({
  action: z.literal("create"), requestId: z.string().uuid().optional(),
  pair: z.enum(["CA/BOT", "CA/USDT", "BOT/USDT", "FLOW/USDT"]),
  budget: decimal, budgetUnit: z.enum(["QUOTE", "USDT_EQUIVALENT"]).default("QUOTE"), reviewedBudget: decimal.optional(),
  maxBuyPrice: decimal, minSellPrice: decimal, stopPrice: decimal.optional(),
  slippageBps: z.number().int().min(1).max(300), maxGasNative: decimal, maxLoss: decimal,
  expiresInMinutes: z.number().int().min(1).max(10080), repeat: z.literal(false).default(false),
});
export type PaperCreateBody = z.infer<typeof paperCreateBody>;
export interface PaperReference { pair: string; price: string; inverse: string; usdtPerBot: string | null; fetchedAt: number; expiresAt: number; block: number }
export type PaperDraft = Record<string, string>;

/** Never let viem round excess precision into a different reviewed order. */
export function exactUnits(value: string, decimals: number, label: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(value.trim()) || (value.split(".")[1]?.length ?? 0) > decimals) throw new Error(`${label}: enter a decimal with at most ${decimals} decimal places.`);
  return parseUnits(value.trim(), decimals);
}
export function percentToBps(value: string): number {
  const bps = exactUnits(value, 2, "Slippage (%)");
  if (bps < 1n || bps > 300n) throw new Error("Slippage must be between 0.01% and 3%.");
  return Number(bps);
}
export function equivalentBudget(usdt: string, usdtPerBot: string): string {
  const amount = exactUnits(usdt, 6, "USDT-equivalent budget");
  const rate = exactUnits(usdtPerBot, 6, "Reference rate");
  if (rate <= 0n) throw new Error("Reference price unavailable. Refresh the reference.");
  return formatUnits(amount * 10n ** 18n / rate, 18);
}
export function budgetEquivalent(bot: string, usdtPerBot: string): string {
  return formatUnits(exactUnits(bot, 18, "Budget") * exactUnits(usdtPerBot, 6, "Reference rate") / 10n ** 18n, 6);
}
const errors: Record<string, string> = {
  BUDGET: "Budget must be greater than zero.", INVALID_PRICE: "Buy, sell and optional stop prices must be positive decimals (up to 18 places).",
  LIMITS: "Gas must be greater than zero. Max loss must be between zero and the budget, in the same quote currency.",
  SELL_BELOW_BUY: "Sell target must be at or above the buy target.", STOP_ABOVE_BUY: "Stop price must be below the buy target.",
  EXPIRY: "Expiry must be between 1 and 10,080 minutes.", SLIPPAGE: "Slippage must be between 0.01% and 3%.",
};
export function orderFromPaperRequest(body: PaperCreateBody, id: string, now: number, budget = body.budget) {
  const pair = pairById(body.pair);
  if (!pair) throw new Error("Select a supported pair.");
  try {
    return newOrder(id, { pair, mode: "paper", budgetQuote: exactUnits(budget, pair.quote.decimals, "Budget"),
      maxBuyPrice: parsePrice(body.maxBuyPrice), minSellPrice: parsePrice(body.minSellPrice), stopPrice: body.stopPrice ? parsePrice(body.stopPrice) : null,
      slippageBps: body.slippageBps, maxGasWeiPerLeg: exactUnits(body.maxGasNative, 18, "Gas (BOT)"), maxLossQuote: exactUnits(body.maxLoss, pair.quote.decimals, "Max loss"),
      expiresAt: now + body.expiresInMinutes * 60_000, repeat: false,
    }, now);
  } catch (error) { throw new Error(error instanceof Error ? errors[error.message] ?? error.message : "Check your order parameters."); }
}
/** Simulation-only starting values. Prices are never defaulted. */
export const PAPER_DEFAULTS = { slippagePercent: "0.5", expiresInMinutes: "60", maxGasNative: "0.01" } as const;
export function initialPaperDraft(pair = "CA/BOT"): PaperDraft {
  return { pair, budgetUnit: "QUOTE", budget: "", maxBuyPrice: "", minSellPrice: "", stopPrice: "", maxLoss: "", ...PAPER_DEFAULTS };
}
export type PaperField = "budget" | "maxBuyPrice" | "minSellPrice" | "stopPrice" | "slippagePercent" | "maxGasNative" | "maxLoss" | "expiresInMinutes";
const positiveUnits = (value: string, decimals: number, label: string): bigint => {
  const units = exactUnits(value, decimals, label);
  if (units <= 0n) throw new Error(`${label}: must be greater than zero.`);
  return units;
};
const message = (e: unknown) => (e instanceof Error ? e.message.replace(/^[^:]+: /, "") : "Check this value.");
/** Every blocking problem, keyed by field, so the form can show them all inline. */
export function paperFieldErrors(draft: PaperDraft, reference: PaperReference | null, now: number): Partial<Record<PaperField, string>> {
  const out: Partial<Record<PaperField, string>> = {};
  const pair = pairById(draft["pair"] ?? "");
  if (!pair) return { budget: "Select a supported pair." };
  const v = (k: PaperField) => (draft[k] ?? "").trim();
  const usdt = draft["budgetUnit"] === "USDT_EQUIVALENT";
  let budget: bigint | null = null;
  if (!v("budget")) out.budget = "Enter a budget.";
  else try {
    if (usdt) {
      positiveUnits(v("budget"), 6, "Budget");
      if (pair.quote.symbol !== "BOT") out.budget = "USDT equivalent is only available for BOT budgets.";
      else if (!reference?.usdtPerBot || reference.pair !== pair.id || reference.expiresAt <= now) out.budget = "Refresh the reference to convert USDT to BOT, or switch Budget entry to BOT.";
      else budget = exactUnits(equivalentBudget(v("budget"), reference.usdtPerBot), 18, "Budget");
    } else budget = positiveUnits(v("budget"), pair.quote.decimals, "Budget");
  } catch (e) { out.budget = message(e); }
  let buy: bigint | null = null, sell: bigint | null = null;
  if (!v("maxBuyPrice")) out.maxBuyPrice = "Enter your buy target; no price is chosen for you.";
  else try { buy = positiveUnits(v("maxBuyPrice"), 18, "Buy target"); } catch (e) { out.maxBuyPrice = message(e); }
  if (!v("minSellPrice")) out.minSellPrice = "Enter your sell target; no price is chosen for you.";
  else try { sell = positiveUnits(v("minSellPrice"), 18, "Sell target"); } catch (e) { out.minSellPrice = message(e); }
  if (buy !== null && sell !== null && sell < buy) out.minSellPrice = "Sell target must be at or above the buy target.";
  if (v("stopPrice")) {
    try {
      const stop = exactUnits(v("stopPrice"), 18, "Stop");
      if (stop <= 0n) out.stopPrice = "Leave blank for no stop, or enter a positive price below the buy target.";
      else if (buy !== null && stop >= buy) out.stopPrice = "Stop must be below the buy target.";
    } catch (e) { out.stopPrice = message(e); }
  }
  try { percentToBps(v("slippagePercent")); } catch (e) { out.slippagePercent = v("slippagePercent") ? message(e) : "Enter slippage between 0.01% and 3% (0.5% suggested)."; }
  if (!v("maxGasNative")) out.maxGasNative = "Enter a simulated gas limit per leg in BOT.";
  else try { positiveUnits(v("maxGasNative"), 18, "Gas"); } catch (e) { out.maxGasNative = message(e); }
  if (v("maxLoss")) {
    try {
      const loss = exactUnits(v("maxLoss"), pair.quote.decimals, "Max loss");
      if (budget !== null && loss > budget) out.maxLoss = `Max loss cannot exceed the budget (${formatUnits(budget, pair.quote.decimals)} ${pair.quote.symbol}).`;
    } catch (e) { out.maxLoss = message(e); }
  }
  const expiry = v("expiresInMinutes");
  if (!/^\d+$/.test(expiry) || Number(expiry) < 1 || Number(expiry) > 10080) out.expiresInMinutes = "Enter whole minutes from 1 to 10,080 (60 suggested).";
  return out;
}
export function buildPaperRequest(draft: PaperDraft, reference: PaperReference | null, now: number): PaperCreateBody {
  const pair = pairById(draft["pair"] ?? "");
  if (!pair) throw new Error("Select a supported pair.");
  const budgetUnit = draft["budgetUnit"] === "USDT_EQUIVALENT" ? "USDT_EQUIVALENT" : "QUOTE";
  let reviewedBudget: string | undefined;
  if (budgetUnit === "USDT_EQUIVALENT") {
    if (pair.quote.symbol !== "BOT") throw new Error("USDT equivalent is only available for BOT budgets.");
    if (!reference?.usdtPerBot || reference.pair !== pair.id || reference.expiresAt <= now) throw new Error("Refresh the reference price before reviewing a USDT-equivalent budget.");
    reviewedBudget = equivalentBudget(draft["budget"] ?? "", reference.usdtPerBot);
  }
  const body = paperCreateBody.safeParse({ action: "create", pair: pair.id, budget: draft["budget"] ?? "", budgetUnit,
    ...(reviewedBudget ? { reviewedBudget } : {}), maxBuyPrice: draft["maxBuyPrice"] ?? "", minSellPrice: draft["minSellPrice"] ?? "",
    ...(draft["stopPrice"]?.trim() ? { stopPrice: draft["stopPrice"] } : {}),
    slippageBps: percentToBps(draft["slippagePercent"] ?? ""), maxGasNative: draft["maxGasNative"] ?? "",
    // Blank max loss means the worst case is the whole budget, stated on review.
    maxLoss: draft["maxLoss"]?.trim() ? draft["maxLoss"] : (reviewedBudget ?? draft["budget"] ?? ""),
    expiresInMinutes: Number(draft["expiresInMinutes"]), repeat: false,
  });
  if (!body.success) throw new Error(`${body.error.issues[0]?.path.join(" ") ?? "Order"}: ${body.error.issues[0]?.message ?? "check the value"}`);
  orderFromPaperRequest(body.data, "validation-only", now, reviewedBudget ?? body.data.budget);
  return body.data;
}