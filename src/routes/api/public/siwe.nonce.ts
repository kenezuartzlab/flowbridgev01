import { createFileRoute } from "@tanstack/react-router";

// Issues a one-time, short-lived nonce for a wallet to sign during SIWE.
export const Route = createFileRoute("/api/public/siwe/nonce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { walletAddress } = (await request.json()) as { walletAddress?: string };
          if (!walletAddress || typeof walletAddress !== "string") {
            return Response.json({ error: "Missing walletAddress" }, { status: 400 });
          }
          const normalized = walletAddress.trim().toLowerCase();
          if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
            return Response.json({ error: "Invalid wallet address" }, { status: 400 });
          }

          const nonceBytes = new Uint8Array(24);
          crypto.getRandomValues(nonceBytes);
          const nonce = Array.from(nonceBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("siwe_nonces").insert({
            wallet_address: normalized,
            nonce,
            expires_at: expiresAt,
          });
          if (error) return Response.json({ error: error.message }, { status: 500 });

          return Response.json({ nonce, expiresAt });
        } catch (e: any) {
          return Response.json({ error: e?.message ?? "Nonce failed" }, { status: 500 });
        }
      },
    },
  },
});
