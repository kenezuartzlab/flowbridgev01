import { formatUnits } from "viem";
import { CANARY_APPROVAL, convertCapToBot, estimateCanaryGas } from "./canaryPreparation";
import { pairById } from "./config";
import { quoteLeg } from "./quotes.server";

/** Authenticated caller only. Read-only estimate, never writes an order or loads a signer. */
export async function readCanaryPreparation() {
  const p = pairById("BOT/USDT");
  if (!p) throw new Error("CAP_PAIR_MISSING");
  const q = await quoteLeg(p, "sell", 10n ** 18n);
  const estimate = estimateCanaryGas(q.gasPriceWei, q.gasUnits, q.gasUnits);
  const botWei = convertCapToBot({ primaryUsdt6PerBot: q.amountOut, secondaryUsdt6PerBot: q.crossCheckOut ?? 0n, fetchedAt: q.fetchedAt, now: Date.now(), verified: !!q.route?.identityVerified && q.crossCheckOut !== null });
  return {
    status: CANARY_APPROVAL.status, capUsdt: "5", pair: CANARY_APPROVAL.pair, cycles: 1,
    indicativeBot: formatUnits(botWei, 18), gasReserveBot: formatUnits(estimate.reserveWei, 18),
    gasApproval: estimate.approval, gasEstimateBasis: "BOT/USDT quote gas proxy; exact CA/BOT simulation required once account and order exist",
    block: q.block, fetchedAt: q.fetchedAt, expiresAt: q.fetchedAt + 10_000,
    executable: false, independentRpcVerified: false, orderCreated: false,
  };
}