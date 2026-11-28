import { formatUnits } from "viem";
import { CANARY_APPROVAL } from "./canaryPreparation";
import { buildCanaryTicket, DEFAULT_TICKET_PARAMETERS, type TicketParameters } from "./canaryTicket";
import evidence from "./canaryGasEvidence.generated.json";
import { pairById } from "./config";
import { quoteLeg } from "./quotes.server";

/** Authenticated caller only. Read-only estimate, never writes an order or loads a signer. */
export async function readCanaryPreparation(parameters: TicketParameters = DEFAULT_TICKET_PARAMETERS) {
  const p = pairById("BOT/USDT");
  if (!p) throw new Error("CAP_PAIR_MISSING");
  const q = await quoteLeg(p, "sell", 10n ** 18n);
  const ticket = buildCanaryTicket(parameters, { primaryUsdt6PerBot: q.amountOut, secondaryUsdt6PerBot: q.crossCheckOut ?? 0n, fetchedAt: q.fetchedAt, now: Date.now(), verified: !!q.route?.identityVerified && q.crossCheckOut !== null }, {
    buy: BigInt(evidence.gasFootprint.buy), approve: BigInt(evidence.gasFootprint.approve),
    sell: BigInt(evidence.gasFootprint.sell), revoke: BigInt(evidence.gasFootprint.revoke),
  }, q.gasPriceWei);
  return {
    status: CANARY_APPROVAL.status, capUsdt: "5", pair: CANARY_APPROVAL.pair, cycles: 1,
    indicativeBot: formatUnits(ticket.budgetWei, 18), gasReserveBot: formatUnits(ticket.gas.capWei, 18),
    gasReserveUsdt: formatUnits(ticket.gas.capUsdt6, 6), totalExposureBot: formatUnits(ticket.totalExposureWei, 18),
    totalExposureUsdt: formatUnits(ticket.totalExposureUsdt6, 6),
    gasApproval: "PENDING_OWNER_APPROVAL", gasEstimateBasis: ticket.gasBasis,
    gasEffects: ticket.gas.legs.map(l => ({ effect: l.effect, estimatedUnits: l.estimatedUnits.toString(), maxUnits: l.maxUnits.toString() })),
    maxFeeGwei: formatUnits(ticket.gas.maxFeePerGas, 9), gasContingency: "20% units (ceiling) per effect; 2x observed fee; no retries included",
    gasFootprintObservedAt: evidence.observedAt, gasFootprintBlock: evidence.block,
    ticket: { ...ticket, budgetWei: ticket.budgetWei.toString(), tradeCapUsdt6: ticket.tradeCapUsdt6.toString(), gas: undefined,
      totalExposureWei: ticket.totalExposureWei.toString(), totalExposureUsdt6: ticket.totalExposureUsdt6.toString() },
    block: q.block, fetchedAt: q.fetchedAt, expiresAt: q.fetchedAt + 10_000,
    executable: false, independentRpcVerified: false, orderCreated: false,
  };
}