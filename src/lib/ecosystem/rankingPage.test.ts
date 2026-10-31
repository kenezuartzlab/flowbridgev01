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
    const ensureQueryData = vi.fn(async (opts: { queryKey: [string, string] }) => {
      if (opts.queryKey[1] !== "weekly") throw new Error(`unexpected period ${opts.queryKey[1]}`);
      return data;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Route as any).options.loader({ context: { queryClient: { ensureQueryData } } });
    expect(ensureQueryData).toHaveBeenCalledTimes(1);
    expect(ensureQueryData.mock.calls[0][0]).toMatchObject({ queryKey: ["ecosystem-ranking", "weekly"] });
  });
});

import { cooldownLeft, fmtCountdown, VOTE_CONTRACT } from "@/lib/ecosystem/vote";
describe("in-app vote rules", () => {
  it("uses BOT Chain's official vote contract", () => {
    expect(VOTE_CONTRACT).toBe("0xF5b22756CbD9193CE6F349bbD1835c2e5a6Cb181");
  });
  it("blocks voting until the 6h cooldown passes", () => {
    expect(cooldownLeft(false, 1000n, 400n)).toBe(600n);
    expect(cooldownLeft(false, 1000n, 1000n)).toBe(0n);
    expect(cooldownLeft(true, 1000n, 400n)).toBe(0n);
    expect(fmtCountdown(6675)).toBe("01:51:15");
  });
});
