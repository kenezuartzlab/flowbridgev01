import { z } from "zod";

const httpsUrl = z.string().max(2000).refine((v) => { try { return new URL(v).protocol === "https:"; } catch { return false; } }, "Use a full HTTPS link");
export const launchEvidenceSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["launch_article", "launch_x", "x_post", "wallet", "transaction", "screenshot"]),
  url: z.union([httpsUrl, z.literal("")]),
  timestamp: z.union([z.string().datetime({ offset: true }), z.literal("")]),
  wallet: z.union([z.string().regex(/^0x[0-9a-fA-F]{40}$/), z.literal("")]),
  transactionHash: z.union([z.string().regex(/^0x[0-9a-fA-F]{64}$/), z.literal("")]),
  coreFunction: z.enum(["Trade", "Bridge", "MultiSend", "Staking", "Rewards", "Flow AI", "Other"]),
  notes: z.string().min(1).max(5000),
  screenshot: z.union([z.string().regex(/^launch-pre-day-0\/screenshots\/[0-9a-f-]+\.(png|jpg|webp)$/), z.literal("")]),
}).strict().superRefine((row, ctx) => {
  if (["launch_article", "launch_x", "x_post"].includes(row.kind) && (!row.url || !row.timestamp)) ctx.addIssue({ code: "custom", message: "Source URL and publication timestamp are required" });
  if (row.kind === "wallet" && !row.wallet) ctx.addIssue({ code: "custom", message: "Wallet evidence requires an address" });
  if (row.kind === "transaction" && !row.transactionHash) ctx.addIssue({ code: "custom", message: "Transaction evidence requires a hash" });
  if (row.kind === "screenshot" && !row.screenshot) ctx.addIssue({ code: "custom", message: "Upload a screenshot" });
});

export const launchTrackerSchema = z.object({
  version: z.literal(1),
  officialLaunchDate: z.null(),
  socialWindowStartedAt: z.null(),
  interactionWindowStartedAt: z.null(),
  day8Status: z.literal("NOT STARTED"),
  day30Status: z.literal("NOT STARTED"),
  evidence: z.array(launchEvidenceSchema).max(500),
}).strict();
export type LaunchEvidence = z.infer<typeof launchEvidenceSchema>;
export type LaunchTracker = z.infer<typeof launchTrackerSchema>;
export function emptyLaunchTracker(): LaunchTracker {
  return { version: 1, officialLaunchDate: null, socialWindowStartedAt: null, interactionWindowStartedAt: null, day8Status: "NOT STARTED", day30Status: "NOT STARTED", evidence: [] };
}
export const LAUNCH_TRACKER_PATH = "launch-pre-day-0/tracker-v1.json";