/**
 * V15 — Flow AI endpoint. Identity/scopes are resolved HERE (server-side) before
 * any private retrieval; the model never decides authorization. Read-only.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAuthUser, jsonResponse } from "@/lib/api-auth.server";
import { ANONYMOUS_ACTOR, type FlowAiActor } from "@/lib/ai/aiTypes";
import { answerFlowAiQuestion } from "@/lib/ai/flowAi.server";
import type { PendingPreparation } from "@/lib/ai/preparationRouting";
import type { PreparedHandle } from "@/lib/ai/actionContinuation";

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

/**
 * V15.3A — the pending preparation slot is a CLIENT-CARRIED HINT only. Nothing
 * economic is trusted from it: it may name an action shape and which field is
 * missing, but amounts, addresses, decimals, routers, balances and simulation
 * are all re-resolved server-side, and the actor key is re-derived here from the
 * server-known session and bound wallet.
 */
function normalizePending(raw: unknown): PendingPreparation | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 64) : null);
  const type = str(p.type);
  const chainId = Number(p.chainId);
  const expiresAt = str(p.expiresAt);
  if (!type || !Number.isInteger(chainId) || !expiresAt) return null;
  if (new Date(expiresAt).getTime() <= Date.now()) return null;
  return {
    type: type as PendingPreparation["type"],
    chainId,
    tokenInSymbol: str(p.tokenInSymbol),
    tokenOutSymbol: str(p.tokenOutSymbol),
    destinationChainId: Number.isInteger(Number(p.destinationChainId))
      ? Number(p.destinationChainId)
      : null,
    missingFields: Array.isArray(p.missingFields)
      ? (p.missingFields.filter((f) => f === "amount") as PendingPreparation["missingFields"])
      : [],
    recognized: Array.isArray(p.recognized)
      ? p.recognized.slice(0, 8).map((r) => String(r).slice(0, 80))
      : [],
    createdAt: str(p.createdAt) ?? new Date().toISOString(),
    expiresAt,
    actorKey: str(p.actorKey) ?? "",
  };
}

/**
 * V15.3D — the prepared-action handle is likewise a CLIENT-CARRIED HINT. It can
 * only continue an existing prepared plan's lifecycle; it grants no authority,
 * carries no calldata, and the target surface still revalidates everything.
 */
function normalizePrepared(raw: unknown): PreparedHandle | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown, n = 120) => (typeof v === "string" ? v.slice(0, n) : null);
  const intentId = str(p.intentId, 64);
  const type = str(p.type, 40);
  const expiresAt = str(p.expiresAt, 40);
  const chainId = Number(p.chainId);
  if (!intentId || !type || !expiresAt || !Number.isInteger(chainId)) return null;
  const state = str(p.state, 24);
  return {
    intentId,
    type,
    chainId,
    state: (state as PreparedHandle["state"]) ?? "READY_FOR_USER",
    expiresAt,
    handoffHref: str(p.handoffHref, 300),
    handoffCta: str(p.handoffCta, 60),
    surface: str(p.surface, 60),
    actorKey: str(p.actorKey, 200) ?? "",
  };
}

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let messages: { role: "user" | "assistant"; content: string }[] = [];
        let pending: PendingPreparation | null = null;
        let prepared: PreparedHandle | null = null;
        // V15.3B — untrusted connector hints: never used to decide whether a
        // wallet is bound, only to explain wrong-network / wrong-wallet state.
        let connector: { address: string | null; chainId: number | null } | null = null;
        try {
          const body = (await request.json()) as {
            messages?: { role?: string; content?: string }[];
            pending?: unknown;
            prepared?: unknown;
            connector?: { address?: unknown; chainId?: unknown };
          };
          pending = normalizePending(body.pending);
          prepared = normalizePrepared(body.prepared);
          const rawAddress =
            typeof body.connector?.address === "string" ? body.connector.address.toLowerCase() : null;
          connector = {
            address: rawAddress && /^0x[0-9a-f]{40}$/.test(rawAddress) ? rawAddress : null,
            chainId: Number.isInteger(Number(body.connector?.chainId))
              ? Number(body.connector?.chainId)
              : null,
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
            pending,
            prepared,
            connector,
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
