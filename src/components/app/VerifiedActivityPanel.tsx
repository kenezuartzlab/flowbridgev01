/**
 * App Experience V6 — unified Activity: authoritative verified campaign
 * activity, kept as its own source next to local swap/bridge history.
 * Read-only via /api/campaigns/me. Never merged into a canonical record and
 * never exposes signatures, intents or debug fields.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { ActivityTimeline } from "@/components/campaigns/ActivityTimeline";
import { MetricStat } from "@/components/campaigns/CampaignBits";
import { getIdToken } from "@/lib/auth";
import {
  fetchParticipantMe,
  type ParticipantMeResponse,
} from "@/lib/campaign/participantApi";

export function VerifiedActivityPanel() {
  const [me, setMe] = useState<ParticipantMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = await fetchParticipantMe(token);
        if (!cancelled) setMe(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Verified activity unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="fb-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="fb-eyebrow">Verified campaign activity</p>
            <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
              Source: on-chain verification · separate from local history
            </p>
          </div>
        </div>
        <Link
          to="/campaigns/me"
          className="shrink-0 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
        >
          Details <ArrowUpRight className="inline h-3 w-3" aria-hidden />
        </Link>
      </div>

      {loading ? (
        <p className="px-4 py-4 font-mono text-[10.5px] text-muted">Loading verified activity…</p>
      ) : error ? (
        <p className="px-4 py-4 font-mono text-[10.5px] text-muted">{error}</p>
      ) : !me ? (
        <p className="px-4 py-4 font-mono text-[10.5px] text-muted">
          Verified activity unavailable.
        </p>
      ) : (
        <div className="space-y-3 px-4 py-3.5">
          <dl className="grid grid-cols-2 gap-2">
            <MetricStat label="Campaign PTS earned" value={me.campaignPointsTotal.toLocaleString("en-US")} />
            <MetricStat label="Verified items" value={String(me.activity.length)} />
          </dl>
          {me.activity.length === 0 ? (
            <p className="font-mono text-[10.5px] leading-relaxed text-muted">
              No verified campaign activity yet. Bridge activity appears here once the trusted
              verifier confirms it on the source chain.
            </p>
          ) : (
            <ActivityTimeline items={me.activity.slice(0, 6)} />
          )}
        </div>
      )}
    </section>
  );
}
