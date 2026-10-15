import { useEffect, useState } from "react";
import officialLogo from "@/assets/bot-chain-official-wordmark.png.asset.json";
import { useSelectedNetwork } from "@/lib/network/networkSession";
import { headerNetworkLabel } from "@/lib/network/walletNetworkLabel";

/** V36.1 — follows the connected wallet's live chain (no provider needed). */
function useWalletChainId(): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    void Promise.all([import("@wagmi/core"), import("@/lib/wagmi")]).then(([core, w]) => {
      if (dead) return;
      const read = (a: { status: string; chainId?: number }) => setId(a.status === "connected" && a.chainId ? a.chainId : null);
      read(core.getAccount(w.wagmiConfig) as any);
      off = core.watchAccount(w.wagmiConfig, { onChange: (a: any) => read(a) });
    }).catch(() => undefined);
    return () => { dead = true; off?.(); };
  }, []);
  return id;
}

export function BotNetworkBadge({ isMainnet }: { isMainnet?: boolean }) {
  const [selectedMainnet] = useSelectedNetwork();
  const walletChainId = useWalletChainId();
  const n = headerNetworkLabel({ selectedMainnet: isMainnet ?? selectedMainnet, walletChainId });
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-1.5 py-1 text-[9px] font-bold leading-none ${n.mismatch ? "border-destructive/50 text-destructive" : "border-hairline text-muted"}`}
    aria-label={n.mismatch ? `Wallet on ${n.label}` : n.label} title={n.mismatch ? "Your wallet is connected to a different network than the one selected." : undefined}>
    {n.isBot && <span className="block h-3.5 w-3.5 shrink-0 overflow-hidden"><img src={officialLogo.url} alt="BOT Chain" className="h-3.5 w-[72px] max-w-none" /></span>}
    <span>{n.mismatch ? `Wallet: ${n.label}` : n.label}</span>
  </span>;
}
