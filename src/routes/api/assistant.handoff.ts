/**
 * V15.3J §3 — server-resolved handoff endpoint.
 *
 * Trade sends only the opaque intent id (plus the link's digest hint) and gets
 * back the canonical prepared snapshot for the SIGNED-IN owner. Read-only: it
 * never prepares, signs, submits or mutates anything, and it returns no calldata.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAuthUser, jsonResponse, unauthorized } from "@/lib/api-auth.server";
import { resolvePreparedIntentForUser } from "@/lib/ai/preparedIntentStore.server";
import { HANDOFF_RESOLUTION_COPY } from "@/lib/ai/handoffResolution";

export const Route = createFileRoute("/api/assistant/handoff")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const intentId = (url.searchParams.get("intent") ?? "").trim();
        const digest = (url.searchParams.get("fp") ?? "").trim();
        if (!intentId || intentId.length > 64) {
          return jsonResponse(
            { status: "MISSING", canonical: null, message: HANDOFF_RESOLUTION_COPY.MISSING },
            400,
          );
        }

        const user = await getAuthUser(request);
        if (!user) return unauthorized(HANDOFF_RESOLUTION_COPY.UNAUTHENTICATED);

        const resolution = await resolvePreparedIntentForUser({
          intentId,
          userId: user.id,
          digestHint: digest || null,
        });
        return jsonResponse({ ...resolution, executed: false });
      },
    },
  },
});
