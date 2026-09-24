import { useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import type { MultiSendMode } from "@/lib/multisend/types";

const GUIDES: Record<MultiSendMode, { steps: string[]; example: string }> = {
  "one-to-many": {
    steps: [
      "Connect the wallet you are sending from and pick the network.",
      "Choose the token to send (only tokens you hold are listed).",
      "Add recipients: type them, paste rows, upload a CSV or scan a QR code.",
      "Set amounts — per row, Same amount, Equal split, or a % / MAX of your balance.",
      "Open Review, check totals, fee and gas, then sign one transaction.",
    ],
    example: "0xRecipientA,1.5\n0xRecipientB,2\n0xRecipientC,0.75",
  },
  "many-to-one": {
    steps: [
      "Enter the Destination wallet first — every source sends here.",
      "Choose the token and network.",
      "List the SOURCE wallets (the ones sending), not the destination. Format: source,amount.",
      "Addresses without amounts are fine — fill them in with Same amount afterwards.",
      "Review, then connect and sign with each source wallet in turn from the queue.",
    ],
    example: "0xSourceWallet1,1.5\n0xSourceWallet2,3\n0xSourceWallet3",
  },
  "many-to-many": {
    steps: [
      "Choose the token and network.",
      "Add rows with three columns: source, recipient, amount.",
      "Rows are grouped by source wallet — one transaction per source.",
      "Review every group, then sign each source wallet from the queue.",
      "Finished wallets are saved immediately; only failed or unsigned ones can be retried.",
    ],
    example: "0xSource1,0xRecipientA,1\n0xSource1,0xRecipientB,2\n0xSource2,0xRecipientA,0.5",
  },
};

export function MultiSendGuide({ mode }: { mode: MultiSendMode }) {
  const [open, setOpen] = useState(true);
  const g = GUIDES[mode];
  return (
    <div className="mx-4 mb-4 rounded-xl border border-hairline bg-foreground/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 p-3 text-left"
        aria-expanded={open}
      >
        <Lightbulb className="h-4 w-4 text-primary" />
        <span className="flex-1 text-[12px] font-black">How this works</span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <ol className="list-decimal space-y-1 pl-4 text-[11.5px] leading-snug text-muted">
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Paste example</p>
          <pre className="overflow-x-auto rounded-lg border border-hairline bg-card p-2 font-mono text-[10.5px]">
            {g.example}
          </pre>
        </div>
      )}
    </div>
  );
}
