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
  showBanners: z.boolean(),
  maintenanceNotice: z.string().trim().max(300),
  showMarkets: z.boolean().optional(),
  showPartners: z.boolean().optional(),
  showGames: z.boolean().optional(),
  showAssistant: z.boolean().optional(),
  showActivity: z.boolean().optional(),
  swapEnabled: z.boolean().optional(),
  bridgeEnabled: z.boolean().optional(),
});

const socialSchema = z.object({
  x: z.string().trim().max(300),
  telegram: z.string().trim().max(300),
  youtube: z.string().trim().max(300),
  discord: z.string().trim().max(300),
  website: z.string().trim().max(300),
  docs: z.string().trim().max(300),
  supportEmail: z.string().trim().max(200),
});

const contentSchema = z.object({
  brandName: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(200),
  announcement: z.string().trim().max(300),
  announcementHref: z.string().trim().max(300),
  footerNote: z.string().trim().max(160),
});

const scheduleSchema = z
  .object({
    startAt: z.string().trim().max(40).nullable().optional(),
    endAt: z.string().trim().max(40).nullable().optional(),
    days: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  })
  .nullable()
  .optional();

const slideSchema = z.object({
  id: z.string().trim().max(64).optional(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(160).optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  href: z.string().trim().max(500).nullable().optional(),
  theme: z.enum(["swap", "bridge"]).optional(),
  isActive: z.boolean().optional(),
  layout: z.enum(["compact", "logo", "full"]).optional(),
  schedule: scheduleSchema,
});


const surfaceSchema = z.object({
  intervalMs: z.number().min(1500).max(60000),
  slides: z.array(slideSchema).max(12),
});

const bannersSchema = z.object({
  cabot: surfaceSchema,
  swap: surfaceSchema,
  bridge: surfaceSchema,
  home: surfaceSchema,
});

const partnerSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(120).optional(),
  category: z.string().trim().max(40).optional(),
  status: z.string().trim().max(40).optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  ctaLabel: z.string().trim().max(24).optional(),
  href: z.string().trim().max(500).nullable().optional(),
  about: z.string().trim().max(1200).optional(),
  totalRewards: z.string().trim().max(40).optional(),
  featured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  links: z
    .array(z.object({ label: z.string().trim().max(40), url: z.string().trim().max(500) }))
    .max(8)
    .optional(),
  campaigns: z
    .array(
      z.object({
        title: z.string().trim().max(80),
        reward: z.string().trim().max(60).optional(),
        href: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .max(12)
    .optional(),
});

const quickActionSchema = z.object({
  id: z.string().trim().max(64).optional(),
  label: z.string().trim().min(1).max(24),
  hint: z.string().trim().max(40).optional(),
  to: z.string().trim().min(1).max(300),
  hash: z.string().trim().max(60).nullable().optional(),
  iconKind: z.enum(["lucide", "kit", "image"]).optional(),
  icon: z.string().trim().max(60).optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  iconFit: z.enum(["contain", "cover"]).optional(),

  flag: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});

const heroSchema = z.object({
  eyebrow: z.string().trim().max(60).optional(),
  title: z.string().trim().max(60).optional(),
  subtitle: z.string().trim().max(160).optional(),
  gradientFrom: z.string().trim().max(40).nullable().optional(),
  gradientVia: z.string().trim().max(40).nullable().optional(),
  gradientTo: z.string().trim().max(40).nullable().optional(),
  backgroundImageUrl: z.string().trim().max(500).nullable().optional(),
  backgroundOpacity: z.number().min(0).max(100).optional(),
  artworkKind: z.enum(["kit", "image", "none"]).optional(),
  artworkName: z.string().trim().max(60).optional(),
  artworkUrl: z.string().trim().max(500).nullable().optional(),
  artworkSize: z.number().min(40).max(320).optional(),
  artworkOpacity: z.number().min(0).max(100).optional(),
});

const pageSchema = z.object({
  hero: heroSchema.optional(),
  labels: z.record(z.string().max(40), z.string().trim().max(120)).optional(),
});

const pagesSchema = z.record(z.string().max(40), pageSchema);

const bodySchema = z.object({
  pages: pagesSchema.optional(),
  fees: feesSchema.optional(),
  rewards: rewardsSchema.optional(),
  flags: flagsSchema.optional(),
  social: socialSchema.optional(),
  content: contentSchema.optional(),
  banners: bannersSchema.optional(),
  partners: z.array(partnerSchema).max(40).optional(),
  quickActions: z.array(quickActionSchema).max(16).optional(),
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
          for (const key of ["fees", "rewards", "flags", "social", "content", "banners", "partners", "quickActions", "pages"] as const) {
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
