import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Share2, X } from "lucide-react";
import QRCode from "qrcode";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  address?: string;
}

export function ReceiveModal({ isOpen, onClose, address }: Props) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !address) return;
    let alive = true;
    QRCode.toDataURL(address, { margin: 1, width: 480, errorCorrectionLevel: "M" })
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => setQr(""));
    return () => {
      alive = false;
    };
  }, [isOpen, address]);

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
      <div className="fb-surface w-full max-w-[420px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-black tracking-tight">Receive</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receive dialog"
            className="fb-inset grid h-9 w-9 place-items-center rounded-full text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="fb-inset mt-4 space-y-4 rounded-3xl p-4 text-center">
          <div className="mx-auto w-full max-w-[240px] rounded-2xl bg-white p-3">
            {qr ? (
              <img src={qr} alt={`QR code for wallet address ${address}`} className="h-auto w-full" />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded-xl bg-black/10" />
            )}
          </div>

          <div className="space-y-1">
            <p className="fb-eyebrow">Your address</p>
            <p className="break-all font-mono text-[12px] font-bold leading-relaxed">{address}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="fb-glow inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 text-[13px] font-black text-primary-foreground"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={`https://scan.botchain.ai/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="fb-surface inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl px-3 text-[13px] font-black"
            >
              Explorer <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted hover:text-foreground"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share address
          </button>
        </div>

        <p className="mt-3 rounded-2xl border border-hairline px-3 py-2.5 text-[12px] font-semibold leading-relaxed text-muted">
          Only send BOT Chain (chain ID 677) assets to this address. Tokens sent from other networks
          without bridging will be lost.
        </p>
      </div>
    </div>
  );
}
