/**
 * V15.1 §7 — Flow AI memory control surface.
 *
 * Read-only with respect to product state: this endpoint only manages the
 * signed-in user's own opt-in AI preferences. Identity is resolved server-side;
 * a caller can never address another user's memory.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAuthUser, jsonResponse, unauthorized } from "@/lib/api-auth.server";
import type { FlowAiActor } from "@/lib/ai/aiTypes";
import {
  clearUserMemory,
  listUserMemory,
  saveUserMemory,
} from "@/lib/ai/memoryStore.server";

async function actorFrom(request: Request): Promise<FlowAiActor | null> {
  const user = await getAuthUser(request);
  if (!user) return null;
  return { userId: user.id, email: user.email, orgIds: [], isInternalOperator: false };
}

export const Route = createFileRoute("/api/assistant/memory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const actor = await actorFrom(request);
        if (!actor) return unauthorized("Sign in to manage Flow AI memory.");
        return jsonResponse({ memories: await listUserMemory(actor) });
      },

      POST: async ({ request }) => {
        const actor = await actorFrom(request);
        if (!actor) return unauthorized("Sign in to manage Flow AI memory.");
        let body: { key?: string; value?: string; optedIn?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: "Invalid request body." }, 400);
        }
        const key = String(body.key ?? "").trim();
        const value = String(body.value ?? "").trim();
        if (!key || !value) return jsonResponse({ error: "A key and value are required." }, 400);
        if (body.optedIn !== true) {
          return jsonResponse({ error: "Memory is opt-in — enable it first." }, 400);
        }

        const result = await saveUserMemory({ actor, key, value, optedIn: true });
        if (!result.accepted) return jsonResponse({ error: result.reason }, 400);
        return jsonResponse({ memories: await listUserMemory(actor) });
      },

      DELETE: async ({ request }) => {
        const actor = await actorFrom(request);
        if (!actor) return unauthorized("Sign in to manage Flow AI memory.");
        const key = new URL(request.url).searchParams.get("key") ?? undefined;
        const removed = await clearUserMemory(actor, key);
        return jsonResponse({ removed, memories: await listUserMemory(actor) });
      },
    },
  },
});
