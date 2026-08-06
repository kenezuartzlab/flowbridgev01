// Server-only: reads/writes admin-published configuration with the service-role
// client. Never import from browser code.
import { DEFAULT_APP_CONFIG, mergeAppConfig, type AppConfig } from "@/lib/config/appConfig";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function readSettings(): Promise<Record<string, any>> {
  try {
    const db = await admin();
    const { data } = await db.from("app_settings").select("key, value");
    const out: Record<string, any> = {};
    (data ?? []).forEach((row: any) => {
      out[row.key] = row.value;
    });
    return out;
  } catch {
    return {};
  }
}

export async function readPublishedTokens(): Promise<any[]> {
  try {
    const db = await admin();
    const { data } = await db
      .from("swap_tokens")
      .select("id, chain, address, symbol, name, decimals, logo_url, router_id, liquidity_verified, is_active, sort_order")
      .order("sort_order", { ascending: true });
    return data ?? [];
  } catch {
    return [];
  }
}

/** Full public config payload (settings + active tokens). */
export async function buildPublicConfig(): Promise<AppConfig> {
  const [settings, tokens] = await Promise.all([readSettings(), readPublishedTokens()]);
  return mergeAppConfig({
    fees: settings.fees,
    rewards: settings.rewards,
    flags: settings.flags,
    social: settings.social,
    content: settings.content,
    banners: settings.banners,
    partners: settings.partners,
    quickActions: settings.quickActions,

    tokens: tokens.filter((t: any) => t.is_active !== false),
  });
}


/** Server-side reward rules with safe defaults. */
export async function getRewardSettings() {
  const settings = await readSettings();
  return mergeAppConfig({ rewards: settings.rewards }).rewards;
}

export async function writeSetting(key: string, value: any, updatedBy?: string) {
  const db = await admin();
  const { error } = await db
    .from("app_settings")
    .upsert({ key, value, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export { DEFAULT_APP_CONFIG };
