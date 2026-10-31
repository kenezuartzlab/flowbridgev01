/** The ranking page shows one live period only: no Weekly/Monthly switching. */
import { describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/ecosystem-ranking";

const data = {
  rankType: "weekly" as const,
  periodStart: "2026-10-27",
  periodEnd: "2026-11-02",
  list: [{ rankNo: 19, projectId: 919, projectName: "FlowBridge", logoUrl: "", voteCount: 140 }],
  flowbridge: { weeklyRankNo: 19, monthlyRankNo: 22, weeklyVoteCount: 140, monthlyVoteCount: 400, logoUrl: null },
};

describe("ecosystem ranking page", () => {
  it("loads exactly one period view (weekly), never a monthly one", async () => {
    const ensureQueryData = vi.fn(async (opts: { queryKey: unknown }) => {
      if (opts.queryKey[1] !== "weekly") throw new Error(`unexpected period ${String(opts.queryKey[1])}`);
      return data;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Route as any).options.loader({ context: { queryClient: { ensureQueryData } } });
    expect(ensureQueryData).toHaveBeenCalledTimes(1);
    expect(ensureQueryData.mock.calls[0][0]).toMatchObject({ queryKey: ["ecosystem-ranking", "weekly"] });
  });
});
