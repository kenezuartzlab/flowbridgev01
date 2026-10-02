/**
 * Earn — Liquidity Fees and Staking, kept as separate categories. Shows only
 * real on-chain unclaimed V3 fees; V2/CaSwap fees stay inside LP tokens.
 * No APR/APY and no combined yield number.
 */
import { Link } from "@tanstack/react-router";
import { WagmiProvider, useAccount, useChainId } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { usePositions } from "./PositionsPanel";
import { fmt, Row } from "./shared";

function Inner() {
  const { isConnected } = useAccount();
  const wc = useChainId();
  const chainId = wc === 968 ? 968 : 677;
  const { v3, v2 } = usePositions(chainId);
  const withFees = (v3 ?? []).filter((p) => (p.unclaimed0 ?? 0n) > 0n || (p.unclaimed1 ?? 0n) > 0n);
  const lpCount = Object.values(v2).reduce((n, l) => n + (l?.length ?? 0), 0);
  return (
    <>
      <section className="fb-surface p-4">
        <p className="fb-eyebrow">Liquidity fees · {chainId === 677 ? "BOT Mainnet" : "BOT Testnet"}</p>
        {!isConnected && <p className="mt-1 text-[12px] text-muted">Connect a wallet on the Liquidity page to see claimable pool fees.</p>}
        {isConnected && v3 === null && <p className="mt-1 text-[12px] text-muted">Reading positions…</p>}
        {isConnected && v3 && (
          <div className="mt-2">
            {withFees.length === 0 && <p className="text-[12px] text-muted">No unclaimed BDEX V3 fees right now.</p>}
            {withFees.map((p) => (
              <Row key={p.tokenId.toString()} k={`#${p.tokenId} ${p.token0.symbol}/${p.token1.symbol}`} v={`${fmt(p.unclaimed0, p.token0.decimals)} ${p.token0.symbol} · ${fmt(p.unclaimed1, p.token1.decimals)} ${p.token1.symbol}`} />
            ))}
            <p className="mt-1 text-[11.5px] text-muted">{lpCount} V2/CaSwap LP position{lpCount === 1 ? "" : "s"}. Their fees build up inside the LP token and are paid out when you remove liquidity.</p>
          </div>
        )}
        <Link to="/liquidity" search={{ tab: "positions" }} className="mt-2 inline-block text-[12px] font-bold text-primary">My Positions →</Link>
      </section>
      <section className="fb-surface p-4">
        <p className="fb-eyebrow">Staking</p>
        <p className="mt-1 text-[12px] text-muted">FLOW staking rewards are shown on the Staking page, from the staking contracts.</p>
        <Link to="/stake" className="mt-2 inline-block text-[12px] font-bold text-primary">Open Staking →</Link>
      </section>
      <p className="px-1 text-[10.5px] text-muted-soft">Each earning category is shown separately. FlowBridge doesn't combine them into one yield figure or show any APR/APY.</p>
    </>
  );
}

export function EarnLiquidityFees() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <Inner />
    </WagmiProvider>
  );
}
