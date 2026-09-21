import { useState } from "react";
import { Check, Loader2, Wallet } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { getIdToken } from "@/lib/auth";

/**
 * Wallet binding task — links the connected wallet to the signed-in email so
 * FLOW can be claimed.
 *
 * V30.2B P4A.2.1: binding requires proof of ownership. The wallet must sign a
 * single-use server challenge; the server verifies the signature, enforces
 * uniqueness and rebind limits, and returns the canonical bound address. The
 * card never reports success from local state — only from that server value.
 * Typing an address by hand can no longer bind it.
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
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const done = !!boundAddress;
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  const bind = async () => {
    setError(null);
    setOk(null);
    const candidate = (address ?? "").trim().toLowerCase();
    if (!candidate || !/^0x[a-f0-9]{40}$/.test(candidate)) {
      setError("Connect the wallet you want to bind — it has to sign the request itself.");
      return;
    }
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Sign in again to bind your wallet.");

      // 1. Single-use challenge from the server.
      const nonceRes = await fetch("/api/public/siwe/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: candidate }),
      });
      const nonceData = (await nonceRes.json().catch(() => null)) as { nonce?: string; error?: string } | null;
      if (!nonceRes.ok || !nonceData?.nonce) {
        throw new Error(nonceData?.error ?? "Could not start wallet verification.");
      }

      // 2. The wallet proves ownership.
      const message = [
        "FlowBridge wallet binding",
        `Wallet: ${candidate}`,
        "Chain ID: 677",
        `Nonce: ${nonceData.nonce}`,
        "Signing this only proves you control this wallet. It moves no funds.",
      ].join("\n");
      const signature = await signMessageAsync({ message });

      // 3. Server verifies, binds, and returns the canonical bound wallet.
      const res = await fetch("/api/users/bind-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          walletAddress: candidate,
          message,
          signature,
          nonce: nonceData.nonce,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; walletAddress?: string | null; error?: string }
        | null;
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Could not bind wallet.");
      if (!data.walletAddress || data.walletAddress.toLowerCase() !== candidate) {
        throw new Error("The server did not confirm this wallet — nothing was bound.");
      }
      setOk(`Wallet ${short(data.walletAddress)} is confirmed on your account.`);
      await onDone?.();
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? "Network error binding wallet.");
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
        Link the wallet you swap with to your account — required before you can claim rewards. The
        wallet signs a one-time message to prove it is yours. No funds move.
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
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : done ? (
              "Sign to rebind"
            ) : (
              "Sign to bind"
            )}
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

      <p className="mt-2 text-[11px] leading-relaxed text-muted-soft">
        Only a wallet that can sign can be bound, so an address typed by hand cannot be linked to
        your account. Connecting a wallet on its own never sends any transaction or approval.
      </p>

      {error ? <p className="mt-2 font-mono text-[10.5px] text-danger">{error}</p> : null}
      {ok ? <p className="mt-2 font-mono text-[10.5px] text-success">{ok}</p> : null}
    </section>
  );
}
