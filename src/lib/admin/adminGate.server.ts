// Server-only admin gate: the ONLY place that decides who may change global
// config. Requires all of:
//   1. a valid Supabase bearer token,
//   2. a verified email present in public.app_admins,
//   3. the request's connected wallet (x-wallet-address) to equal the wallet
//      bound to that profile.
import { getAuthUser, jsonResponse } from "@/lib/api-auth.server";

export interface AdminContext {
  userId: string;
  email: string;
  wallet: string;
}

export type AdminGateResult = { ok: true; admin: AdminContext } | { ok: false; response: Response };

export async function requireAdmin(request: Request): Promise<AdminGateResult> {
  const user = await getAuthUser(request);
  if (!user) return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401) };
  if (!user.emailVerified) {
    return { ok: false, response: jsonResponse({ error: "Email not verified" }, 403) };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const email = user.email.toLowerCase();
  const { data: adminRow } = await supabaseAdmin
    .from("app_admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (!adminRow) return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("wallet_address")
    .eq("id", user.id)
    .maybeSingle();
  const bound = (profile?.wallet_address ?? "").toLowerCase();
  if (!bound) {
    return {
      ok: false,
      response: jsonResponse({ error: "Bind your admin wallet before using admin tools." }, 403),
    };
  }

  const presented = (request.headers.get("x-wallet-address") ?? "").toLowerCase().trim();
  if (!presented || presented !== bound) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Connect the wallet bound to this admin account to continue." },
        403,
      ),
    };
  }

  return { ok: true, admin: { userId: user.id, email, wallet: bound } };
}
