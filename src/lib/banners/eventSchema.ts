/**
 * Shared banner analytics payload contract (V30 §9/§10).
 *
 * The accepted surfaces are derived from BANNER_SURFACES so a real surface can
 * never be rejected as a bad request. Anonymous by design: the payload carries
 * no wallet, user id, reward entitlement or personal data.
 */
import { z } from "zod";
import { BANNER_SURFACES } from "@/lib/config/appConfig";

const surfaceSchema = z.enum(BANNER_SURFACES as [string, ...string[]]);

export const bannerEventsBodySchema = z.object({
  events: z
    .array(
      z.object({
        surface: surfaceSchema,
        slideId: z.string().trim().min(1).max(64),
        kind: z.enum(["impression", "click"]),
      }),
    )
    .min(1)
    .max(40),
});

export type BannerEventsBody = z.infer<typeof bannerEventsBodySchema>;
