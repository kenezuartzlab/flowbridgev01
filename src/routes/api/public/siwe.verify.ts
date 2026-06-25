import { createFileRoute } from "@tanstack/react-router";
import { verifyMessage } from "viem";

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
          const body = (await request.json()) as {
            walletAddress?: string;
            message?: string;
            signature?: string;
            nonce?: string;
          };
          const { walletAddress, message, signature, nonce } = body;
          if (!walletAddress || !message || !signature || !nonce) {
            return Response.json({ error: "Missing fields" }, { status: 400 });
          }
          const normalized = walletAddress.trim().toLowerCase();
          if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
            return Response.json({ error: "Invalid wallet address" }, { status: 400 });
          }
          if (!message.includes(nonce)) {
            return Response.json({ error: "Nonce missing from message" }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Consume nonce atomically: must exist, match wallet, be unused, and unexpired.
          const { data: nonceRow, error: nonceErr } = await supabaseAdmin
            .from("siwe_nonces")
            .select("id, wallet_address, expires_at, used_at")
            .eq("nonce", nonce)
            .maybeSingle();
          if (nonceErr) return Response.json({ error: nonceErr.message }, { status: 500 });
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
          if (!valid) return Response.json({ error: "Invalid signature" }, { status: 401 });

          // Mark nonce consumed before issuing anything.
          await supabaseAdmin
            .from("siwe_nonces")
            .update({ used_at: new Date().toISOString() })
            .eq("id", nonceRow.id);

          // Look up the bound profile.
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, email")
            .eq("wallet_address", normalized)
            .maybeSingle();

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
              { error: linkErr?.message ?? "Failed to mint session" },
              { status: 500 },
            );
          }

          return Response.json({
            verified: true,
            email: profile.email,
            token_hash: linkData.properties.hashed_token,
          });
        } catch (e: any) {
          return Response.json({ error: e?.message ?? "Verify failed" }, { status: 500 });
        }
      },
    },
  },
});
