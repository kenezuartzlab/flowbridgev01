import { describe, expect, it } from "vitest";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { CA_WBOT_BDEX_V3_POOL, type ComparedRoute } from "@/lib/swap/routeComparison";
import { newOrder, parsePrice, splitRouterFee, type Order, type Quote } from "./engine";
import { pairById, ROUTER_V4 } from "./config";
import { legTokens } from "./path";
import {
  MockPaperTransport,
  processTransportedPaperOrder,
  type PaperEffect,
  type PaperExecutionStore,
  type PaperReceipt,
  type PaperTransport,
} from "./paperExecutor";

class MemoryStore implements PaperExecutionStore {
  readonly rows = new Map<string, PaperEffect>();
  readonly orders = new Map<string, Order>();
  paused = false;
  nonce = 0;
  async reserve(args: Parameters<PaperExecutionStore["reserve"]>[0]) {
    if (this.paused) throw new Error("EMERGENCY_PAUSED");
    const existing = this.rows.get(args.key);
    if (existing) return existing;
    if ([...this.rows.values()].some((e) => ["RESERVED", "SIGNED", "BROADCAST", "MINED"].includes(e.state))) throw new Error("OPEN_EFFECT");
    const row: PaperEffect = {
      key: args.key, parentKey: args.parentKey, side: args.side, nonce: this.nonce++, state: "RESERVED",
      txHash: null, signedRaw: null, minedBlock: null, minedHash: null, storedCall: args.storedCall, fencing: args.lease.fencing,
    };
    this.rows.set(args.key, row);
    return row;
  }
  async advance(args: Parameters<PaperExecutionStore["advance"]>[0]) {
    if (args.requireUnpaused && this.paused) throw new Error("EMERGENCY_PAUSED");
    if (args.lease.fencing < args.effect.fencing) throw new Error("FENCE_LOST");
    const current = this.rows.get(args.effect.key)!;
    const next = args.patch.state ?? current.state;
    const legal = next === current.state
      || (current.state === "RESERVED" && next === "SIGNED")
      || (current.state === "SIGNED" && next === "BROADCAST")
      || (current.state === "BROADCAST" && ["MINED", "REVERTED", "REPLACED"].includes(next))
      || (current.state === "MINED" && ["FINAL", "BROADCAST"].includes(next));
    if (!legal) throw new Error(`ILLEGAL:${current.state}->${next}`);
    this.rows.set(current.key, { ...current, ...args.patch });
    if (args.nextOrder) {
      expect(args.nextOrder.version).toBe(args.order.version + 1);
      this.orders.set(args.order.id, args.nextOrder);
    }
  }
  async effects(orderId: string) {
    void orderId;
    return [...this.rows.values()];
  }
}

function route(order: Order, side: "buy" | "sell", amountIn: bigint, amountOut: bigint, patch: Partial<ComparedRoute> = {}): ComparedRoute {
  return {
    key: `bdex:${order.spec.pair.id}:${side}`, venue: "BDEX V3", executionClass: "REGISTERED_EXECUTABLE", routerId: 0,
    router: M.bdexV3Router.toLowerCase(), factory: M.bdexV3Factory.toLowerCase(), pool: CA_WBOT_BDEX_V3_POOL.toLowerCase(),
    wrappedNative: M.wbot.toLowerCase(), caller: ROUTER_V4.toLowerCase(), path: legTokens(order.spec.pair, side).map((a) => a.toLowerCase()),
    amountIn, amountOut, gasUnits: 100n, gasPriceWei: 1n, gasCostInOutput: null, priceImpactBps: 10,
    externalDirectionalFeeBps: 0, feeMutable: false, registered: true, identityVerified: true, wrapperVerified: true,
    feeVerified: true, liquidityVerified: true, approvalVerified: true, block: 100, rejections: [], ...patch,
  };
}
function quote(order: Order, side: "buy" | "sell", amountOut: bigint, patch: Partial<ComparedRoute> = {}): Quote {
  const total = side === "buy" ? order.spec.budgetQuote : order.acquiredBase;
  const amountIn = splitRouterFee(total, 1).swapAmount;
  return {
    amountIn, amountOut, block: 100, headBlock: 100, fetchedAt: Date.now(), crossCheckOut: amountOut,
    priceImpactBps: 10, gasUnits: 100n, gasPriceWei: 1n, route: route(order, side, amountIn, amountOut, patch), quoteOnlyAlternatives: [],
  };
}
function order(pairId: string): Order {
  const pair = pairById(pairId)!;
  const unit = 10n ** BigInt(pair.quote.decimals);
  return newOrder(crypto.randomUUID(), {
    pair, mode: "paper", budgetQuote: unit, maxBuyPrice: parsePrice("1"), minSellPrice: parsePrice("1"), stopPrice: null,
    slippageBps: 100, maxGasWeiPerLeg: 1_000_000_000_000_000n, maxLossQuote: 0n,
    expiresAt: Date.now() + 60_000, repeat: false,
  }, Date.now());
}
const lease = { holder: crypto.randomUUID(), fencing: 1, leaseUntilMs: Date.now() + 60_000 };
const baseUnit = (o: Order) => 10n ** BigInt(o.spec.pair.base.decimals);
const quoteUnit = (o: Order) => 10n ** BigInt(o.spec.pair.quote.decimals);

describe("AutoTrade V1.3 worker → paper executor transport", () => {
  it("runs CA/BOT buy then sell with exact outbox nonces and no duplicate fill", async () => {
    const store = new MemoryStore(); const transport = new MockPaperTransport(); let o = order("CA/BOT"); store.orders.set(o.id, o);
    const buy = await processTransportedPaperOrder({ order: o, quote: quote(o, "buy", 2n * baseUnit(o)), now: Date.now(), store, transport, lease });
    o = buy.order;
    expect(o.state).toBe("HOLDING"); expect(o.acquiredBase).toBe(2n * baseUnit(o));
    const sell = await processTransportedPaperOrder({ order: o, quote: quote(o, "sell", 2n * quoteUnit(o)), now: Date.now(), store, transport, lease });
    o = sell.order;
    expect(o.state).toBe("COMPLETED"); expect(o.proceedsQuote).toBe(2n * quoteUnit(o));
    expect([...store.rows.values()].map((e) => e.side)).toEqual(["buy", "approve", "sell", "revoke"]);
    expect(new Set([...store.rows.values()].map((e) => e.nonce)).size).toBe(4);
    expect([...store.rows.values()].every((e) => e.state === "FINAL")).toBe(true);
    const count = store.rows.size;
    await processTransportedPaperOrder({ order: o, quote: null, now: Date.now(), store, transport, lease });
    expect(store.rows.size).toBe(count);
  });

  it.each(["CA/BOT", "CA/USDT", "BOT/USDT", "FLOW/USDT"])("regresses the full %s paper cycle", async (pair) => {
    const store = new MemoryStore(); const transport = new MockPaperTransport(); let o = order(pair); store.orders.set(o.id, o);
    o = (await processTransportedPaperOrder({ order: o, quote: quote(o, "buy", 2n * baseUnit(o)), now: Date.now(), store, transport, lease })).order;
    o = (await processTransportedPaperOrder({ order: o, quote: quote(o, "sell", 2n * quoteUnit(o)), now: Date.now(), store, transport, lease })).order;
    expect(o.state).toBe("COMPLETED");
    expect(o.legs).toHaveLength(2);
    expect([...store.rows.values()].filter((e) => e.side === "approve").every((approval) =>
      [...store.rows.values()].some((e) => e.side === "revoke" && e.parentKey === approval.parentKey && e.state === "FINAL"))).toBe(true);
  });

  it("recovers a crash after broadcast without signing or filling twice", async () => {
    const store = new MemoryStore(); let o = order("CA/BOT"); store.orders.set(o.id, o);
    class Crash extends MockPaperTransport { async broadcast(): Promise<void> { throw new Error("CRASH_AFTER_BROADCAST"); } }
    await expect(processTransportedPaperOrder({ order: o, quote: quote(o, "buy", 2n * baseUnit(o)), now: Date.now(), store, transport: new Crash(), lease })).rejects.toThrow("CRASH_AFTER_BROADCAST");
    o = store.orders.get(o.id)!;
    expect(o.state).toBe("BUY_SUBMITTED");
    const nonce = o.legs[0]!.nonce;
    const recovered = await processTransportedPaperOrder({ order: o, quote: null, now: Date.now(), store, transport: new MockPaperTransport(), lease });
    expect(recovered.order.state).toBe("HOLDING");
    expect(recovered.order.legs).toHaveLength(1);
    expect(recovered.order.legs[0]!.nonce).toBe(nonce);
    expect(store.rows.size).toBe(1);
  });

  it("stops a pause race after approval, then resumes without approving twice", async () => {
    const store = new MemoryStore(); let o = order("CA/BOT"); store.orders.set(o.id, o);
    o = (await processTransportedPaperOrder({ order: o, quote: quote(o, "buy", 2n * baseUnit(o)), now: Date.now(), store, transport: new MockPaperTransport(), lease })).order;
    class PauseOnApproval extends MockPaperTransport {
      async broadcast(args: { raw: `0x${string}` | null; txHash: string }) { if (args.txHash.includes(":approve:")) store.paused = true; }
    }
    const q = quote(o, "sell", 2n * quoteUnit(o));
    await expect(processTransportedPaperOrder({ order: o, quote: q, now: Date.now(), store, transport: new PauseOnApproval(), lease })).rejects.toThrow("EMERGENCY_PAUSED");
    expect(o.state).toBe("HOLDING");
    expect([...store.rows.values()].filter((e) => e.side === "approve")).toHaveLength(1);
    store.paused = false;
    const resumed = await processTransportedPaperOrder({ order: o, quote: q, now: Date.now(), store, transport: new MockPaperTransport(), lease });
    expect(resumed.order.state).toBe("COMPLETED");
    expect([...store.rows.values()].filter((e) => e.side === "approve")).toHaveLength(1);
  });

  it("waits for approval finality before buying and resumes without an illegal state regression", async () => {
    const store = new MemoryStore(); const o = order("CA/USDT"); store.orders.set(o.id, o);
    class PendingApproval extends MockPaperTransport {
      pending = true;
      async receipt(txHash: string): Promise<PaperReceipt | null> {
        const base = (await super.receipt(txHash))!;
        return this.pending && txHash.includes(":approve:") ? { ...base, confirmations: 1 } : base;
      }
    }
    const transport = new PendingApproval(); const q = quote(o, "buy", 2n * baseUnit(o));
    const waiting = await processTransportedPaperOrder({ order: o, quote: q, now: Date.now(), store, transport, lease });
    expect(waiting.order.state).toBe("ARMED");
    expect(waiting.decision).toMatchObject({ kind: "wait", reason: "APPROVAL_MINED" });
    expect([...store.rows.values()].map((e) => e.side)).toEqual(["approve"]);
    transport.pending = false;
    const resumed = await processTransportedPaperOrder({ order: o, quote: q, now: Date.now(), store, transport, lease });
    expect(resumed.order.state).toBe("HOLDING");
    expect([...store.rows.values()].filter((e) => e.side === "approve")).toHaveLength(1);
    expect([...store.rows.values()].every((e) => e.state === "FINAL")).toBe(true);
  });

  it("handles an unfinalized reorg and finalizes the same transaction, never a second leg", async () => {
    const store = new MemoryStore(); let o = order("CA/BOT"); store.orders.set(o.id, o);
    class Reorg extends MockPaperTransport {
      confirmations = 1; hash = "0xaaa"; canonical = "0xaaa";
      async receipt(txHash: string): Promise<PaperReceipt | null> {
        const base = (await super.receipt(txHash))!;
        return { ...base, confirmations: this.confirmations, block: 10, blockHash: this.hash };
      }
      async canonicalBlockHash(): Promise<string | null> { return this.canonical; }
    }
    const transport: PaperTransport = new Reorg(); const r = transport as Reorg;
    o = (await processTransportedPaperOrder({ order: o, quote: quote(o, "buy", 2n * baseUnit(o)), now: Date.now(), store, transport, lease })).order;
    expect(o.state).toBe("BUY_SUBMITTED");
    r.canonical = "0xbbb";
    const reorged = await processTransportedPaperOrder({ order: o, quote: null, now: Date.now(), store, transport, lease });
    expect(reorged.decision).toMatchObject({ reason: "REORGED" });
    expect(store.rows.get(`${o.id}:buy:leg`)?.state).toBe("BROADCAST");
    r.confirmations = 6; r.hash = "0xbbb"; r.canonical = "0xbbb";
    const final = await processTransportedPaperOrder({ order: o, quote: null, now: Date.now(), store, transport, lease });
    expect(final.order.state).toBe("HOLDING"); expect(final.order.legs).toHaveLength(1); expect(store.rows.size).toBe(1);
  });

  it("rejects high-fee, unregistered and quote-only routes before reserving an effect", async () => {
    for (const patch of [{ externalDirectionalFeeBps: 7300 }, { registered: false }, { executionClass: "QUOTE_ONLY" as const }]) {
      const store = new MemoryStore(); const o = order("CA/BOT"); store.orders.set(o.id, o);
      await expect(processTransportedPaperOrder({ order: o, quote: quote(o, "buy", 2n * baseUnit(o), patch), now: Date.now(), store, transport: new MockPaperTransport(), lease })).rejects.toThrow("ROUTE_NOT_EXECUTABLE");
      expect(store.rows.size).toBe(0);
    }
  });
});
