import { useEffect, useRef, useState } from "react";
import { QrCode, X } from "lucide-react";

/** Pull an EVM address out of a raw QR payload (plain, EIP-681 or URL form). */
export function parseAddressFromQr(raw: string): string | null {
  const text = raw.trim();
  const match = text.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

function createDetector(): Detector | null {
  const Ctor = (globalThis as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/**
 * Camera QR scanner for recipient addresses. Uses the built-in BarcodeDetector
 * when the browser supports it and falls back to decoding a picked image.
 */
export function QrScanButton({ onResult }: { onResult: (address: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let raf = 0;
    const detector = createDetector();

    (async () => {
      if (!detector) {
        setError("This browser can't scan with the camera. Upload a QR image instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const tick = async () => {
          if (!alive || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const addr = found.map((f) => parseAddressFromQr(f.rawValue)).find(Boolean);
            if (addr) {
              onResult(addr);
              setOpen(false);
              return;
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setError("Camera permission denied. Upload a QR image instead.");
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onResult]);

  const pickImage = async (file: File) => {
    setError("");
    const detector = createDetector();
    if (!detector) {
      setError("QR decoding isn't supported in this browser — paste the address instead.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const found = await detector.detect(bitmap);
      const addr = found.map((f) => parseAddressFromQr(f.rawValue)).find(Boolean);
      if (addr) {
        onResult(addr);
        setOpen(false);
      } else {
        setError("No wallet address found in that image.");
      }
    } catch {
      setError("Could not read that image.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        aria-label="Scan recipient QR code"
        className="fb-inset grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:text-foreground"
      >
        <QrCode className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 p-3 backdrop-blur-md">
          <div className="fb-surface w-full max-w-[380px] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-black tracking-tight">Scan address</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close scanner"
                className="fb-inset grid h-9 w-9 place-items-center rounded-full text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="fb-inset mt-3 aspect-square overflow-hidden rounded-2xl">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full object-cover"
                aria-label="Camera preview"
              />
            </div>

            {error && (
              <p className="mt-2 text-[12px] font-semibold leading-relaxed text-muted">{error}</p>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickImage(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="fb-inset mt-3 min-h-[44px] w-full rounded-2xl px-3 text-[13px] font-black"
            >
              Upload QR image
            </button>
          </div>
        </div>
      )}
    </>
  );
}
