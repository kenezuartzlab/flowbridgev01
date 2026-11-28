// Service-role-only durable paper effect store. All mutations are atomic RPCs:
// lease/fence/pause + order/event/outbox changes commit or roll back together.
import type { Order } from "./engine";
import { serialize } from "./store.server";
import {
  PAPER_ACCOUNT,
  PAPER_CHAIN_ID,
  type PaperEffect,
  type PaperExecutionStore,
  type StoredCall,
} from "./paperExecutor";

const json = (_key: string, value: unknown) => typeof value === "bigint" ? value.toString() : value;
function storedCall(value: any): StoredCall {
  return {
    call: { ...value.call, value: BigInt(value.call.value) },
    legCall: {
      ...value.legCall,
      value: BigInt(value.legCall.value),
      approval: value.legCall.approval ? { ...value.legCall.approval, amount: BigInt(value.legCall.approval.amount) } : null,
    },
  };
}
function effect(row: any): PaperEffect {
  return {
    key: row.idempotency_key,
    parentKey: row.parent_key,
    side: row.side,
    nonce: row.nonce,
    state: row.state,
    txHash: row.tx_hash,
    signedRaw: row.signed_raw,
    minedBlock: row.mined_block === null ? null : Number(row.mined_block),
    minedHash: row.mined_hash,
    storedCall: storedCall(row.call_json),
    fencing: Number(row.fencing),
  };
}

export class SupabasePaperExecutionStore implements PaperExecutionStore {
  constructor(private readonly d: any) {}
  async reserve(args: Parameters<PaperExecutionStore["reserve"]>[0]): Promise<PaperEffect> {
    const { data, error } = await this.d.rpc("autotrade_paper_reserve_effect", {
      _order_id: args.order.id,
      _expected_version: args.order.version,
      _key: args.key,
      _parent_key: args.parentKey,
      _side: args.side,
      _chain_id: PAPER_CHAIN_ID,
      _account: PAPER_ACCOUNT,
      _call_json: JSON.parse(JSON.stringify(args.storedCall, json)),
      _holder: args.lease.holder,
      _fencing: args.lease.fencing,
    });
    if (error || !data) throw new Error(error?.message ?? "PAPER_RESERVE_FAILED");
    return effect(data);
  }
  async advance(args: Parameters<PaperExecutionStore["advance"]>[0]): Promise<void> {
    const { error } = await this.d.rpc("autotrade_paper_advance_effect", {
      _order_id: args.order.id,
      _expected_version: args.order.version,
      _key: args.effect.key,
      _patch: JSON.parse(JSON.stringify(args.patch, json)),
      _next_order: args.nextOrder ? serialize(args.nextOrder) : null,
      _event: args.event ? JSON.parse(JSON.stringify(args.event, json)) : null,
      _decision: args.decision ? JSON.parse(JSON.stringify(args.decision, json)) : null,
      _require_unpaused: args.requireUnpaused,
      _holder: args.lease.holder,
      _fencing: args.lease.fencing,
    });
    if (error) throw new Error(error.message);
  }
  async effects(orderId: string): Promise<PaperEffect[]> {
    const { data, error } = await this.d.from("autotrade_outbox").select("idempotency_key,parent_key,side,nonce,state,tx_hash,signed_raw,mined_block,mined_hash,call_json,fencing").eq("order_id", orderId).order("created_at").limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map(effect);
  }
}
