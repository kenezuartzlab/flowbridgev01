import { createFileRoute } from "@tanstack/react-router";

/**
 * V30.2B P4A.2.1 — official wallet-binding path.
 *
 * Requires an authenticated account AND a signed single-use wallet challenge.
 * Uniqueness and rebind limits are enforced inside the privileged
 * `admin_bind_wallet` RPC, which is the only path allowed to write the
 * protected `wallet_address` column. The canonical bound wallet is re-read from
 * the database and returned, so the client never trusts local state.
 */
export const Route = createFileRoute("/api/users/bind-wallet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { bindUserWallet } = await import("@/lib/flowbridge-db.server");
        const { verifyWalletChallenge } = await import("@/lib/walletChallenge.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const body = (await request.json()) as {
            walletAddress?: string;
            message?: string;
            signature?: string;
            nonce?: string;
          };
          if (!body?.walletAddress) {
            return jsonResponse({ error: "Missing walletAddress parameter" }, 400);
          }
          const challenge = await verifyWalletChallenge(body);
          if (!challenge.ok) return jsonResponse({ error: challenge.error }, challenge.status);

          const updated = await bindUserWallet(user.id, challenge.wallet);
          return jsonResponse({
            success: true,
            walletAddress: (updated as { wallet_address?: string } | null)?.wallet_address ?? null,
            user: updated,
          });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to bind wallet address" }, 400);
        }
      },
    },
  },
});
