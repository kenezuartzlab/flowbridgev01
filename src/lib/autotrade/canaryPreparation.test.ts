import { describe, expect, it } from "vitest";
import { CANARY_APPROVAL, convertCapToBot, estimateCanaryGas, secureServiceUrl, validateIndependentRpc } from "./canaryPreparation";
import { loadTradingSigner, SIGNER_POLICY } from "./signer";

const quote = { primaryUsdt6PerBot: 2_000_000n, secondaryUsdt6PerBot: 2_000_000n, fetchedAt: 1000, now: 1001, verified: true };
describe("owner canary approval boundaries", () => {
  it("approves exactly 5 USDT equivalent, CA/BOT and one cycle only", () => {
    expect(CANARY_APPROVAL).toMatchObject({ status: "APPROVED_CAP_ONLY", capUsdt6: 5_000_000n, pair: "CA/BOT", cycles: 1 });
    expect(SIGNER_POLICY.approvedCanaryCapUsdt).toBe(5);
  });
  it("does not approve gas, funding, order or provision a signer", () => {
    expect(CANARY_APPROVAL).toMatchObject({ gasApproved: false, orderAuthorized: false, fundingAuthorized: false });
    expect(loadTradingSigner()).toEqual({ status: "NOT_CONFIGURED", signer: null });
  });
  it("fresh 2 USDT/BOT valuation converts 5 USDT to exactly 2.5 BOT", () => expect(convertCapToBot(quote)).toBe(2_500_000_000_000_000_000n));
  it("higher of both verified valuations is used, with floor rounding", () => {
    const result = convertCapToBot({ ...quote, secondaryUsdt6PerBot: 2_001_000n });
    expect(result * 2_001_000n <= 5_000_000n * 10n ** 18n).toBe(true);
    expect((result + 1n) * 2_001_000n > 5_000_000n * 10n ** 18n).toBe(true);
  });
  it.each([{ now: 11_001 }, { now: 999 }, { verified: false }])("rejects stale/future/unverified conversion %j", patch => expect(() => convertCapToBot({ ...quote, ...patch })).toThrow("CAP_QUOTE_UNVERIFIED"));
  it("rejects price disagreement over 50 bps", () => expect(() => convertCapToBot({ ...quote, secondaryUsdt6PerBot: 2_100_000n })).toThrow("CAP_PRICE_DIVERGENCE"));
  it("rejects zero price", () => expect(() => convertCapToBot({ ...quote, primaryUsdt6PerBot: 0n })).toThrow("CAP_PRICE_INVALID"));
  it("gas reserve is separate and remains pending approval", () => {
    expect(estimateCanaryGas(1_000_000_000n, 300_000n, 350_000n)).toEqual({ reserveWei: 1_944_000_000_000_000n, units: 972_000n, approval: "PENDING_OWNER_APPROVAL", simulated: false });
  });
});
describe("independent infrastructure policy", () => {
  const c = { primaryUrl: "https://rpc.botchain.ai", secondaryUrl: "https://independent.example.org", primaryOperator: "BOT", secondaryOperator: "Independent", independenceReviewed: true, comparisonDays: 7, mismatches: 0, receiptParity: true };
  it("requires seven days, independent review and receipt parity", () => {
    expect(validateIndependentRpc(c)).toEqual([]);
    expect(validateIndependentRpc({ ...c, comparisonDays: 6, independenceReviewed: false, receiptParity: false })).toEqual(["RPC_INDEPENDENCE_UNREVIEWED", "RPC_EVIDENCE_INCOMPLETE"]);
  });
  it("different BOT hostnames do not prove independence", () => expect(validateIndependentRpc({ ...c, secondaryUrl: "https://scan.botchain.ai/api/eth-rpc" })).toContain("RPC_KNOWN_SAME_OPERATOR"));
  it("same operator or common-block mismatch blocks readiness", () => {
    expect(validateIndependentRpc({ ...c, secondaryOperator: "bot" })).toContain("RPC_SAME_OR_UNKNOWN_OPERATOR");
    expect(validateIndependentRpc({ ...c, mismatches: 1 })).toContain("RPC_EVIDENCE_INCOMPLETE");
  });
  it.each(["http://127.0.0.1", "https://localhost", "https://user:pass@node.example.org", "https://node.example.org?key=secret", "https://169.254.169.254"]) ("rejects unsafe service URL %s", url => expect(() => secureServiceUrl(url)).toThrow());
});