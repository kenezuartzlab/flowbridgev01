import { formatUnits } from "viem";
import { pairById } from "./config";
import { splitRouterFee } from "./engine";
import { ROUTER_V4_FEE_BPS_BDEX_V3 } from "./config";
import { quoteLeg } from "./quotes.server";
import type { PaperReference } from "./paperForm";

/** Indicative net sell reference, not a target, order or independence attestation. */
export async function readPaperReference(pairId: string): Promise<PaperReference> {
  const pair = pairById(pairId), bot = pairById("BOT/USDT");
  if (!pair || !bot) throw new Error("Select a supported pair.");
  const unit = 10n ** BigInt(pair.base.decimals);
  const [quote, rate] = await Promise.all([
    quoteLeg(pair, "sell", splitRouterFee(unit, ROUTER_V4_FEE_BPS_BDEX_V3).swapAmount),
    pair.quote.symbol === "BOT" ? quoteLeg(bot, "sell", splitRouterFee(10n ** 18n, ROUTER_V4_FEE_BPS_BDEX_V3).swapAmount) : Promise.resolve(null),
  ]);
  if (quote.amountOut <= 0n || (rate && rate.amountOut <= 0n)) throw new Error("Reference unavailable.");
  const fetchedAt = Math.min(quote.fetchedAt, rate?.fetchedAt ?? quote.fetchedAt);
  return { pair: pair.id, price: formatUnits(quote.amountOut, pair.quote.decimals),
    inverse: formatUnits(10n ** BigInt(pair.quote.decimals + 18) / quote.amountOut, 18),
    usdtPerBot: rate ? formatUnits(rate.amountOut, 6) : null, fetchedAt, expiresAt: fetchedAt + 15_000, block: quote.block };
}