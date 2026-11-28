import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Hex } from "viem";
import { FLOW_BRIDGE_ROUTER_V4_GENERATED_ABI as V4 } from "@/lib/flowbridge/routerV4Abi.generated";
import { buildLegCall, planAmounts } from "./executor";
import { pairById, ROUTER_V4, TOKENS } from "./config";
import { canaryReceiptOutput, createManagedRpcConnector } from "./managedRpc.server";
import type { ManagedEffectRequest } from "./liveTransport";

const account = "0x0000000000000000000000000000000000000677" as Hex;
const hash = `0x${"ab".repeat(32)}` as Hex;
const blockHash = `0x${"cd".repeat(32)}` as Hex;
const pair = pairById("CA/BOT"); if (!pair) throw new Error("PAIR");
const plan = planAmounts(10n ** 18n, 1);
const config = { primaryUrl: "https://rpc.botchain.ai", secondaryUrl: "https://independent.example.org", primaryOperator: "BOT", secondaryOperator: "Other", independenceReviewed: true, comparisonDays: 7, mismatches: 0, receiptParity: true };
const receiptFixture = (side: "buy" | "sell") => {
  const leg = buildLegCall(pair, side, plan, 100n, account, 9999999999n);
  const request: ManagedEffectRequest = { key: side, orderId: "fixture", account, side, call: leg, leg, gas: 400000n, maxFeePerGas: 1n, maxGasWei: 400000n, routeGuard: { verified: true, registered: true, quoteOnly: false, externalFeeBps: 0, feeMutable: false } };
  const zero = "0x0000000000000000000000000000000000000000" as Hex;
  const topics = encodeEventTopics({ abi: V4, eventName: "SwapActivity", args: { sender: account, recipient: account, routerId: 0n } });
  const data = encodeAbiParameters(parseAbiParameters("address,address,uint256,uint256,uint256"), [side === "buy" ? zero : TOKENS.CA.address as Hex, side === "buy" ? TOKENS.CA.address as Hex : zero, plan.swapAmount, 123n, plan.fee]);
  const receipt = { transactionHash: hash, blockHash, blockNumber: "0x60" as Hex, from: account, to: leg.to, status: "0x1" as Hex, logs: [{ address: ROUTER_V4, topics: topics as Hex[], data }] };
  return { request, receipt };
};
describe("independent RPC and actual receipt outputs", () => {
  it.each(["buy", "sell"] as const)("reads %s output from the exact canonical Router event", side => {
    const f = receiptFixture(side); expect(canaryReceiptOutput(f.receipt, f.request)).toBe(123n);
  });
  it("rejects duplicate or absent output events", () => {
    const f = receiptFixture("sell");
    expect(() => canaryReceiptOutput({ ...f.receipt, logs: [] }, f.request)).toThrow("RECEIPT_EVENT_MISSING_OR_DUPLICATE");
    expect(() => canaryReceiptOutput({ ...f.receipt, logs: [...f.receipt.logs, ...f.receipt.logs] }, f.request)).toThrow("RECEIPT_EVENT_MISSING_OR_DUPLICATE");
  });
  it("source lock denies broadcast before any RPC call", async () => {
    const send = vi.fn<typeof fetch>();
    await expect(createManagedRpcConnector(config, send).broadcast("0x00")).rejects.toThrow("LIVE_DISABLED");
    expect(send).not.toHaveBeenCalled();
  });
  it("different operators must actually agree on the common block", async () => {
    const send = vi.fn<typeof fetch>(async (input, init) => {
      const b = JSON.parse(String(init?.body));
      const result = b.method === "eth_chainId" ? "0x2a5" : b.method === "eth_blockNumber" ? "0x64" : { hash: String(input).includes("independent") ? hash : blockHash, timestamp: `0x${Math.floor(Date.now()/1000).toString(16)}` };
      return Response.json({ result });
    });
    await expect(createManagedRpcConnector(config, send).consensus()).rejects.toThrow("RPC_HASH_DIVERGENCE");
  });
  it("receipts match, canonical block matches and six confirmations are required", async () => {
    const f = receiptFixture("sell");
    const send = vi.fn<typeof fetch>(async (_input, init) => {
      const b = JSON.parse(String(init?.body));
      const result = b.method === "eth_chainId" ? "0x2a5" : b.method === "eth_blockNumber" ? "0x65" : b.method === "eth_getTransactionReceipt" ? f.receipt : { hash: blockHash, timestamp: `0x${Math.floor(Date.now()/1000).toString(16)}` };
      return Response.json({ result });
    });
    expect(await createManagedRpcConnector(config, send).receipt(hash, f.request)).toEqual({ final: true, status: "success", actualOut: 123n, blockNumber: 96n, blockHash });
  });
});