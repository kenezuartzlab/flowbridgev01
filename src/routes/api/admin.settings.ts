import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const feesSchema = z.object({
  defaultSlippagePct: z.number().min(0.01).max(50),
  maxSlippagePct: z.number().min(0.05).max(50),
  minBridgeUsd: z.number().min(0).max(100000),
});

const rewardsSchema = z.object({
  minUsd: z.number().min(0).max(100000),
  usdBlock: z.number().min(0.01).max(100000),
  pointsPerBlock: z.number().int().min(0).max(100000),
  referralClaimMinSwapUsd: z.number().min(0).max(1000000),
  claimThreshold: z.number().int().min(1).max(10000000),
  referralActivityPct: z.number().min(0).max(100).optional(),
});

const flagsSchema = z.object({
  limitTabPublic: z.boolean(),
  showBanners: z.boolean(),
  maintenanceNotice: z.string().trim().max(300),
});

const bodySchema = z.object({
  fees: feesSchema.optional(),
  rewards: rewardsSchema.optional(),
  flags: flagsSchema.optional(),
});

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const { buildPublicConfig } = await import("@/lib/appConfig.server");
        return jsonResponse(await buildPublicConfig());
      },

      PUT: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const body = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, 400);
        }

        const { writeSetting, buildPublicConfig } = await import("@/lib/appConfig.server");
        try {
          for (const key of ["fees", "rewards", "flags"] as const) {
            const value = parsed.data[key];
            if (value) await writeSetting(key, value, gate.admin.userId);
          }
          return jsonResponse({ success: true, config: await buildPublicConfig() });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to save settings" }, 500);
        }
      },
    },
  },
});
