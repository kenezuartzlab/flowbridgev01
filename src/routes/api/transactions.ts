import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transactions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { getTransactionHistory } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const transactions = await getTransactionHistory(user.id);
          return jsonResponse({ success: true, transactions });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to fetch transactions" }, 500);
        }
      },
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { ensureProfile, createTransactionHistory } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const body = (await request.json()) as {
            txType?: string;
            direction?: string;
            fromAmount?: string;
            toAmount?: string;
            txHash?: string;
            status?: string;
          };
          if (!body.txType || !body.direction || !body.fromAmount || !body.toAmount || !body.status) {
            return jsonResponse({ error: "Missing required fields in request body" }, 400);
          }
          await ensureProfile(user.id, user.email);
          const tx = await createTransactionHistory(user.id, user.emailVerified, {
            txType: body.txType,
            direction: body.direction,
            fromAmount: body.fromAmount,
            toAmount: body.toAmount,
            txHash: body.txHash ?? null,
            status: body.status,
          });
          return jsonResponse({ success: true, transaction: tx }, 201);
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to save transaction" }, 500);
        }
      },
    },
  },
});
