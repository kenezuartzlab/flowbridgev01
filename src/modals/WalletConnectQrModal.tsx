import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, ExternalLink, Loader2, X } from 'lucide-react';

type WalletConnectQrModalProps = {
  uri: string | null;
  isOpen: boolean;
  onClose: () => void;
};

export function WalletConnectQrModal({ uri, isOpen, onClose }: WalletConnectQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copy link');

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    setCopyLabel('Copy link');
    if (!isOpen || !uri) return;

    QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: {
        dark: '#010C1B',
        light: '#FFFFFF',
      },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, uri]);

  if (!isOpen || !uri) return null;

  const walletConnectLink = `https://link.walletconnect.com?uri=${encodeURIComponent(uri)}`;

  const copyUri = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopyLabel('Copied');
      window.setTimeout(() => setCopyLabel('Copy link'), 1600);
    } catch {
      setCopyLabel('Copy failed');
      window.setTimeout(() => setCopyLabel('Copy link'), 1600);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#010C1B]/92 backdrop-blur-md animate-fade-in font-sans">
      <div className="w-full max-w-[380px] rounded-[24px] bg-[#0D1C2A] border border-white/10 border-b-[5px] border-b-[#3B99FC] p-5 shadow-2xl text-[#F0F7F3] font-mono">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-white">WalletConnect</h3>
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#3B99FC] font-black">Scan or open in wallet</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#C5C1B9] hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close WalletConnect QR"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center gap-4">
          <div className="w-[260px] h-[260px] rounded-[20px] bg-white p-3 flex items-center justify-center shadow-[0_0_35px_rgba(59,153,252,0.22)]">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="WalletConnect QR code" className="w-full h-full object-contain" />
            ) : (
              <Loader2 className="w-9 h-9 text-[#010C1B] animate-spin" />
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-center text-[#C5C1B9] max-w-[300px]">
            Scan this QR using Trust Wallet, MetaMask, TokenPocket, Rainbow, or another WalletConnect wallet.
          </p>

          <div className="grid grid-cols-2 gap-2 w-full">
            <a
              href={walletConnectLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#3B99FC] hover:bg-[#2E82DD] text-white py-2.5 px-3 text-[11px] font-black uppercase tracking-widest transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Wallet
            </a>
            <button
              onClick={copyUri}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#010C1B] hover:bg-[#07172A] text-white border border-white/10 py-2.5 px-3 text-[11px] font-black uppercase tracking-widest transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copyLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}