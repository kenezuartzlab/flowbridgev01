import { createFileRoute } from "@tanstack/react-router";

/**
 * V12 — trusted FLOW token claim authorization.
 * The body may only carry `chainId`. Any token/distributor/amount/signer values
 * sent by the browser are ignored: the server registry is authoritative.
 */
export const Route = createFileRoute("/api/rewards/claim-authorization")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { authorizeFlowTokenClaim } = await import("@/lib/rewards/flowClaimAuthority.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();

        const body = await request.json().catch(() => ({} as any));
        const chainId = Number.isInteger(body?.chainId) ? Number(body.chainId) : null;

        try {
          const result = await authorizeFlowTokenClaim({
            userId: user.id,
            emailVerified: user.emailVerified,
            chainId,
          });
          return jsonResponse({ success: true, authorization: result });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to authorize FLOW claim" }, 500);
        }
      },
    },
  },
});
