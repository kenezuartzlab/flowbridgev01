import { useState } from "react";
import { Check, Copy, ExternalLink, Share2, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  address?: string;
}

export function ReceiveModal({ isOpen, onClose, address }: Props) {
  const [copied, setCopied] = useState(false);
  if (!isOpen || !address) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const share = async () => {
    try {
      await navigator.share?.({ title: "My BOT Chain address", text: address });
    } catch {
      /* share cancelled or unsupported */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur-md sm:items-center">
      <div className="fb-surface w-full max-w-[420px] p-4">
        <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
          <p className="fb-eyebrow">Receive on BOT Chain</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receive dialog"
            className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 pt-3">
          <p className="font-mono text-[10.5px] leading-relaxed text-muted">
            Only send BOT Chain (chain ID 677) assets to this address. Tokens sent from other
            networks without bridging will be lost.
          </p>

          <p className="fb-inset break-all px-3 py-3 font-mono text-[12px] font-black">{address}</p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="fb-glow inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-primary px-3 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => void share()}
              className="fb-inset inline-flex min-h-[42px] items-center justify-center gap-1.5 px-3 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-muted"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          </div>

          <a
            href={`https://scan.botchain.ai/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10.5px] font-black uppercase tracking-[0.08em] text-primary"
          >
            View on explorer <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
