import { z } from "zod";
import { validateIndependentRpc } from "./canaryPreparation";
import { validateManagedConfig } from "./managedSigner.server";
import type { Hex } from "viem";
const rpcSchema = z.object({ primaryUrl: z.string().max(2048), secondaryUrl: z.string().max(2048), primaryOperator: z.string().max(120), secondaryOperator: z.string().max(120), independenceReviewed: z.boolean(), comparisonDays: z.number(), mismatches: z.number(), receiptParity: z.boolean() });
/** Called only inside authenticated handlers / managed worker; never disclose values. */
export function infrastructurePresence() {
  return { rpcConfigured: Boolean(process.env["AUTOTRADE_RPC_CONFIG"]), signerConfigured: ["AUTOTRADE_SIGNER_ORIGIN", "AUTOTRADE_SIGNER_CREDENTIAL", "AUTOTRADE_SIGNER_KEY_ID", "AUTOTRADE_SIGNER_ACCOUNT"].every(key => Boolean(process.env[key])) };
}
export function loadManagedInfrastructure() {
  const text = process.env["AUTOTRADE_RPC_CONFIG"];
  if (!text) throw new Error("INDEPENDENT_RPC_NOT_CONFIGURED");
  const rpc = rpcSchema.parse(JSON.parse(text));
  if (validateIndependentRpc(rpc).length) throw new Error("INDEPENDENT_RPC_UNVERIFIED");
  const signer = { origin: process.env["AUTOTRADE_SIGNER_ORIGIN"] ?? "", credential: process.env["AUTOTRADE_SIGNER_CREDENTIAL"] ?? "", keyId: process.env["AUTOTRADE_SIGNER_KEY_ID"] ?? "", account: (process.env["AUTOTRADE_SIGNER_ACCOUNT"] ?? "") as Hex, custodyReviewed: process.env["AUTOTRADE_SIGNER_CUSTODY_REVIEWED"] === "true" };
  validateManagedConfig(signer);
  return { rpc, signer };
}