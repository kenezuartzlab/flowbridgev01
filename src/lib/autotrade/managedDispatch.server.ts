/** Production worker dispatch; all dependencies load after the immutable live switch. */
import { AUTOTRADE_LIVE_ENABLED } from "./config";
import { ManagedExecutionStore, managedFingerprint, type ManagedRpcStoreClient, type ManagedLease } from "./managedStore.server";
import { processManagedLiveEffect } from "./managedSigner.server";
import { createManagedRpcConnector } from "./managedRpc.server";
import { loadManagedInfrastructure } from "./infrastructure.server";
import type { ManagedEffectRequest } from "./liveTransport";

export function hydrateManagedRequest(value: unknown): ManagedEffectRequest {
  if (!value || typeof value !== "object") throw new Error("MANAGED_REQUEST_INVALID");
  const r = value as ManagedEffectRequest;
  if (!r.call || !r.leg || !r.routeGuard || !["buy", "sell", "approve", "revoke"].includes(r.side)) throw new Error("MANAGED_REQUEST_INVALID");
  return { ...r, gas: BigInt(r.gas), maxFeePerGas: BigInt(r.maxFeePerGas), maxGasWei: BigInt(r.maxGasWei),
    call: { ...r.call, value: BigInt(r.call.value) }, leg: { ...r.leg, value: BigInt(r.leg.value), approval: r.leg.approval ? { ...r.leg.approval, amount: BigInt(r.leg.approval.amount) } : null } };
}
export async function dispatchManagedRequest(request: ManagedEffectRequest, client: ManagedRpcStoreClient, lease: ManagedLease) {
  if (!AUTOTRADE_LIVE_ENABLED) throw new Error("LIVE_DISABLED");
  const config = loadManagedInfrastructure();
  const connector = createManagedRpcConnector(config.rpc);
  const store = new ManagedExecutionStore(client, lease, () => connector.pendingNonce(request.account));
  return processManagedLiveEffect(request, { signer: config.signer, rpc: config.rpc,
    assertApprovedOrderAndLease: async () => { await connector.consensus(); await store.authorize(request); },
    io: { reserve: store.reserve, advance: store.advance(request), broadcast: connector.broadcast, receipt: connector.receipt },
  });
}
export async function processManagedOrders(client: any, holder: string, fencing: number) {
  if (!AUTOTRADE_LIVE_ENABLED) return { processed: 0, status: "LIVE_DISABLED" } as const;
  const { data, error } = await client.from("autotrade_managed_pending").select("request_json,fingerprint,execution_index").eq("approved", true).order("execution_index").limit(4);
  if (error) throw new Error("MANAGED_INTENTS_UNAVAILABLE");
  let processed = 0;
  for (const intent of data ?? []) {
    const request = hydrateManagedRequest(intent.request_json);
    if (managedFingerprint(request) !== intent.fingerprint) throw new Error("INTENT_FINGERPRINT_MISMATCH");
    const result = await dispatchManagedRequest(request, client, { holder, fencing, attempt: crypto.randomUUID() });
    processed++;
    if (result.state !== "FINAL") break;
  }
  return { processed, status: "MANAGED" } as const;
}