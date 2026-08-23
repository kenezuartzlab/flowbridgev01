/**
 * FlowBridge V17.1B §5/§6 — explicit FLOW Points → claimable FLOW conversion.
 *
 * This is an off-chain economic mutation and it is NEVER implicit: the caller
 * must confirm it, and the confirmed amount must still match the canonical
 * reward state at mutation time. All requirements are re-validated here; the
 * client's view of them is never trusted. Campaign PTS are never included.
 *
 * Idempotency: the mutation is guarded by the canonical resolver. Once the
 * eligible balance has moved, a repeated call finds nothing convertible and
 * returns ALREADY_CONVERTED instead of converting twice.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rewards/convert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        if (body?.confirm !== true) {
          return jsonResponse(
            { error: "Conversion requires an explicit confirmation.", code: "CONFIRMATION_REQUIRED" },
            400,
          );
        }

        try {
          const { resolveRewardStateForUser } = await import("@/lib/rewards/rewardState.server");
          const state = await resolveRewardStateForUser({
            userId: user.id,
            emailVerified: user.emailVerified,
            chainId: typeof body?.chainId === "number" ? body.chainId : null,
          });

          if (state.nextEconomicStep !== "CONVERT_FLOW_POINTS") {
            const code =
              state.convertibleFlowPoints === 0 && (state.claimableFlow ?? 0) > 0
                ? "ALREADY_CONVERTED"
                : (state.reasonCodes[0] ?? "CONVERSION_NOT_AVAILABLE");
            return jsonResponse(
              { error: state.copy.nextAction, code, rewardState: state },
              409,
            );
          }

          const expected = Number(body?.expectedConvertibleFlowPoints);
          if (Number.isFinite(expected) && expected !== state.convertibleFlowPoints) {
            return jsonResponse(
              {
                error: `Your convertible balance changed to ${state.convertibleFlowPoints} FLOW Points. Review and confirm again.`,
                code: "CONVERTIBLE_AMOUNT_CHANGED",
                rewardState: state,
              },
              409,
            );
          }

          const { claimFlowPoints } = await import("@/lib/flowbridge-db.server");
          const incentives = await claimFlowPoints(user.id, user.emailVerified);
          const after = await resolveRewardStateForUser({
            userId: user.id,
            emailVerified: user.emailVerified,
            chainId: typeof body?.chainId === "number" ? body.chainId : null,
          });
          return jsonResponse({
            success: true,
            convertedFlowPoints: state.convertibleFlowPoints,
            incentives,
            rewardState: after,
          });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Conversion failed" }, 400);
        }
      },
    },
  },
});
