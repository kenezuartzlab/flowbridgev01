/** Top 25 FlowBridge voters plus the connected wallet's votes and FLOW reward balance. */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { getActiveProvider } from "@/lib/wallet/activeProvider";
import { buildOwnershipMessage } from "@/lib/wallet/ownershipMessage";
import { signMessageWithActiveWallet } from "@/lib/walletVerification";
import { shortAddr } from "@/lib/ecosystem/voterRewards";
import { botMainnet } from "@/lib/wagmi";

type Mine = { rank: number | null; votes: number; earnedFlow: number; paidFlow: number; availableFlow: number; pending: { tx_hash: string | null } | null };
type Data = { top: { wallet: string; votes: number }[]; mine: Mine | null; halted: boolean; claimsOpen: boolean; minClaimFlow: number };
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const EXPLORER = botMainnet.blockExplorers.default.url;
const REASONS: Record<string, string> = {
  PAUSED: "Claims are paused right now.", BELOW_MINIMUM: "Your balance is below the minimum claim. Let it build up.",
  CLAIM_IN_PROGRESS: "Your previous claim is still processing.", BUSY: "Another payout is processing. Try again in a minute.",
  DAILY_CAP: "Today's payout limit was reached. Try again tomorrow.", PAYOUT_WALLET_EMPTY: "The reward wallet needs a refill. Try again later.",
  NOT_CONFIGURED: "Claims are not set up yet.", REVERTED: "The payout failed on chain. Your balance was kept.",
};

export function VoterRewards({ since, until, refreshKey }: { since?: string; until?: string; refreshKey?: number }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (w: string | null) => {
    const q = new URLSearchParams();
    if (since) q.set("since", since);
    if (until) q.set("until", until);
    if (w) q.set("wallet", w);
    const r = await fetch(`/api/public/voter-rewards?${q}`);
    if (r.ok) setData(await r.json());
  }, [since, until]);

  useEffect(() => {
    void getActiveProvider().then((eth: any) => eth?.request({ method: "eth_accounts" }))
      .then((a: string[] | undefined) => setWallet(a?.[0]?.toLowerCase() ?? null)).catch(() => undefined);
  }, []);
  useEffect(() => { void load(wallet); }, [wallet, load, refreshKey]);

  const claim = async () => {
    if (!wallet) return;
    setBusy(true); setMsg(null);
    try {
      const n = await fetch("/api/public/siwe/nonce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: wallet }) }).then((r) => r.json());
      if (!n?.nonce) throw new Error("Could not start the claim. Try again.");
      const message = buildOwnershipMessage({ address: wallet, nonce: n.nonce, domain: window.location.host, uri: window.location.origin, chainId: 677, issuedAt: new Date().toISOString() });
      const signature = await signMessageWithActiveWallet(wallet, message);
      const r = await fetch("/api/public/voter-rewards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: wallet, message, signature, nonce: n.nonce, chainId: 677 }) }).then((x) => x.json());
      if (r.ok) setMsg(r.status === "CONFIRMED" ? `${fmt(r.flow)} FLOW sent to your wallet.` : `${fmt(r.flow)} FLOW is on its way.`);
      else setMsg(r.error ?? REASONS[r.reason] ?? "Claim unavailable. Try again later.");
    } catch (e: any) {
      setMsg(e?.message ?? "Claim cancelled.");
    } finally { setBusy(false); void load(wallet); }
  };

  const mine = data?.mine;
  return (
    <section className="space-y-3">
      {mine && (
        <div className="fb-surface rounded-2xl border border-primary/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your FlowBridge votes</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-lg font-bold">{mine.votes}</p><p className="text-[11px] text-muted-foreground">Votes</p></div>
            <div><p className="text-lg font-bold">{mine.rank ? `#${mine.rank}` : "—"}</p><p className="text-[11px] text-muted-foreground">Voter rank</p></div>
            <div><p className="text-lg font-bold text-primary">{fmt(mine.availableFlow)}</p><p className="text-[11px] text-muted-foreground">FLOW to claim</p></div>
          </div>
          {mine.paidFlow > 0 && <p className="mt-2 text-center text-xs text-muted-foreground">Already paid: {fmt(mine.paidFlow)} FLOW</p>}
          <button type="button" onClick={claim} disabled={busy || !data?.claimsOpen || mine.availableFlow < (data?.minClaimFlow ?? 0) || mine.availableFlow <= 0 || !!mine.pending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mine.pending ? "Claim processing…" : `Claim ${fmt(mine.availableFlow)} FLOW`}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            You sign a message (free). FlowBridge sends the FLOW and pays the network fee.
            {data && data.minClaimFlow > 0 && ` Minimum ${fmt(data.minClaimFlow)} FLOW — smaller amounts keep adding up.`}
          </p>
          {mine.pending?.tx_hash && <a className="mt-1 block text-center text-xs text-primary underline" href={`${EXPLORER}/tx/${mine.pending.tx_hash}`} target="_blank" rel="noreferrer">View payout transaction</a>}
          {msg && <p className="mt-2 text-center text-sm">{msg}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-hairline p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Vote rewards:</span> when BOT Chain pays FlowBridge for its ranking, 50% goes back to voters — 25% shared by the Top 10, 25% shared by everyone else, by votes, paid in FLOW at the BOT price. Not guaranteed: it only happens if FlowBridge wins BOT rewards.
        </p>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Trophy className="h-5 w-5 text-primary" /> Top 25 FlowBridge voters</h2>
        {data?.halted && <p className="mb-2 text-xs text-destructive">Vote counting is paused while we check a change on BOT Chain.</p>}
        {!data ? <p className="text-sm text-muted-foreground">Loading voters…</p> : data.top.length === 0 ? <p className="text-sm text-muted-foreground">No votes yet this period. Be the first!</p> : (
          <ol className="space-y-1.5">
            {data.top.map((v, i) => (
              <li key={v.wallet} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${v.wallet === wallet ? "border-primary/60 bg-primary/10" : "border-hairline"}`}>
                <span className={`w-7 font-bold ${i < 10 ? "text-primary" : "text-muted-foreground"}`}>#{i + 1}</span>
                <span className="flex-1 font-mono">{shortAddr(v.wallet)}{v.wallet === wallet && " (you)"}</span>
                <span className="font-semibold">{v.votes} votes</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
