import { describe, expect, it } from "vitest";
import { analyticsToCsv, type AdminCampaignAnalytics } from "./campaignMetrics.server";

export const exportFixture: AdminCampaignAnalytics = {
  campaignId: "test", slug: "=1+1", name: '+SUM(1,2);"name"\n@A1', status: "draft",
  startsAt: "2026-10-24", endsAt: "2026-11-24", participants: 1, completions: 2,
  pointsAwarded: 1122, configuredPoints: 561, taskCount: 1, verifiedActivities: 2,
  completionRate: 1, tasks: [{ taskId: "@A1", title: "＝1+1", points: 561, completions: 2, participants: 1 }],
  series: [{ date: "2026-10-24", completions: 2, points: -74 }],
  recentCompletions: [{ wallet: "0x1234…abcd", taskId: "@A1", taskTitle: 'safe",=1\n+2', points: 74, completedAt: "2026-10-24", verified: true }],
};

describe("campaign CSV boundary", () => {
  it("protects campaign and task text without altering authoritative input", () => {
    const before = JSON.stringify(exportFixture);
    const csv = analyticsToCsv(exportFixture);
    expect(csv).toContain("summary,'=1+1,\"'+SUM(1,2);\"\"name\"\"\n@A1\",2,1,1122");
    expect(csv).toContain("task,'@A1,'＝1+1,2,1,1122");
    expect(csv).toContain("daily,2026-10-24,2026-10-24,2,,-74");
    expect(JSON.stringify(exportFixture)).toBe(before);
  });
});