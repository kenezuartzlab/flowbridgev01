/**
 * V15.2 — ActionIntent preparation endpoint.
 *
 * Read-only: prepares, simulates and revalidates plans. It never signs, submits,
 * publishes or mutates product state. Identity, wallet and org membership are
 * resolved SERVER-side; a caller can never prepare for another user or org.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAuthUser, jsonResponse, unauthorized } from "@/lib/api-auth.server";
import type { FlowAiActor } from "@/lib/ai/aiTypes";
import {
  ACTION_INTENT_TYPES,
  actionIntentSchema,
  type ActionIntentType,
} from "@/lib/ai/actionIntent";
import {
  prepareActionIntent,
  revalidateActionIntent,
} from "@/lib/ai/intentPrepare.server";

async function resolveContext(request: Request): Promise<
  | { ok: false }
  | { ok: true; actor: FlowAiActor; wallet: string | null }
> {
  const user = await getAuthUser(request);
  if (!user) return { ok: false };

  let orgIds: string[] = [];
  let wallet: string | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: orgs }, { data: profile }] = await Promise.all([
      supabaseAdmin.from("partner_org_members").select("org_id").eq("user_id", user.id),
      supabaseAdmin.from("profiles").select("wallet_address").eq("id", user.id).maybeSingle(),
    ]);
    orgIds = (orgs ?? []).map((r: any) => String(r.org_id));
    const addr = (profile as any)?.wallet_address;
    wallet = typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null;
  } catch {
    /* degrade to no org / no wallet — policy will reject on-chain actions */
  }

  return {
    ok: true,
    actor: { userId: user.id, email: user.email, orgIds, isInternalOperator: false },
    wallet,
  };
}

export const Route = createFileRoute("/api/assistant/intent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await resolveContext(request);
        if (!ctx.ok) return unauthorized("Sign in before preparing an action.");

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid request body." }, 400);
        }

        // Revalidation path — always run immediately before wallet handoff.
        if (body.mode === "revalidate") {
          const parsed = actionIntentSchema.safeParse(body.intent);
          if (!parsed.success) return jsonResponse({ error: "Invalid intent envelope." }, 400);
          const result = await revalidateActionIntent({
            intent: parsed.data,
            actor: ctx.actor,
            actorWallet: ctx.wallet,
          });
          return jsonResponse({ ...result, executed: false });
        }

        const type = String(body.type ?? "") as ActionIntentType;
        if (!(ACTION_INTENT_TYPES as readonly string[]).includes(type)) {
          return jsonResponse({ error: "Unsupported action type." }, 400);
        }
        const chainId = Number(body.chainId);
        if (!Number.isInteger(chainId)) {
          return jsonResponse({ error: "A supported chain id is required." }, 400);
        }

        const prepared = await prepareActionIntent({
          type,
          chainId,
          parameters: (body.parameters ?? {}) as Record<string, unknown>,
          actor: ctx.actor,
          actorWallet: ctx.wallet,
          organizationId: body.organizationId ? String(body.organizationId) : null,
          sourceEvidenceRefs: Array.isArray(body.sourceEvidenceRefs)
            ? body.sourceEvidenceRefs.slice(0, 24).map(String)
            : [],
          requested: {
            userId: body.requestedUserId ? String(body.requestedUserId) : null,
            wallet: body.requestedWallet ? String(body.requestedWallet) : null,
            orgId: body.organizationId ? String(body.organizationId) : null,
          },
        });

        if (!prepared.ok) return jsonResponse({ error: prepared.error }, 400);
        return jsonResponse(prepared.response);
      },
    },
  },
});
