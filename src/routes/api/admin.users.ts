import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Super-admin-only management of app_admins. The owner account can never be
// removed, disabled or demoted, and an admin cannot change their own row.
const OWNER = "kenezuartzlab@gmail.com";
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const roleSchema = z.enum(["super_admin", "internal_operator"]);

async function gateSuper(request: Request) {
  const { requireAdmin } = await import("@/lib/admin/adminGate.server");
  const { jsonResponse } = await import("@/lib/api-auth.server");
  const gate = await requireAdmin(request);
  if (!gate.ok) return { error: gate.response } as const;
  if (gate.admin.role !== "super_admin") {
    return { error: jsonResponse({ error: "Super admin access required" }, 403) } as const;
  }
  return { admin: gate.admin, jsonResponse } as const;
}

async function audit(actor: { userId: string; email: string; role: string }, email: string, action: string, oldV: unknown, newV: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_events").insert({
    actor_user_id: actor.userId, actor_email: actor.email, actor_role: actor.role,
    object_type: "app_admin", object_id: email, action,
    old_value: (oldV ?? null) as any, new_value: (newV ?? null) as any,
  });
}

function protectedTarget(email: string, self: string) {
  if (email === OWNER) return "The owner super admin cannot be changed.";
  if (email === self) return "You cannot change your own admin access.";
  return null;
}

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await gateSuper(request);
        if ("error" in g) return g.error;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("app_admins").select("email,role,disabled,created_at").order("created_at");
        if (error) return g.jsonResponse({ error: error.message }, 500);
        return g.jsonResponse({ admins: data, owner: OWNER });
      },
      POST: async ({ request }) => {
        const g = await gateSuper(request);
        if ("error" in g) return g.error;
        const p = z.object({ email: emailSchema, role: roleSchema }).safeParse(await request.json().catch(() => null));
        if (!p.success) return g.jsonResponse({ error: "Enter a valid email and role." }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("app_admins").insert({ email: p.data.email, role: p.data.role });
        if (error) return g.jsonResponse({ error: error.code === "23505" ? "Already an admin." : error.message }, 400);
        await audit(g.admin, p.data.email, "ADD", null, p.data);
        return g.jsonResponse({ success: true });
      },
      PATCH: async ({ request }) => {
        const g = await gateSuper(request);
        if ("error" in g) return g.error;
        const p = z.object({ email: emailSchema, role: roleSchema.optional(), disabled: z.boolean().optional() })
          .safeParse(await request.json().catch(() => null));
        if (!p.success) return g.jsonResponse({ error: "Invalid update." }, 400);
        const block = protectedTarget(p.data.email, g.admin.email);
        if (block) return g.jsonResponse({ error: block }, 403);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: old } = await supabaseAdmin.from("app_admins").select("role,disabled").eq("email", p.data.email).maybeSingle();
        if (!old) return g.jsonResponse({ error: "Not found." }, 404);
        const patch: { role?: string; disabled?: boolean } = {};
        if (p.data.role) patch.role = p.data.role;
        if (p.data.disabled !== undefined) patch.disabled = p.data.disabled;
        const { error } = await supabaseAdmin.from("app_admins").update(patch).eq("email", p.data.email);
        if (error) return g.jsonResponse({ error: error.message }, 500);
        await audit(g.admin, p.data.email, "UPDATE", old, patch);
        return g.jsonResponse({ success: true });
      },
      DELETE: async ({ request }) => {
        const g = await gateSuper(request);
        if ("error" in g) return g.error;
        const p = z.object({ email: emailSchema }).safeParse(await request.json().catch(() => null));
        if (!p.success) return g.jsonResponse({ error: "Invalid email." }, 400);
        const block = protectedTarget(p.data.email, g.admin.email);
        if (block) return g.jsonResponse({ error: block }, 403);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("app_admins").delete().eq("email", p.data.email);
        if (error) return g.jsonResponse({ error: error.message }, 500);
        await audit(g.admin, p.data.email, "DELETE", p.data, null);
        return g.jsonResponse({ success: true });
      },
    },
  },
});
