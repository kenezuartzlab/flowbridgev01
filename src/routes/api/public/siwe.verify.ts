import { createFileRoute } from "@tanstack/react-router";
import { verifyMessage, verifyTypedData } from "viem";
import { buildFlowBridgeTypedData } from "@/lib/siweProof";
import { z } from 'zod';
import { validateSignInMessage } from '@/lib/wallet/signInMessage';

// Verifies a SIWE-style signature and, if the wallet is already linked to a
// registered email, returns a single-use OTP token_hash the client can exchange
// for a Supabase session via supabase.auth.verifyOtp(). If the wallet has no
// bound account, returns { needs_binding: true } so the UI can prompt the
// user to sign in once with email to bind.
export const Route = createFileRoute("/api/public/siwe/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = z.object({ walletAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/), message: z.string().min(1).max(2048), signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/), nonce: z.string().regex(/^[a-f0-9]{48}$/) }).safeParse(await request.json());
          if (!input.success) {
            return Response.json({ error: "Missing fields" }, { status: 400 });
          }
          const { walletAddress, message, signature, nonce } = input.data;
          const normalized = walletAddress.trim().toLowerCase();
          if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
            return Response.json({ error: "Invalid wallet address" }, { status: 400 });
          }
          if (!validateSignInMessage(message, { wallet: normalized, nonce, requestOrigin: request.headers.get('origin'), nowMs: Date.now() })) {
            return Response.json({ error: "Wallet proof does not match this site. Retry sign-in." }, { status: 400 });
          }
          const { checkWalletRequestLimit } = await import('@/lib/wallet/requestLimit.server');
          const limited = await checkWalletRequestLimit(normalized);
          if (limited) return limited;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Consume nonce atomically: must exist, match wallet, be unused, and unexpired.
          const { data: nonceRow, error: nonceErr } = await supabaseAdmin
            .from("siwe_nonces")
            .select("id, wallet_address, expires_at, used_at")
            .eq("nonce", nonce)
            .maybeSingle();
          if (nonceErr) return Response.json({ error: 'Wallet sign-in checks unavailable.' }, { status: 503 });
          if (!nonceRow) return Response.json({ error: "Unknown nonce" }, { status: 400 });
          if (nonceRow.used_at) return Response.json({ error: "Nonce already used" }, { status: 400 });
          if (nonceRow.wallet_address !== normalized) {
            return Response.json({ error: "Nonce wallet mismatch" }, { status: 400 });
          }
          if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
            return Response.json({ error: "Nonce expired" }, { status: 400 });
          }

          // Verify ECDSA signature recovers to the claimed wallet.
          let valid = false;
          try {
            valid = await verifyMessage({
              address: normalized as `0x${string}`,
              message,
              signature: signature as `0x${string}`,
            });
          } catch {
            valid = false;
          }
          if (!valid) {
            try {
              const typedData = buildFlowBridgeTypedData({ walletAddress: normalized, message, nonce });
              valid = await verifyTypedData({
                address: normalized as `0x${string}`,
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
          if (!valid) return Response.json({ error: "Invalid signature" }, { status: 401 });

          // Mark nonce consumed before issuing anything.
          const consumedAt = new Date().toISOString();
          const { data: consumed, error: consumeError } = await supabaseAdmin
            .from("siwe_nonces")
            .update({ used_at: consumedAt })
            .eq("id", nonceRow.id)
            .is('used_at', null)
            .gt('expires_at', consumedAt)
            .select('id')
            .maybeSingle();
          if (consumeError || !consumed) return Response.json({ error: 'Wallet proof expired or already used. Retry sign-in.' }, { status: 409 });

          // Look up the bound profile.
          const { data: profile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("id, email")
            .eq("wallet_address", normalized)
            .maybeSingle();
          if (profileError) return Response.json({ error: 'Wallet sign-in checks unavailable.' }, { status: 503 });

          if (!profile || !profile.email) {
            return Response.json({ verified: true, needs_binding: true });
          }

          // Mint a one-time magiclink token_hash for the bound email.
          const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: profile.email,
          });
          if (linkErr || !linkData?.properties?.hashed_token) {
            return Response.json(
              { error: "Could not create sign-in session. Retry sign-in." },
              { status: 500 },
            );
          }

          return Response.json({
            verified: true,
            token_hash: linkData.properties.hashed_token,
            verify_type: linkData.properties.verification_type ?? "magiclink",
          }, { headers: { 'Cache-Control': 'no-store' } });
        } catch {
          return Response.json({ error: "Wallet sign-in unavailable. Retry later." }, { status: 503 });
        }
      },
    },
  },
});
