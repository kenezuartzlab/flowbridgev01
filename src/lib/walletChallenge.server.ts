/**
 * V30.2B P4A.2.1 — server-side wallet ownership challenge.
 *
 * Shared by the SIWE session route and the wallet-binding route: consumes a
 * single-use nonce bound to the claimed wallet and proves the signature
 * recovers to that exact wallet. No client may bind a wallet it cannot sign
 * for, and the protected `wallet_address` column is only ever written by the
 * privileged `admin_bind_wallet` RPC after this check passes.
 */
import { verifyMessage, verifyTypedData } from "viem";
import { buildFlowBridgeTypedData } from "@/lib/siweProof";

export interface WalletChallengeInput {
  walletAddress?: string | null;
  message?: string | null;
  signature?: string | null;
  nonce?: string | null;
}

export type WalletChallengeResult =
  | { ok: true; wallet: string }
  | { ok: false; status: number; error: string };

export async function verifyWalletChallenge(
  input: WalletChallengeInput,
): Promise<WalletChallengeResult> {
  const { walletAddress, message, signature, nonce } = input;
  if (!walletAddress || !message || !signature || !nonce) {
    return { ok: false, status: 400, error: "A signed wallet challenge is required." };
  }
  const wallet = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return { ok: false, status: 400, error: "Invalid wallet address" };
  }
  if (!message.includes(nonce)) {
    return { ok: false, status: 400, error: "Nonce missing from signed message" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("siwe_nonces")
    .select("id, wallet_address, expires_at, used_at")
    .eq("nonce", nonce)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) return { ok: false, status: 400, error: "Unknown challenge" };
  if (row.used_at) return { ok: false, status: 400, error: "Challenge already used" };
  if (row.wallet_address !== wallet) {
    return { ok: false, status: 400, error: "Challenge wallet mismatch" };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 400, error: "Challenge expired" };
  }

  let valid = false;
  try {
    valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    try {
      const typedData = buildFlowBridgeTypedData({ walletAddress: wallet, message, nonce });
      valid = await verifyTypedData({
        address: wallet as `0x${string}`,
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
        signature: signature as `0x${string}`,
      });
    } catch {
      valid = false;
    }
  }
  if (!valid) return { ok: false, status: 401, error: "Invalid signature for this wallet." };

  // Consume the nonce before anything is granted.
  await supabaseAdmin
    .from("siwe_nonces")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null);

  return { ok: true, wallet };
}
