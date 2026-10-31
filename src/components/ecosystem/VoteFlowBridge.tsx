/** In-app vote for FlowBridge: user's own wallet signs BOT Chain's official vote(919) on BOT Mainnet. */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Wallet } from "lucide-react";
import { createPublicClient, encodeFunctionData, http, type Hex } from "viem";
import { botMainnet } from "@/lib/wagmi";
import { getActiveProvider } from "@/lib/wallet/activeProvider";
import { FLOWBRIDGE_PROJECT_ID } from "@/lib/ecosystem/ranking.functions";
import { VOTE_ABI, VOTE_CONTRACT, cooldownLeft, fmtCountdown } from "@/lib/ecosystem/vote";

const HEX_CHAIN = `0x${botMainnet.id.toString(16)}`;
const EXPLORER = botMainnet.blockExplorers.default.url;
type Phase = "idle" | "connecting" | "signing" | "pending" | "done";

export function VoteFlowBridge({ onVoted }: { onVoted?: () => void }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const client = createPublicClient({ chain: botMainnet, transport: http() });

  const readCooldown = useCallback(async (addr: string) => {
    const a = addr as Hex;
    const [wl, next, block] = await Promise.all([
      client.readContract({ address: VOTE_CONTRACT, abi: VOTE_ABI, functionName: "whitelist", args: [a] }),
      client.readContract({ address: VOTE_CONTRACT, abi: VOTE_ABI, functionName: "nextVoteAt", args: [a] }),
      client.getBlock({ blockTag: "latest" }),
    ]);
    const l = Number(cooldownLeft(wl, next, block.timestamp));
    setLeft(l);
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void getActiveProvider()
      .then((eth: any) => (eth ? eth.request({ method: "eth_accounts" }) : null))
      .then((a: string[] | null) => { if (a?.[0]) setWallet(a[0].toLowerCase()); })
      .catch(() => undefined);
  }, []);

  useEffect(() => { if (wallet) void readCooldown(wallet).catch(() => undefined); }, [wallet, readCooldown]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const vote = async () => {
    setError(null);
    try {
      const eth = (await getActiveProvider()) as any;
      if (!eth) throw new Error("No wallet found. Open FlowBridge in your wallet app's browser (e.g. TokenPocket).");
      setPhase("connecting");
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      const from = accounts?.[0]?.toLowerCase();
      if (!from) throw new Error("No wallet account connected.");
      setWallet(from);
      if ((await eth.request({ method: "eth_chainId" })) !== HEX_CHAIN) {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HEX_CHAIN }] });
        if ((await eth.request({ method: "eth_chainId" })) !== HEX_CHAIN) throw new Error("Switch your wallet to BOT Mainnet.");
      }
      if ((await readCooldown(from)) > 0) { setPhase("idle"); return; }
      const args = [BigInt(FLOWBRIDGE_PROJECT_ID)] as const;
      await client.simulateContract({ address: VOTE_CONTRACT, abi: VOTE_ABI, functionName: "vote", args, account: from as Hex });
      setPhase("signing");
      const data = encodeFunctionData({ abi: VOTE_ABI, functionName: "vote", args });
      const h = (await eth.request({ method: "eth_sendTransaction", params: [{ from, to: VOTE_CONTRACT, data, value: "0x0" }] })) as string;
      setHash(h);
      setPhase("pending");
      const r = await client.waitForTransactionReceipt({ hash: h as Hex, timeout: 180_000 });
      if (r.status !== "success") throw new Error("Vote transaction failed on chain. No vote was counted.");
      setPhase("done");
      await readCooldown(from).catch(() => undefined);
      onVoted?.();
    } catch (e: any) {
      setPhase("idle");
      const msg = String(e?.shortMessage ?? e?.message ?? "");
      if (e?.code === 4001 || /reject|denied|cancel/i.test(msg)) setError("You cancelled the vote in your wallet.");
      else if (/VoteCooldownActive/i.test(msg)) { setError("You've already voted recently."); if (wallet) void readCooldown(wallet); }
      else setError(msg || "Vote could not be sent.");
    }
  };

  const busy = phase === "connecting" || phase === "signing" || phase === "pending";
  const cooling = left > 0 && !busy;
  const label = phase === "connecting" ? "Connecting wallet…" : phase === "signing" ? "Confirm in your wallet…"
    : phase === "pending" ? "Recording your vote…" : cooling ? `Next vote in ${fmtCountdown(left)}`
    : wallet ? "Vote for FlowBridge" : "Connect wallet & vote";

  return (
    <div className="space-y-2">
      {phase === "done" && (
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4" />Vote counted — thank you!</p>
      )}
      <button type="button" onClick={vote} disabled={busy || cooling}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground shadow-lg disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : !wallet ? <Wallet className="h-4 w-4" /> : null}
        {label}
      </button>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
      {hash && (
        <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs text-primary">
          View transaction <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Free vote · you only pay a small BOT network fee. One vote every 6 hours per wallet.
      </p>
    </div>
  );
}
