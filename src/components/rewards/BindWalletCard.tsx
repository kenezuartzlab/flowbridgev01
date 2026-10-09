import { trackActivation } from "@/lib/growth/activationAnalytics";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Wallet } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { getIdToken } from "@/lib/auth";
import { buildWalletChoices } from "@/lib/wallet/connectorChoices";
import { WALLETCONNECT_ENABLED } from "@/lib/wallet/walletConnectFlag";
import { verifyAndBindWallet } from "@/lib/wallet/bindWallet";
import { walletErrorMessage } from "@/lib/wallet/walletErrors";
import { Button } from "@/components/ui/button";

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
  framed = true,
}: {
  boundAddress?: string | null;
  onDone?: () => void | Promise<void>;
  signedIn?: boolean;
  framed?: boolean;
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
  const sameAsBound = !!boundAddress && !!address && boundAddress.toLowerCase() === address.toLowerCase();

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
    <section id="bind-wallet" className={framed ? "scroll-mt-20 rounded-lg border border-hairline bg-card p-4" : "scroll-mt-20"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">{done ? 'Your bound wallet' : 'Bind your wallet'}</h2>
        </div>
        <span
          className={`font-mono text-[10px] font-black uppercase tracking-[0.08em] ${done ? "text-success" : "text-muted"}`}
        >
          {done ? "Verified · Bound" : isConnected ? "Connected · Not bound" : "Not connected"}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        {done ? 'This wallet is linked to your account.' : '1. Connect your wallet. 2. Tap Verify & Bind. 3. Confirm the free ownership signature in your wallet.'}
      </p>

      <div
        className={`mt-3 flex flex-col gap-2 rounded-xl border p-2.5 ${
          done ? "border-success/30 bg-success/8" : "border-hairline bg-card-alt"
        }`}
      >
        <span className="min-w-0 font-mono text-[11.5px] font-black tracking-[0.04em]">
          {boundAddress ? (
            <span className="flex items-center gap-1.5 text-success">
              <Check className="h-3.5 w-3.5 shrink-0" />
              {short(boundAddress)}
            </span>
          ) : isConnected && address ? (
            short(address)
          ) : (
            <span className="text-muted">No wallet connected</span>
          )}
        </span>

        {isConnected ? (
          sameAsBound ? null : (
            <Button
              type="button"
              onClick={() => void bind()}
              disabled={!signedIn || busy}
              className="h-auto min-h-[44px] whitespace-normal px-3 font-mono text-[10.5px] font-black uppercase"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? "Verify & rebind wallet" : "Verify & bind wallet"}
            </Button>
          )
        ) : choices.length === 0 ? (
          <p className="text-[11.5px] text-muted">
            No wallet found. Open FlowBridge in your wallet app's browser, or install a browser wallet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <Button
                key={c.connector.uid ?? c.connector.id}
                type="button"
                onClick={() =>
                  connect(
                    { connector: c.connector },
                    { onError: (e) => setError(walletErrorMessage(e, "connect")) },
                  )
                }
                disabled={connecting}
                variant="outline"
                className="h-auto min-h-[44px] max-w-full whitespace-normal px-3 font-mono text-[10px] font-black uppercase"
              >
                {c.connector.icon ? <img src={c.connector.icon} alt="" className="h-4 w-4 rounded" /> : null}
                {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Connect ${c.label}`}
              </Button>
            ))}
          </div>
        )}
      </div>

      {!isConnected && (
        <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted">
          <p>On a phone in Firefox, Chrome or Safari? Open this same page in your wallet app’s browser, sign in with the same account, then tap Verify & Bind. On a computer, use an installed wallet extension.</p>
          <Button variant="outline" className="min-h-[44px] w-full whitespace-normal text-xs" onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setOk('Page link copied. Open it in your wallet app’s browser.');
            } catch {
              setError('Copy the page address from your browser and open it in your wallet app’s browser.');
            }
          }}>Copy page link for wallet browser</Button>
        </div>
      )}

      <Button
        type="button"
        variant="link"
        onClick={() => setWhy((v) => !v)}
        className="mt-2 h-auto min-h-[40px] px-0 font-mono text-[10.5px] font-bold"
        aria-expanded={why}
      >
        Why do I need this?
      </Button>
      {why ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11.5px] leading-relaxed text-muted">
          <li>Proves you control this wallet.</li>
          <li>Protects your rewards so only you can claim them.</li>
          <li>Costs no gas and is not a blockchain transaction.</li>
          <li>Does not move funds or approve tokens.</li>
        </ul>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-soft">
        Free signature · No gas · No funds moved · No token approvals. Wallet verification does not verify your email
        or make you reward-eligible on its own.
      </p>

      {error ? <p className="mt-2 font-mono text-[10.5px] text-danger">{error}</p> : null}
      {ok ? <p className="mt-2 font-mono text-[10.5px] text-success">{ok}</p> : null}
    </section>
  );
}
