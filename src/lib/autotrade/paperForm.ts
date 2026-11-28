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
    slippageBps: percentToBps(draft["slippagePercent"] ?? ""), maxGasNative: draft["maxGasNative"] ?? "", maxLoss: draft["maxLoss"] ?? "",
    expiresInMinutes: Number(draft["expiresInMinutes"]), repeat: false,
  });
  if (!body.success) throw new Error(`${body.error.issues[0]?.path.join(" ") ?? "Order"}: ${body.error.issues[0]?.message ?? "check the value"}`);
  orderFromPaperRequest(body.data, "validation-only", now, reviewedBudget ?? body.data.budget);
  return body.data;
}