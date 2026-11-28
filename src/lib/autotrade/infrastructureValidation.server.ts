/** Read-only configured integration checks. No digest signing, account provisioning or effects. */
import { loadManagedInfrastructure, infrastructurePresence } from "./infrastructure.server";
import { createManagedRpcConnector } from "./managedRpc.server";
export async function validateConfiguredInfrastructure(send: typeof fetch = fetch) {
  const presence = infrastructurePresence();
  if (!presence.rpcConfigured || !presence.signerConfigured) return { ...presence, verified: false, status: "NOT_CONFIGURED", signingRequested: false };
  try {
    const config = loadManagedInfrastructure();
    const rpc = createManagedRpcConnector(config.rpc, send);
    const block = await rpc.consensus();
    await rpc.pendingNonce(config.signer.account);
    const response = await send(new URL(`/v1/keys/${encodeURIComponent(config.signer.keyId)}/policy`, config.signer.origin), { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { authorization: `Bearer ${config.signer.credential}` } });
    if (!response.ok || response.status >= 300) throw new Error("BROKER_POLICY_UNAVAILABLE");
    const p = await response.json() as Record<string, unknown>;
    if (p["keyId"] !== config.signer.keyId || String(p["account"]).toLowerCase() !== config.signer.account.toLowerCase() || p["exportable"] !== false || p["curve"] !== "secp256k1" || p["digest"] !== "keccak256" || p["chainId"] !== 677 || p["arbitrarySigning"] !== false || p["idempotent"] !== true) throw new Error("BROKER_POLICY_UNVERIFIED");
    return { ...presence, verified: false, status: "READ_ONLY_PROBES_PASS_HUMAN_REVIEW_REQUIRED", block: block.toString(), signingRequested: false };
  } catch {
    return { ...presence, verified: false, status: "CONFIGURED_VALIDATION_FAILED", signingRequested: false };
  }
}