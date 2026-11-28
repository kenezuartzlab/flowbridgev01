import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pairById, ROUTER_V4 } from "./config";
import { buildLegCall, outboxApply, planAmounts, type OutboxEntry } from "./executor";
import { accountHasOpenEffect, assertEffect, assertSignedMatches, assertTradingAccount, canaryBudgetCheck, fenceMayAdvance, preEffectGate, revokeOwed } from "./v12";

const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // public Anvil test key, never funded
const ME = acct.address.toLowerCase() as Hex;
const leg = buildLegCall(pairById("CA/USDT")!, "buy", planAmounts(5_000_000n, 1), 1n, ME, 9_999_999_999n);
const gate = { heldFencing: 4, currentFencing: 4, currentHolder: "h", holder: "h", leaseUntilMs: 100_000, nowMs: 50_000, emergencyPaused: false };

describe("V1.2 fencing and pause race before irreversible effects", () => {
  it("passes only with the held lease and no pause", () => expect(preEffectGate(gate)).toBeNull());
  it("pause flipped between plan and broadcast blocks the effect", () => expect(preEffectGate({ ...gate, emergencyPaused: true })).toBe("EMERGENCY_PAUSED"));
  it("a newer fencing token (takeover) blocks the old writer", () => expect(preEffectGate({ ...gate, currentFencing: 5 })).toBe("FENCE_LOST"));
  it("lease about to expire blocks starting an effect", () => expect(preEffectGate({ ...gate, nowMs: 98_500 })).toBe("LEASE_EXPIRING"));
  it("stale writer cannot advance a newer writer's outbox row", () => { expect(fenceMayAdvance(5, 4)).toBe(false); expect(fenceMayAdvance(4, 5)).toBe(true); expect(fenceMayAdvance(null, 9)).toBe(false); });
});

describe("V1.2 outbox: a stuck broadcast is never silently dropped", () => {
  const b: OutboxEntry = { idempotencyKey: "k", nonce: 3, state: "BROADCAST", txHash: "0x1", minedBlock: null, minedHash: null };
  it("timeout keeps BROADCAST (late inclusion must still be recorded)", () => expect(outboxApply(b, { type: "missing", afterMs: 10 * 3_600_000 }).state).toBe("BROADCAST"));
  it("late inclusion after a long wait is accepted", () => expect(outboxApply(outboxApply(b, { type: "missing", afterMs: 3_600_000 }), { type: "mined", block: 9, blockHash: "0xa", status: "success" }).state).toBe("MINED"));
  it("open effect blocks any new leg for the account", () => { expect(accountHasOpenEffect([{ state: "BROADCAST" }])).toBe(true); expect(accountHasOpenEffect([{ state: "FINAL" }, { state: "REPLACED" }])).toBe(false); });
});

describe("V1.2 approval/revoke including failure paths", () => {
  const approve = { to: leg.approval!.token, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ROUTER_V4 as Hex, leg.approval!.amount] }) };
  const revoke = { ...approve, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ROUTER_V4 as Hex, 0n] }) };
  it("exact approve and revoke to Router V4 pass", () => { expect(() => assertEffect("approve", approve, leg)).not.toThrow(); expect(() => assertEffect("revoke", revoke, leg)).not.toThrow(); });
  it("unlimited approval rejected", () => expect(() => assertEffect("approve", { ...approve, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ROUTER_V4 as Hex, 2n ** 256n - 1n] }) }, leg)).toThrow("APPROVE_AMOUNT"));
  it("malicious spender rejected", () => expect(() => assertEffect("approve", { ...approve, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ME, leg.approval!.amount] }) }, leg)).toThrow("APPROVE_SPENDER"));
  it("approve on a different (malicious) token rejected", () => expect(() => assertEffect("approve", { ...approve, to: "0x000000000000000000000000000000000000dead" }, leg)).toThrow("APPROVE_TOKEN"));
  it("transfer() disguised as approval rejected", () => expect(() => assertEffect("approve", { ...approve, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ROUTER_V4 as Hex, 1n] }) }, leg)).toThrow("APPROVE_SELECTOR"));
  it("arbitrary DEX target rejected for leg", () => expect(() => assertEffect("leg", { to: "0x000000000000000000000000000000000000beef", data: leg.data, value: 0n }, leg)).toThrow("TARGET_NOT_ALLOWED"));
  for (const outcome of ["REVERTED", "REPLACED", "BROADCAST"] as const)
    it(`revoke still owed when the leg is ${outcome}`, () => expect(revokeOwed([{ side: "approve", state: "FINAL" }, { side: "buy", state: outcome }])).toBe(true));
  it("revoke not owed once a revoke is final", () => expect(revokeOwed([{ side: "approve", state: "FINAL" }, { side: "revoke", state: "FINAL" }])).toBe(false));
});

describe("V1.2 signer transport mocks", () => {
  const want = { to: leg.to, data: leg.data, value: 0n, nonce: 7, gas: 400_000n, maxFeePerGas: 2_000_000_000n };
  const sign = (o: Partial<typeof want> & { chainId?: number }) => acct.signTransaction({ chainId: 677, type: "eip1559", maxPriorityFeePerGas: 1n, ...want, ...o } as any);
  it("honest transport passes (resolved)", async () => { const raw = await sign({}); expect(() => assertSignedMatches(raw, want)).not.toThrow(); });
  const cases: [string, any, string][] = [["to", { to: "0x000000000000000000000000000000000000beef" }, "SIGNED_TO"], ["data", { data: "0x00" }, "SIGNED_DATA"], ["value", { value: 1n }, "SIGNED_VALUE"], ["nonce", { nonce: 8 }, "SIGNED_NONCE"], ["gas", { gas: 900_000n }, "SIGNED_GAS"], ["fee", { maxFeePerGas: 9_000_000_000n }, "SIGNED_FEE"], ["chain", { chainId: 1 }, "SIGNED_CHAIN"]];
  for (const [n, o, err] of cases) it(`substituted ${n} is rejected`, async () => { const raw = await sign(o); expect(() => assertSignedMatches(raw, want)).toThrow(err); });
});

describe("V1.2 dedicated account and canary cap", () => {
  const reg = [{ address: ME, status: "authorized" }];
  it("dedicated account passes", () => expect(() => assertTradingAccount(ME, reg, [])).not.toThrow());
  it("treasury/owner/rewards wallet rejected even if registered", () => expect(() => assertTradingAccount(ME, reg, [ME.toUpperCase().replace("0X", "0x")])).toThrow("PRIVILEGED_WALLET"));
  it("other account rejected", () => expect(() => assertTradingAccount("0x00000000000000000000000000000000000000aa", reg, [])).toThrow("NOT_THE_DEDICATED_ACCOUNT"));
  it("two authorized accounts rejected", () => expect(() => assertTradingAccount(ME, [...reg, { address: "0x01", status: "authorized" }], [])).toThrow());
  const base = { budgetUsdt6: 5_000_000n, quoteAgeMs: 1_000, quoteVerified: true, nativeBalanceWei: 10n ** 18n, gasReserveWei: 4n * 10n ** 15n, worstCaseGasWei: 10n ** 15n, legsRemaining: 4, spendIsNative: true, spendWei: 5n * 10n ** 17n };
  it("5 USDT-equivalent with reserve passes", () => expect(canaryBudgetCheck(base)).toBeNull());
  it("5.000001 USDT rejected", () => expect(canaryBudgetCheck({ ...base, budgetUsdt6: 5_000_001n })).toBe("CAP_EXCEEDED"));
  it("unverified or stale quote rejected", () => { expect(canaryBudgetCheck({ ...base, quoteVerified: false })).toBe("CAP_QUOTE_UNVERIFIED"); expect(canaryBudgetCheck({ ...base, quoteAgeMs: 10_001 })).toBe("CAP_QUOTE_UNVERIFIED"); });
  it("gas reserve must cover all remaining legs", () => expect(canaryBudgetCheck({ ...base, legsRemaining: 5 })).toBe("GAS_RESERVE_TOO_SMALL"));
  it("native spend cannot eat the gas reserve", () => expect(canaryBudgetCheck({ ...base, nativeBalanceWei: 5n * 10n ** 17n })).toBe("NATIVE_BALANCE_BELOW_SPEND_PLUS_RESERVE"));
});
