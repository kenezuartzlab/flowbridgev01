import { createFileRoute } from "@tanstack/react-router";

// Ops → Rewards → Budget Controls. Admin-gated; read state, propose, approve
// (super admin only), prepare/confirm the on-chain setCampaignBudget tx.
// Never signs or broadcasts — the budget-manager wallet executes via the UI.
export const Route = createFileRoute("/api/admin/rewards-budget")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        try {
          const { readBudgetControlsState } = await import("@/lib/rewards/budgetControls.server");
          return jsonResponse(await readBudgetControlsState());
        } catch {
          return jsonResponse({ error: "Budget state is temporarily unavailable." }, 503);
        }
      },
      POST: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const body = await request.json().catch(() => ({}));
        const action = String((body as any)?.action ?? "");
        try {
          const m = await import("@/lib/rewards/budgetControls.server");
          if (action === "propose") {
            const r = await m.proposeBudgetAdjustment(gate.admin, String((body as any).programId ?? ""), Number((body as any).newBudget), (body as any).note);
            return jsonResponse(r, r.ok ? 200 : 400);
          }
          if (action === "approve" || action === "reject") {
            const r = await m.decideBudgetAdjustment(gate.admin, String((body as any).id ?? ""), action);
            return jsonResponse(r, r.ok ? 200 : 400);
          }
          if (action === "prepare-tx") {
            const r = await m.prepareBudgetTx(gate.admin, String((body as any).id ?? ""));
            return jsonResponse(r, r.ok ? 200 : 400);
          }
          if (action === "confirm") {
            const r = await m.confirmBudgetTx(gate.admin, String((body as any).id ?? ""), String((body as any).txHash ?? "") as `0x${string}`);
            return jsonResponse(r, r.ok ? 200 : 400);
          }
          if (action === "recheck") {
            const r = await m.recheckBudgetAdjustment(gate.admin, String((body as any).id ?? ""));
            return jsonResponse(r, r.ok ? 200 : 400);
          }
          return jsonResponse({ error: "Unknown action." }, 400);
        } catch (e) {
          return jsonResponse({ error: (e as Error)?.message ?? "Budget operation failed." }, 500);
        }
      },
    },
  },
});
