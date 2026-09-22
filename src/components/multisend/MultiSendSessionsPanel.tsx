/**
 * FlowBridge MultiSend — grouped session receipts.
 *
 * One MultiSend operation is ONE session (one clientBatchId) that contains one
 * independent on-chain transaction per source wallet. This panel presents the
 * session as a single grouped receipt while preserving every underlying
 * transaction hash and its individual status.
 */
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { ExternalLink, Layers } from "lucide-react";

import { SectionHeader, StatusPill, Surface, toneForStatus } from "@/components/ui-kit/primitives";
import { networkForChain } from "@/lib/multisend/deployments";
import { loadSessions, sessionStatus } from "@/lib/multisend/session";
import { shortAddress } from "@/lib/multisend/qr";
import type { MultiSendSession } from "@/lib/multisend/types";

const MODE_LABEL: Record<MultiSendSession["mode"], string> = {
  "one-to-many": "Distribute",
  "many-to-one": "Consolidate",
  "many-to-many": "Advanced",
};

export function MultiSendSessionsPanel({ limit = 5 }: { limit?: number }) {
  const [sessions, setSessions] = useState<MultiSendSession[] | null>(null);

  // Sessions live in this device's storage; read after hydration only.
  useEffect(() => setSessions(loadSessions().slice(0, limit)), [limit]);

  if (!sessions || sessions.length === 0) return null;

  return (
    <Surface>
      <SectionHeader
        title="MultiSend sessions"
        hint="One session groups every wallet that signed for the same batch."
        badge={<StatusPill tone="neutral">This device</StatusPill>}
      />
      <div className="divide-y divide-hairline border-t border-hairline">
        {sessions.map((session) => {
          const network = networkForChain(session.chainId);
          const status = sessionStatus(session.receipts);
          const confirmed = session.receipts.filter((r) => r.status === "confirmed");
          const total = confirmed.reduce((sum, r) => sum + r.recipientsTotal, 0n);
          const fee = confirmed.reduce((sum, r) => sum + r.serviceFee, 0n);
          const recipients = session.receipts.reduce((sum, r) => sum + r.recipientCount, 0);
          const fmt = (v: bigint) => formatUnits(v, session.tokenDecimals);

          return (
            <div key={session.clientBatchId} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-black">
                  <Layers className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {MODE_LABEL[session.mode]} · {session.tokenSymbol}
                </span>
                <StatusPill tone={toneForStatus(status === "completed" ? "success" : status)}>
                  {status.replace(/-/g, " ")}
                </StatusPill>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div className="flex justify-between">
                  <dt className="text-muted">Network</dt>
                  <dd>{network?.label ?? `Chain ${session.chainId}`}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Source wallets</dt>
                  <dd>{session.receipts.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Recipients</dt>
                  <dd>{recipients}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Confirmed</dt>
                  <dd>
                    {fmt(total)} {session.tokenSymbol}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">FlowBridge fee</dt>
                  <dd>
                    {fmt(fee)} {session.tokenSymbol}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Fee rate</dt>
                  <dd>{(session.feeBps / 100).toFixed(2)}%</dd>
                </div>
              </dl>

              <p className="break-all font-mono text-[10px] text-muted">batch {session.clientBatchId}</p>

              <ul className="space-y-1">
                {session.receipts.map((receipt) => (
                  <li
                    key={`${session.clientBatchId}-${receipt.source}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-2 py-1.5 text-[10.5px]"
                  >
                    <span className="text-muted">
                      {shortAddress(receipt.source)} · {receipt.recipientCount} recipients
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold">{receipt.status.replace(/-/g, " ")}</span>
                      {receipt.txHash && network && (
                        <a
                          href={`${network.explorer}/tx/${receipt.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary"
                        >
                          tx <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}
