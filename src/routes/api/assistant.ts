/**
 * V15 — Flow AI endpoint. Identity/scopes are resolved HERE (server-side) before
 * any private retrieval; the model never decides authorization. Read-only.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAuthUser, jsonResponse } from "@/lib/api-auth.server";
import { ANONYMOUS_ACTOR, type FlowAiActor } from "@/lib/ai/aiTypes";
import { answerFlowAiQuestion } from "@/lib/ai/flowAi.server";

const INTERNAL_OPERATOR_EMAILS = ["kenezuartzlab@gmail.com"];

async function resolveActor(request: Request): Promise<FlowAiActor> {
  const user = await getAuthUser(request);
  if (!user) return ANONYMOUS_ACTOR;

  let orgIds: string[] = [];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("partner_org_members")
      .select("org_id")
      .eq("user_id", user.id);
    orgIds = (data ?? []).map((r: any) => String(r.org_id));
  } catch {
    orgIds = [];
  }

  return {
    userId: user.id,
    email: user.email,
    orgIds,
    isInternalOperator: INTERNAL_OPERATOR_EMAILS.includes(user.email.toLowerCase()),
  };
}

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let messages: { role: "user" | "assistant"; content: string }[] = [];
        try {
          const body = (await request.json()) as {
            messages?: { role?: string; content?: string }[];
          };
          messages = (body.messages ?? [])
            .filter(
              (m) =>
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string" &&
                m.content.trim().length > 0,
            )
            .slice(-12)
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: String(m.content).slice(0, 2000),
            }));
        } catch {
          return jsonResponse({ error: "Invalid request body." }, 400);
        }

        const last = [...messages].reverse().find((m) => m.role === "user");
        if (!last) return jsonResponse({ error: "Ask a question first." }, 400);

        const actor = await resolveActor(request);
        const requestId = crypto.randomUUID();

        try {
          const result = await answerFlowAiQuestion({
            question: last.content,
            history: messages.slice(0, -1),
            actor,
            requestId,
          });
          return jsonResponse({ requestId, ...result });
        } catch (e) {
          console.error("[flow-ai] failed", requestId, e);
          return jsonResponse(
            { error: "Flow AI is unavailable right now.", requestId },
            502,
          );
        }
      },
    },
  },
});
