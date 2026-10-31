/** Read-only proxy for BOT Chain's public Ecosystem Ranking (their site forbids iframe embedding). */
import { createServerFn } from "@tanstack/react-start";

const BASE = "https://botadmin-public-api.botchain.ai/botadmin/ecosystem/votes";
export const FLOWBRIDGE_PROJECT_ID = 919;

export type RankType = "weekly" | "monthly";
export interface RankEntry { rankNo: number; projectId: number; projectName: string; logoUrl: string; voteCount: number }
export interface RankingData {
  rankType: RankType;
  periodStart: string | null;
  periodEnd: string | null;
  list: RankEntry[];
  flowbridge: { weeklyRankNo: number | null; monthlyRankNo: number | null; weeklyVoteCount: number | null; monthlyVoteCount: number | null; logoUrl: string | null } | null;
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`BOT Chain ranking unavailable (${r.status})`);
  const j = (await r.json()) as { code: number; data: any };
  if (j.code !== 0) throw new Error("BOT Chain ranking unavailable");
  return j.data;
}

const safeUrl = (u: unknown) => (typeof u === "string" && u.startsWith("https://") ? u : "");

export const getEcosystemRanking = createServerFn({ method: "GET" })
  .inputValidator((d: { rankType: RankType }) => ({ rankType: d?.rankType === "monthly" ? "monthly" : "weekly" }) as { rankType: RankType })
  .handler(async ({ data }): Promise<RankingData> => {
    const [rank, search] = await Promise.all([
      post("rankings", { rankType: data.rankType, page: 1, pageSize: 50 }),
      post("search", { keyword: "FlowBridge" }).catch(() => []),
    ]);
    const raw: any[] = Array.isArray(rank?.list) ? rank.list : [];
    const list: RankEntry[] = raw.map((e) => ({
      rankNo: Number(e.rankNo), projectId: Number(e.projectId), projectName: String(e.projectName ?? ""),
      logoUrl: safeUrl(e.logoUrl), voteCount: Number(e.voteCount ?? 0),
    }));
    const fb = (Array.isArray(search) ? search : []).find((p: any) => Number(p.projectId) === FLOWBRIDGE_PROJECT_ID);
    return {
      rankType: data.rankType,
      periodStart: raw[0]?.periodStart ?? null,
      periodEnd: raw[0]?.periodEnd ?? null,
      list,
      flowbridge: fb ? {
        weeklyRankNo: fb.weeklyRankNo ?? null, monthlyRankNo: fb.monthlyRankNo ?? null,
        weeklyVoteCount: fb.weeklyVoteCount ?? null, monthlyVoteCount: fb.monthlyVoteCount ?? null, logoUrl: safeUrl(fb.logoUrl) || null,
      } : null,
    };
  });
