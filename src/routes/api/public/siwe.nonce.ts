import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';

// Issues a one-time, short-lived nonce for a wallet to sign during SIWE.
export const Route = createFileRoute("/api/public/siwe/nonce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = z.object({ walletAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/) }).safeParse(await request.json());
          if (!input.success) {
            return Response.json({ error: "Invalid wallet address" }, { status: 400 });
          }
          const normalized = input.data.walletAddress.toLowerCase();
          const { checkWalletRequestLimit } = await import('@/lib/wallet/requestLimit.server');
          const limited = await checkWalletRequestLimit(normalized);
          if (limited) return limited;

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
          if (error) return Response.json({ error: 'Wallet sign-in unavailable. Retry later.' }, { status: 503 });

          return Response.json({ nonce, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
        } catch {
          return Response.json({ error: "Wallet sign-in unavailable. Retry later." }, { status: 503 });
        }
      },
    },
  },
});
