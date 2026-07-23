// Server-only helper: validates an incoming Bearer token against Supabase Auth
// and returns the authenticated user. Used by /api/* server route handlers.
import { createClient } from "@supabase/supabase-js";

export interface ApiUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

function getAuthClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(
    process.env.SUPABASE_URL!,
    key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    },
  );
}

export async function getAuthUser(request: Request): Promise<ApiUser | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const client = getAuthClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    emailVerified: !!data.user.email_confirmed_at,
  };
}

export function unauthorized(message = "Unauthorized") {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
