import { trackActivation } from "@/lib/growth/activationAnalytics";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Wallet } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { getIdToken } from "@/lib/auth";
import { buildWalletChoices } from "@/lib/wallet/connectorChoices";
import { WALLETCONNECT_ENABLED } from "@/lib/wallet/walletConnectFlag";
import { verifyAndBindWallet } from "@/lib/wallet/bindWallet";
import { walletErrorMessage } from "@/lib/wallet/walletErrors";

/**
 * Wallet binding — V34.2 Verify & Bind.
 *
 * Connecting and binding are separate steps. Binding signs one free,
 * human-readable ownership message (no gas, approval or transaction); the
 * server verifies it and returns the canonical bound wallet. Success is only
 * ever reported from that server value.
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
  const [why, setWhy] = useState(false);

  const done = !!boundAddress;
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const choices = useMemo(() => buildWalletChoices(connectors, WALLETCONNECT_ENABLED), [connectors]);
  const sameAsBound = done && address && boundAddress!.toLowerCase() === address.toLowerCase();

  // Never carry one wallet's binding messages into another wallet.
  useEffect(() => {
    setError(null);
    setOk(null);
  }, [address]);

  const bind = async () => {
    if (busy) return; // double-submit guard; the server nonce is single-use too
    setError(null);
    setOk(null);
    if (!address) {
      setError("Connect the wallet you want to bind first.");
      return;
    }
    setBusy(true);
    trackActivation("WALLET_BINDING_STARTED");
    try {
      const token = await getIdToken();
      const { supabase } = await import("@/integrations/supabase/client");
      const userId = (await supabase.auth.getSession()).data.session?.user.id;
      if (!token || !userId) throw new Error("Sign in again to bind your wallet.");
      const r = await verifyAndBindWallet({
        address,
        userId,
        token,
        signMessage: (message) => signMessageAsync({ message }),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOk("Wallet verified and bound.");
      trackActivation("WALLET_BOUND_OBSERVED");
      await onDone?.();
    } catch (e) {
      setError(e instanceof Error && /Sign in/.test(e.message) ? e.message : walletErrorMessage(e, "sign"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="bind-wallet" className="scroll-mt-20 rounded-2xl border border-hairline bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">Wallet</h2>
        </div>
        <span
          className={`font-mono text-[10px] font-black uppercase tracking-[0.08em] ${done ? "text-success" : "text-muted"}`}
        >
          {done ? "Verified · Bound" : isConnected ? "Connected · Not bound" : "Not connected"}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Verify your wallet to keep your rewards linked to you and unlock personalized FlowBridge
        features.
      </p>

      <div
        className={`mt-3 flex flex-col gap-2 rounded-xl border p-2.5 ${
          done ? "border-success/30 bg-success/8" : "border-hairline bg-card-alt"
        }`}
      >
        <span className="min-w-0 font-mono text-[11.5px] font-black tracking-[0.04em]">
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
          sameAsBound ? null : (
            <button
              type="button"
              onClick={() => void bind()}
              disabled={!signedIn || busy}
              className="grid min-h-[40px] place-items-center rounded-lg bg-primary px-3 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? "Verify & rebind wallet" : "Verify & bind wallet"}
            </button>
          )
        ) : choices.length === 0 ? (
          <p className="text-[11.5px] text-muted">
            No wallet found. Open FlowBridge in your wallet app's browser, or install a browser wallet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <button
                key={c.connector.uid ?? c.connector.id}
                type="button"
                onClick={() =>
                  connect(
                    { connector: c.connector },
                    { onError: (e) => setError(walletErrorMessage(e, "connect")) },
                  )
                }
                disabled={connecting}
                className="flex min-h-[38px] items-center gap-1.5 rounded-lg bg-primary/12 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary disabled:opacity-50"
              >
                {c.connector.icon ? <img src={c.connector.icon} alt="" className="h-4 w-4 rounded" /> : null}
                {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Connect ${c.label}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setWhy((v) => !v)}
        className="mt-2 font-mono text-[10.5px] font-bold text-primary underline-offset-2 hover:underline"
        aria-expanded={why}
      >
        Why do I need this?
      </button>
      {why ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11.5px] leading-relaxed text-muted">
          <li>Proves you control this wallet.</li>
          <li>Protects your rewards so only you can claim them.</li>
          <li>Costs no gas and is not a blockchain transaction.</li>
          <li>Does not move funds or approve tokens.</li>
        </ul>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-soft">
        Connecting a wallet never asks for a signature. Wallet verification does not verify your email
        or make you reward-eligible on its own.
      </p>

      {error ? <p className="mt-2 font-mono text-[10.5px] text-danger">{error}</p> : null}
      {ok ? <p className="mt-2 font-mono text-[10.5px] text-success">{ok}</p> : null}
    </section>
  );
}
