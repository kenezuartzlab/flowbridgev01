import { describe, expect, it, vi } from "vitest";
import { CANARY_APPROVAL } from "./canaryPreparation";
import { boundedGasProposal, buildCanaryTicket, DEFAULT_TICKET_PARAMETERS } from "./canaryTicket";

const gas = { buy: 232718n, approve: 46976n, sell: 261448n, revoke: 26980n };
const q = { primaryUsdt6PerBot: 12_736_175n, secondaryUsdt6PerBot: 12_736_175n, fetchedAt: 1000, now: 1001, verified: true };
describe("bounded canary preparation only", () => {
  it("records gas/first-order preparation without gas/order/funding authorization", () => {
    expect(CANARY_APPROVAL).toMatchObject({ gasEstimationAuthorized: true, firstOrderPreparationAuthorized: true, gasApproved: false, orderAuthorized: false, fundingAuthorized: false, capUsdt6: 5_000_000n });
  });
  it("bounds four effects with ceiling-rounded 20% units and 2x fee", () => {
    const g = boundedGasProposal(gas, 20_000_000_000n, q.primaryUsdt6PerBot);
    expect(g.legs.map(l => l.maxUnits)).toEqual([279262n, 56372n, 313738n, 32376n]);
    expect(g.capWei).toBe(27_269_920_000_000_000n);
    expect(g.estimatedWei).toBe(11_362_440_000_000_000n);
    expect(g.contingencyWei).toBe(15_907_480_000_000_000n);
    expect(g.capUsdt6).toBe(347315n);
    expect(g.gasApproved).toBe(false);
  });
  it.each([0n, -1n])("rejects invalid fee %s", fee => expect(() => boundedGasProposal(gas, fee, q.primaryUsdt6PerBot)).toThrow("GAS_INPUT_INVALID"));
  it.each(["buy", "approve", "sell", "revoke"] as const)("requires exact %s estimate", effect => expect(() => boundedGasProposal({ ...gas, [effect]: 0n }, 1n, 1n)).toThrow());
  it("never selects prices and adds separate pending gas to total exposure", () => {
    const t = buildCanaryTicket(DEFAULT_TICKET_PARAMETERS, q, gas, 20_000_000_000n);
    expect(t.budgetWei).toBe(392_582_545_387_449_528n);
    expect(t.totalExposureWei).toBe(419_852_465_387_449_528n);
    expect(t.totalExposureUsdt6).toBe(5_347_315n);
    expect(t.missingParameters).toEqual(["MAX_BUY_PRICE", "MIN_SELL_PRICE"]);
    expect(t.maxBuyPrice).toBeNull(); expect(t.minSellPrice).toBeNull();
    expect(t).toMatchObject({ cycles: 1, executable: false, orderCreated: false, gasApproved: false, orderAuthorized: false });
  });
  it("preserves operator-entered targets but cannot authorize an order", () => {
    const t = buildCanaryTicket({ ...DEFAULT_TICKET_PARAMETERS, maxBuyPrice: "0.4", minSellPrice: "0.5", slippageBps: 25, expiresInMinutes: 15 }, q, gas, 1n);
    expect(t).toMatchObject({ maxBuyPrice: "0.4", minSellPrice: "0.5", priceUnit: "BOT per CA", slippageBps: 25, proposedOrderExpiresAt: 901001, quoteExpiresAt: 11000, gasProposalExpiresAt: 11000, missingParameters: [], executable: false });
  });
  it("rejects minimum sell below maximum buy", () => expect(() => buildCanaryTicket({ ...DEFAULT_TICKET_PARAMETERS, maxBuyPrice: "0.5", minSellPrice: "0.4" }, q, gas, 1n)).toThrow("SELL_BELOW_BUY"));
  it.each([0, 301, 1.5, NaN])("rejects invalid slippage %s", slippageBps => expect(() => buildCanaryTicket({ ...DEFAULT_TICKET_PARAMETERS, slippageBps }, q, gas, 1n)).toThrow("SLIPPAGE_INVALID"));
  it.each([0, 10081, 1.5, NaN])("rejects invalid expiry %s", expiresInMinutes => expect(() => buildCanaryTicket({ ...DEFAULT_TICKET_PARAMETERS, expiresInMinutes }, q, gas, 1n)).toThrow("EXPIRY_INVALID"));
  it("does not reuse expired conversion", () => expect(() => buildCanaryTicket(DEFAULT_TICKET_PARAMETERS, { ...q, now: 11001 }, gas, 1n)).toThrow("CAP_QUOTE_UNVERIFIED"));
});

vi.mock("./quotes.server", () => ({ quoteLeg: vi.fn() }));
import { quoteLeg } from "./quotes.server";
import { readCanaryPreparation } from "./preparation.server";
it("reads a serializable non-executable review ticket with all four gas effects", async () => {
  vi.mocked(quoteLeg).mockResolvedValue({ amountIn: 10n ** 18n, amountOut: q.primaryUsdt6PerBot, crossCheckOut: q.secondaryUsdt6PerBot, gasPriceWei: 20_000_000_000n, gasUnits: 0n, block: 31806419, headBlock: 31806419, fetchedAt: Date.now(), priceImpactBps: 0, route: { identityVerified: true } as never });
  const result = await readCanaryPreparation();
  expect(result.gasReserveBot).toBe("0.02726992");
  expect(result.gasReserveUsdt).toBe("0.347315");
  expect(result.totalExposureUsdt).toBe("5.347315");
  expect(result.gasEffects.map(l => l.effect)).toEqual(["buy", "approve", "sell", "revoke"]);
  expect(JSON.parse(JSON.stringify(result)).ticket).toMatchObject({ executable: false, orderCreated: false, maxBuyPrice: null });
});