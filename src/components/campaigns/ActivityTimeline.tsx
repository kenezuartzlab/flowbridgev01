/** Growth Hub V3 — verified activity timeline. Presentation only. */
import { useState } from "react";
import { ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import type { ParticipantActivity } from "@/lib/campaign/participantApi";
import { chainName } from "./campaignPresentation";
import {
  activityKindLabel,
  activityStatusLabel,
  formatAmountRaw,
  formatDateTime,
  shortHash,
  txExplorerUrl,
} from "./activityPresentation";
import { ChainChip, PointsChip, StatusPill } from "./CampaignBits";

export function ActivityTimeline({ items }: { items: ParticipantActivity[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={`${item.activityId}`}>
          <ActivityRow item={item} />
        </li>
      ))}
    </ul>
  );
}

function ActivityRow({ item }: { item: ParticipantActivity }) {
  const [open, setOpen] = useState(false);
  const explorer = txExplorerUrl(item.sourceChainId, item.sourceTxHash);
  const amount = formatAmountRaw(item.amountRaw, item.sourceChainId);
  const verified = item.status.toLowerCase() === "confirmed";

  return (
    <div className="fb-surface p-3 sm:p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone={verified ? "done" : "neutral"}>
              <ShieldCheck className="h-3 w-3" aria-hidden />
              {activityStatusLabel(item.status)}
            </StatusPill>
            <span className="truncate font-mono text-[11px] font-black uppercase tracking-[0.08em]">
              {activityKindLabel(item.kind)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ChainChip>{chainName(item.sourceChainId)}</ChainChip>
            <span aria-hidden className="font-mono text-[9px] text-muted">→</span>
            <ChainChip>{chainName(item.destinationChainId)}</ChainChip>
            {amount && (
              <span className="font-mono text-[10px] font-black tabular-nums text-muted">
                {amount} USDT
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.campaignPoints > 0 && <PointsChip value={item.campaignPoints} />}
          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
            {formatDateTime(item.occurredAt)}
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        {explorer ? (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-mono text-[10px] font-black text-primary underline-offset-4 hover:underline"
          >
            {shortHash(item.sourceTxHash)}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : (
          <span className="font-mono text-[10px] text-muted">{shortHash(item.sourceTxHash)}</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex min-h-[30px] items-center gap-1 rounded-xl border border-hairline px-2.5 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground"
        >
          Details
          <ChevronDown
            className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {open && (
        <dl className="mt-2.5 grid gap-1.5 border-t border-hairline pt-2.5 font-mono text-[10px] sm:grid-cols-2">
          <Detail label="Source log index" value={String(item.sourceLogIndex)} />
          <Detail label="Observed" value={formatDateTime(item.observedAt)} />
          <Detail label="Task" value={item.taskId ?? "Not linked"} />
          <Detail
            label="Destination"
            value="Source-chain verification only — destination delivery is tracked separately"
          />
        </dl>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
