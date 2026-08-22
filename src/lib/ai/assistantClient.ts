/**
 * Browser helper for Flow AI endpoints. Attaches the signed-in user's bearer
 * token so the SERVER can resolve identity and scopes — the client never claims
 * an identity itself.
 */
import { supabase } from "@/integrations/supabase/client";

export async function assistantFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("authorization", `Bearer ${token}`);
  } catch {
    /* anonymous is fine: public knowledge only */
  }
  return fetch(path, { ...init, headers });
}

export interface AssistantMemory {
  key: string;
  value: string;
  origin: string;
  promoted: boolean;
  updatedAt: string;
}
