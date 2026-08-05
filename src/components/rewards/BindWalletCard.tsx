import { useState } from "react";
import { Check, Loader2, Wallet } from "lucide-react";
import { useAccount, useConnect } from "wagmi";
import { getIdToken } from "@/lib/auth";

/**
 * Wallet binding task — links the connected wallet to the signed-in email so
 * FLOW can be claimed. Presentational wrapper around /api/users/bind-wallet.
 */
export function BindWalletCard({
  boundAddress,
  onDone,
  signedIn = true,
}: {
  boundAddress?: string | null;
  onDone?: () => void | Promise<void>;
  signedIn?: boolean;
}) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const done = !!boundAddress;
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  const bind = async () => {
    setError(null);
    setOk(null);
    if (!address) {
      setError("Connect your wallet first, then bind it.");
      return;
    }
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Sign in again to bind your wallet.");
      const res = await fetch("/api/users/bind-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Could not bind wallet.");
      setOk("Wallet bound to your account.");
      await onDone?.();
    } catch (e: any) {
      setError(e?.message ?? "Network error binding wallet.");
    } finally {
      setBusy(false);
    }
  };

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <section id="bind-wallet" className="scroll-mt-20 rounded-2xl border border-hairline bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">Bind Wallet</h2>
        </div>
        <span
          className={`font-mono text-[10px] font-black uppercase tracking-[0.08em] ${
            done ? "text-success" : "text-muted"
          }`}
        >
          {done ? "Bound" : "Required"}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Link the wallet you swap with to your account — required before you can claim FLOW.
      </p>

      <div
        className={`mt-3 flex flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:items-center ${
          done ? "border-success/30 bg-success/8" : "border-hairline bg-card-alt"
        }`}
      >
        <span className="min-w-0 flex-1 font-mono text-[11.5px] font-black tracking-[0.04em]">
          {done ? (
            <span className="flex items-center gap-1.5 text-success">
              <Check className="h-3.5 w-3.5 shrink-0" />
              {short(boundAddress!)}
            </span>
          ) : isConnected && address ? (
            short(address)
          ) : (
            <span className="text-muted">No wallet connected</span>
          )}
        </span>

        {isConnected ? (
          <button
            type="button"
            onClick={() => void bind()}
            disabled={!signedIn || busy}
            className="grid min-h-[38px] shrink-0 place-items-center rounded-lg bg-primary px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? "Rebind" : "Bind wallet"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => injected && connect({ connector: injected })}
            disabled={connecting || !injected}
            className="grid min-h-[38px] shrink-0 place-items-center rounded-lg bg-primary/12 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect wallet"}
          </button>
        )}
      </div>

      {error ? <p className="mt-2 font-mono text-[10.5px] text-danger">{error}</p> : null}
      {ok ? <p className="mt-2 font-mono text-[10.5px] text-success">{ok}</p> : null}
    </section>
  );
}
