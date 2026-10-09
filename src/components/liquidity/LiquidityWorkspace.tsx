import { useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useSwitchChain } from "wagmi";
import { discoverPools, type DiscoveredPool } from "@/lib/swap/quoter";
import { getCuratedTokens } from "@/lib/swap/tokenRegistry";
import { LIQUIDITY_WRITES_ENABLED } from "@/lib/liquidity/liquidityTokens";
import { CASWAP_CAPABILITY_MATRIX } from "@/lib/liquidity/venues";
import { AddLiquidityPanel } from "./AddLiquidityPanel";
import { CreatePoolPanel } from "./CreatePoolPanel";
import { PositionsPanel } from "./PositionsPanel";
import { Notice, Segmented } from "./shared";

export type LiquidityTab = "pools" | "add" | "create" | "positions";

export function LiquidityWorkspace({ initialTab = "pools" }: { initialTab?: LiquidityTab }) {
  const { address, isConnected } = useAccount();
  const walletChain = useChainId();
  const { connectors, connect, isPending } = useConnect();
  // V34.2: never guess between several installed wallets — connect directly
  // only when exactly one exists; otherwise the generic injected connector
  // lets the browser's own wallet picker decide.
  const installed = connectors.filter((c) => c.type !== "walletConnect");
  const discovered = installed.filter((c) => c.id !== "injected");
  const preferredConnector = discovered.length === 1 ? discovered[0] : installed.find((c) => c.id === "injected") ?? installed[0];
  const { switchChain } = useSwitchChain();
  const [chainId, setChainId] = useState<number>(677);
  const [tab, setTab] = useState<LiquidityTab>(initialTab);
  const [slip, setSlip] = useState("0.5");
  useEffect(() => { if (walletChain === 968 || walletChain === 677) setChainId(walletChain); }, [walletChain]);
  const slippageBps = Math.max(1, Math.min(5000, Math.round((Number(slip) || 0.5) * 100)));
  const explorer = chainId === 677 ? "https://scan.botchain.ai" : "https://scan.bohr.life";
  const writable = LIQUIDITY_WRITES_ENABLED[chainId] === true && isConnected && walletChain === chainId;

  return (
    <div className="space-y-3">
      <section className="fb-surface space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented value={String(chainId)} onChange={(v) => setChainId(Number(v))} options={[{ id: "677", label: "BOT Mainnet" }, { id: "968", label: "BOT Testnet" }]} />
          {!isConnected ? (
            <button type="button" disabled={isPending || !preferredConnector} onClick={() => preferredConnector && connect({ connector: preferredConnector })}
              className="h-10 shrink-0 rounded-xl bg-primary px-4 text-[13px] font-black text-primary-foreground">Connect wallet</button>
          ) : (
            <span className="max-w-full truncate font-mono text-[11px] text-muted">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
          )}
        </div>
        {isConnected && walletChain !== chainId && (
          <Notice tone="warn">Your wallet is on another network. <button type="button" className="font-bold text-primary" onClick={() => switchChain({ chainId })}>Switch network</button></Notice>
        )}
        <label className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-muted">Slippage tolerance (%)</span>
          <input inputMode="decimal" value={slip} onChange={(e) => setSlip(e.target.value.replace(",", "."))} className="h-9 w-20 rounded-lg border border-hairline bg-card px-2 text-right font-mono" aria-label="Slippage tolerance percent" />
        </label>
      </section>

      <Segmented value={tab} onChange={setTab} options={[{ id: "pools", label: "Pools" }, { id: "add", label: "Add" }, { id: "create", label: "Create Pool" }, { id: "positions", label: "My Positions" }]} />

      {tab === "pools" && <PoolsList chainId={chainId} />}
      {tab === "add" && <AddLiquidityPanel chainId={chainId} writable={writable} explorer={explorer} slippageBps={slippageBps} onCreatePool={() => setTab("create")} />}
      {tab === "create" && <CreatePoolPanel chainId={chainId} writable={writable} explorer={explorer} />}
      {tab === "positions" && <PositionsPanel chainId={chainId} writable={writable} explorer={explorer} slippageBps={slippageBps} />}
    </div>
  );
}

function PoolsList({ chainId }: { chainId: number }) {
  const [pools, setPools] = useState<DiscoveredPool[] | null>(null);
  useEffect(() => { setPools(null); discoverPools(getCuratedTokens(chainId === 677), chainId === 677).then(setPools).catch(() => setPools([])); }, [chainId]);
  const explorer = chainId === 677 ? "https://scan.botchain.ai" : "https://scan.bohr.life";
  return (
    <>
      <section className="fb-surface p-4">
        <p className="fb-eyebrow">Live pools · read from the chain</p>
        <p className="mt-1 text-[12px] text-muted">Only pools with live on-chain liquidity are shown. No TVL, APR or volume is estimated.</p>
        <div className="mt-3 space-y-2">
          {pools === null && <p className="text-[12px] text-muted">Reading pools…</p>}
          {pools?.length === 0 && <p className="text-[12px] text-muted">No pools could be read right now.</p>}
          {pools?.filter((p, i, all) => all.findIndex((o) => o.pool.toLowerCase() === p.pool.toLowerCase()) === i).map((p) => (
            <a key={p.pool} href={`${explorer}/address/${p.pool}`} target="_blank" rel="noreferrer" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline p-3">
              <span className="text-[13px] font-bold">{p.pair}</span>
              <span className="font-mono text-[11px] text-muted">{p.dex}{p.feeTier != null ? ` · ${(p.feeTier / 10_000).toFixed(2)}%` : ""}</span>
            </a>
          ))}
        </div>
      </section>
      <section className="fb-surface p-4 text-[12px]">
        <p className="fb-eyebrow">CaSwap liquidity · verified capabilities</p>
        <ul className="mt-1 space-y-0.5 text-muted">
          <li>Add liquidity: {CASWAP_CAPABILITY_MATRIX.addLiquidity}</li>
          <li>Remove liquidity: {CASWAP_CAPABILITY_MATRIX.removeLiquidity}</li>
          <li>Create pair: {CASWAP_CAPABILITY_MATRIX.createPair}</li>
          <li>LP discovery: {CASWAP_CAPABILITY_MATRIX.lpDiscovery}</li>
          <li>Fees: {CASWAP_CAPABILITY_MATRIX.feeRetrieval}</li>
        </ul>
        <p className="mt-1 text-muted-soft">CaSwap liquidity always goes through CaSwap's own contracts, never through BDEX.</p>
      </section>
    </>
  );
}
