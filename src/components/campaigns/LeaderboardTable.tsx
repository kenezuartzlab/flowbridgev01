/** Growth Hub V3 — public Campaign PTS leaderboard rows. Presentation only. */
import { Crown } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/campaign/participantApi";
import { shortWallet } from "./campaignPresentation";

export function LeaderboardTable({
  rows,
  wallet,
}: {
  rows: LeaderboardEntry[];
  wallet?: string | null;
}) {
  const mine = wallet ? wallet.toLowerCase() : null;
  return (
    <ol className="space-y-1.5">
      {rows.map((row) => {
        const isMine = mine === row.wallet.toLowerCase();
        return (
          <li
            key={row.wallet}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${
              isMine
                ? "border-primary/45 bg-primary/10"
                : "border-hairline bg-card-alt"
            }`}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-foreground/8 font-mono text-[10px] font-black tabular-nums">
              {row.rank <= 3 ? (
                <Crown className="h-3.5 w-3.5 text-primary" aria-hidden />
              ) : (
                row.rank
              )}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-black">
              {shortWallet(row.wallet)}
              {isMine && (
                <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
                  You
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[11px] font-black tabular-nums text-primary">
              {row.campaignPoints.toLocaleString("en-US")} PTS
            </span>
          </li>
        );
      })}
    </ol>
  );
}
