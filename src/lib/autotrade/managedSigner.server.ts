/** Fetch-only KMS policy-broker connector. No SDK, key material, account creation or runtime live override. */
import { isAddress, type Hex } from "viem";
import { AUTOTRADE_LIVE_ENABLED } from "./config";
import { secureServiceUrl, validateIndependentRpc, type InfrastructureConfig } from "./canaryPreparation";
import { executeManagedEffect, type ManagedEffectIO, type ManagedEffectRequest } from "./liveTransport";

export interface ManagedSignerConfig { origin: string; credential: string; keyId: string; account: Hex; custodyReviewed: boolean }
export function validateManagedConfig(c: ManagedSignerConfig) {
  secureServiceUrl(c.origin);
  if (new URL(c.origin).pathname !== "/" || !c.credential || !c.keyId || !isAddress(c.account) || /^0x0{40}$/i.test(c.account) || !c.custodyReviewed) throw new Error("MANAGED_SIGNER_UNVERIFIED");
}
export async function brokerSign(c: ManagedSignerConfig, request: ManagedEffectRequest, nonce: number, authorize: () => Promise<void>, send: typeof fetch = fetch): Promise<Hex> {
  await authorize();
  validateManagedConfig(c);
  if (c.account.toLowerCase() !== request.account.toLowerCase()) throw new Error("SIGNER_ACCOUNT_MISMATCH");
  const response = await send(new URL("/v1/transactions/sign", c.origin), {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(5_000),
    headers: { authorization: `Bearer ${c.credential}`, "content-type": "application/json", "idempotency-key": request.key },
    body: JSON.stringify({ keyId: c.keyId, orderId: request.orderId, account: c.account, chainId: 677, nonce,
      to: request.call.to, data: request.call.data, value: request.call.value.toString(), gas: request.gas.toString(), maxFeePerGas: request.maxFeePerGas.toString() }),
  });
  if (!response.ok || response.status >= 300) throw new Error("MANAGED_SIGNER_REQUEST_FAILED");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("serializedTransaction" in body) || typeof body.serializedTransaction !== "string" || !/^0x[0-9a-f]+$/i.test(body.serializedTransaction) || body.serializedTransaction.length > 40_000) throw new Error("MANAGED_SIGNER_RESPONSE_INVALID");
  return body.serializedTransaction as Hex;
}

/** Worker-facing live integration, disabled before storage, RPC, broker or broadcast. */
export async function processManagedLiveEffect(request: ManagedEffectRequest, deps: {
  io: Omit<ManagedEffectIO, "authorize" | "sign">;
  signer: ManagedSignerConfig; rpc: InfrastructureConfig;
  assertApprovedOrderAndLease: () => Promise<void>;
}) {
  const authorize = async () => {
    if (!AUTOTRADE_LIVE_ENABLED) throw new Error("LIVE_DISABLED");
    const errors = validateIndependentRpc(deps.rpc);
    if (errors.length) throw new Error(errors.join(","));
    validateManagedConfig(deps.signer);
    await deps.assertApprovedOrderAndLease();
  };
  return executeManagedEffect(request, {
    ...deps.io, authorize,
    sign: (r, nonce) => brokerSign(deps.signer, r, nonce, authorize),
  });
}