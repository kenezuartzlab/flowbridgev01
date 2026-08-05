import { useState } from "react";
import { Check, ExternalLink, Heart, Loader2 } from "lucide-react";
import { getIdToken } from "@/lib/auth";

const SOCIAL_LINKS = {
  youtube: "https://youtube.com/@flowbridgeweb3",
  x: "https://x.com/flowbridgeweb3",
  telegram: "https://t.me/flowbridgeweb3",
} as const;

type Channel = keyof typeof SOCIAL_LINKS;

const LABELS: Record<Channel, string> = {
  youtube: "YouTube",
  x: "X / Twitter",
  telegram: "Telegram",
};

/**
 * Social task portal — open each official channel, then confirm the handle.
 * Presentational wrapper around the existing /api/users/socials endpoint.
 */
export function SocialTasksCard({
  socials,
  onDone,
  signedIn = true,
}: {
  socials?: Record<string, any> | null;
  onDone?: () => void | Promise<void>;
  signedIn?: boolean;
}) {
  const [handles, setHandles] = useState<Record<Channel, string>>({ youtube: "", x: "", telegram: "" });
  const [opened, setOpened] = useState<Record<Channel, boolean>>({ youtube: false, x: false, telegram: false });
  const [busy, setBusy] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doneCount = (["youtube", "x", "telegram"] as const).filter((c) => !!socials?.[c]).length;

  const confirm = async (channel: Channel) => {
    setError(null);
    if (!opened[channel] && !socials?.[channel]) {
      setError(`Open and follow ${LABELS[channel]} first, then confirm your handle.`);
      return;
    }
    const handle = handles[channel].trim();
    if (!handle) {
      setError(`Enter your ${LABELS[channel]} handle (e.g. @yourname).`);
      return;
    }
    setBusy(channel);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Sign in again to confirm follows.");
      const res = await fetch("/api/users/socials", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel, handle }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Could not save handle.");
      await onDone?.();
    } catch (e: any) {
      setError(e?.message ?? "Network error saving handle.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="social-tasks" className="scroll-mt-20 rounded-2xl border border-hairline bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 text-primary" />
          <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">Social Tasks</h2>
        </div>
        <span className="font-mono text-[10px] font-black tabular-nums text-muted">{doneCount} / 3 done</span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Follow all three official channels and confirm your handle — required before you can claim FLOW.
      </p>

      <ul className="mt-3 space-y-2">
        {(["youtube", "x", "telegram"] as const).map((ch) => {
          const done = !!socials?.[ch];
          const saved = socials?.[`${ch}Handle`] as string | undefined;
          return (
            <li
              key={ch}
              className={`flex flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:items-center ${
                done ? "border-success/30 bg-success/8" : "border-hairline bg-card-alt"
              }`}
            >
              <a
                href={SOCIAL_LINKS[ch]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpened((v) => ({ ...v, [ch]: true }))}
                className={`flex min-h-[38px] shrink-0 items-center justify-between gap-2 rounded-lg px-3 font-mono text-[11px] font-black uppercase tracking-[0.08em] sm:w-40 ${
                  done ? "bg-success/15 text-success" : "bg-primary/12 text-primary"
                }`}
              >
                <span className="truncate">{LABELS[ch]}</span>
                {done ? <Check className="h-4 w-4 shrink-0" /> : <ExternalLink className="h-3.5 w-3.5 shrink-0" />}
              </a>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="text"
                  inputMode="text"
                  placeholder={saved ? `@${saved}` : "@yourhandle"}
                  value={handles[ch]}
                  onChange={(e) => setHandles((h) => ({ ...h, [ch]: e.target.value }))}
                  disabled={!signedIn}
                  className="min-w-0 flex-1 rounded-lg border border-hairline bg-background px-2.5 py-2 font-mono text-[12px] outline-none focus:border-primary/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void confirm(ch)}
                  disabled={!signedIn || busy === ch}
                  className="grid min-h-[36px] shrink-0 place-items-center rounded-lg bg-primary px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground disabled:opacity-50"
                >
                  {busy === ch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? "Update" : "Confirm"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? <p className="mt-2 font-mono text-[10.5px] text-danger">{error}</p> : null}
    </section>
  );
}
