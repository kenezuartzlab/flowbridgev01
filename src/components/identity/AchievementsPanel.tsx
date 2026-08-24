/**
 * FlowBridge V29 §3 — achievements as recognition.
 *
 * Every unlocked item names the verified evidence behind it. The panel states
 * plainly that achievements do not add FLOW, FLOW Points or Campaign PTS.
 */
import { Lock, Medal } from "lucide-react";
import type { AchievementsView } from "@/lib/identity/achievements";

export function AchievementsPanel({
  achievements,
  className = "",
}: {
  achievements: AchievementsView;
  className?: string;
}) {
  return (
    <section className={`fb-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-black tracking-[-0.01em]">Achievements</h2>
        <span className="text-[11.5px] font-bold tabular-nums text-muted">
          {achievements.earnedCount}/{achievements.total}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{achievements.note}</p>

      <ul className="mt-3 space-y-2">
        {achievements.items.map((a) => (
          <li
            key={a.id}
            data-earned={a.earned ? "true" : "false"}
            className={`flex gap-2.5 rounded-[var(--fb-radius-md)] border p-2.5 ${
              a.earned ? "border-primary/35 bg-primary/8" : "border-hairline opacity-70"
            }`}
          >
            <span
              className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                a.earned ? "bg-primary/15 text-primary" : "bg-muted/15 text-muted"
              }`}
            >
              {a.earned ? (
                <Medal className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Lock className="h-3.5 w-3.5" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-tight">{a.title}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{a.body}</p>
              <p className="mt-0.5 text-[10.5px] text-muted">
                {a.earned ? "Verified: " : "Unlocks with: "}
                {a.evidence}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
