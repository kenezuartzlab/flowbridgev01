import { CANARY_APPROVAL, convertCapToBot } from "./canaryPreparation";
import { parsePrice } from "./engine";
import { GUARDS } from "./config";

export const EFFECTS = ["buy", "approve", "sell", "revoke"] as const;
export type GasFootprint = Record<typeof EFFECTS[number], bigint>;
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;

/** Exact simulated effects, bounded contingency; never grants gas authorization. */
export function boundedGasProposal(gas: GasFootprint, gasPriceWei: bigint, usdt6PerBot: bigint) {
  if (gasPriceWei <= 0n || usdt6PerBot <= 0n || EFFECTS.some(k => gas[k] <= 0n)) throw new Error("GAS_INPUT_INVALID");
  const legs = EFFECTS.map(effect => ({ effect, estimatedUnits: gas[effect], maxUnits: ceil(gas[effect] * 120n, 100n) }));
  const estimatedWei = legs.reduce((s, l) => s + l.estimatedUnits * gasPriceWei, 0n);
  const maxFeePerGas = gasPriceWei * 2n;
  const capWei = legs.reduce((s, l) => s + l.maxUnits * maxFeePerGas, 0n);
  return { legs, estimatedWei, maxFeePerGas, capWei, contingencyWei: capWei - estimatedWei,
    capUsdt6: ceil(capWei * usdt6PerBot, 10n ** 18n), gasApproved: false as const };
}

export interface TicketParameters { maxBuyPrice: string; minSellPrice: string; slippageBps: number; expiresInMinutes: number }
export const DEFAULT_TICKET_PARAMETERS: TicketParameters = { maxBuyPrice: "", minSellPrice: "", slippageBps: 50, expiresInMinutes: 60 };

export function buildCanaryTicket(p: TicketParameters, q: Parameters<typeof convertCapToBot>[0], gas: GasFootprint, gasPriceWei: bigint) {
  if (!Number.isInteger(p.slippageBps) || p.slippageBps < 1 || p.slippageBps > GUARDS.maxSlippageBps) throw new Error("SLIPPAGE_INVALID");
  if (!Number.isInteger(p.expiresInMinutes) || p.expiresInMinutes < 1 || p.expiresInMinutes * 60_000 > GUARDS.maxExpiryMs) throw new Error("EXPIRY_INVALID");
  const buy = p.maxBuyPrice.trim(), sell = p.minSellPrice.trim();
  const buyPrice = buy ? parsePrice(buy) : null, sellPrice = sell ? parsePrice(sell) : null;
  if (buyPrice && sellPrice && sellPrice.num * buyPrice.den < buyPrice.num * sellPrice.den) throw new Error("SELL_BELOW_BUY");
  const budgetWei = convertCapToBot(q);
  const price = q.primaryUsdt6PerBot > q.secondaryUsdt6PerBot ? q.primaryUsdt6PerBot : q.secondaryUsdt6PerBot;
  const proposal = boundedGasProposal(gas, gasPriceWei, price);
  return { status: "REVIEW_ONLY" as const, pair: CANARY_APPROVAL.pair, cycles: 1,
    budgetWei, tradeCapUsdt6: CANARY_APPROVAL.capUsdt6, gas: proposal,
    totalExposureWei: budgetWei + proposal.capWei, totalExposureUsdt6: CANARY_APPROVAL.capUsdt6 + proposal.capUsdt6,
    maxBuyPrice: buy || null, minSellPrice: sell || null, priceUnit: "BOT per CA", slippageBps: p.slippageBps,
    proposedOrderExpiresAt: q.now + p.expiresInMinutes * 60_000, quoteExpiresAt: q.fetchedAt + 10_000,
    gasProposalExpiresAt: q.fetchedAt + 10_000,
    missingParameters: [!buy ? "MAX_BUY_PRICE" : null, !sell ? "MIN_SELL_PRICE" : null].filter((v): v is string => v !== null),
    gasBasis: "LOCAL_FORK_FOOTPRINT_REVALUED; exact dedicated-account calldata simulation required",
    gasApproved: false, orderAuthorized: false, orderCreated: false, executable: false,
    blockers: ["EXACT_ACCOUNT_SIMULATION", "GAS_CAP_APPROVAL", "EXACT_ORDER_AUTHORIZATION", "INDEPENDENT_RPC", "MANAGED_SIGNER", "LIVE_STORE_BINDING", "SECURITY_REVIEW", "RELEASE_ACCEPTANCE", "LIVE_DISABLED"],
  };
}