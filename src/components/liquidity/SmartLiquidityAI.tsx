/**
 * Smart AI — liquidity explanations. Concept text plus live values only; no
 * invented ranges, APR or profit claims.
 */
import { useState } from "react";
import { Sparkles } from "lucide-react";

export type LiquidityTopic = "v2-vs-v3" | "concentrated" | "fee-tiers" | "range-width" | "range-status" | "impermanent-loss" | "collect" | "increase-decrease";

const TEXT: Record<LiquidityTopic, [string, string]> = {
  "v2-vs-v3": ["V2 vs V3", "V2 spreads your deposit across every price and gives you an LP token; its fees build up inside the pool. V3 lets you pick a price range and gives you an NFT position; its fees are collected separately."],
  concentrated: ["Concentrated liquidity", "In V3, your deposit only works while the price is inside your range. A tighter range puts more capital to work near the current price, so it earns a bigger share of fees from trades in that band."],
  "fee-tiers": ["Fee tiers", "Each V3 pool charges one fee per trade: 0.05%, 0.30% or 1.00% on BDEX. Only tiers enabled on-chain are offered. The FlowBridge swap fee is a separate charge."],
  "range-width": ["Range width", "Wider ranges stay in range longer but are less concentrated. Narrower ranges are more concentrated but go out of range more easily. FlowBridge never rebalances your position."],
  "range-status": ["In range / out of range", "In range: your position earns a share of swap fees. Out of range: it earns nothing and is entirely one token, until the price comes back or you move your liquidity."],
  "impermanent-loss": ["Impermanent loss", "When the price moves, the mix of your tokens changes. Withdrawing can then leave you with less value than simply holding the tokens. Concentrated ranges make this effect stronger."],
  collect: ["Collecting fees", "V3 fees sit with the position until you collect them. Collecting sends the owed tokens to your wallet and doesn't change your liquidity. V2 and CaSwap fees stay inside the LP token."],
  "increase-decrease": ["Increase / decrease", "Increase adds tokens to the same position and range. Decrease withdraws part of the liquidity; the tokens are then owed to you and arrive when you collect."],
};

export function SmartLiquidityAI({ topics, live }: { topics: LiquidityTopic[]; live?: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="fb-surface p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-[12.5px] font-black"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Smart AI · explain</span>
        <span className="text-[11px] text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-[12px] leading-relaxed">
          {live?.map((l) => <p key={l} className="rounded-lg bg-card-alt px-2 py-1 font-bold">{l}</p>)}
          {topics.map((t) => (
            <div key={t}><p className="font-bold">{TEXT[t][0]}</p><p className="text-muted">{TEXT[t][1]}</p></div>
          ))}
          <p className="text-[11px] text-muted-soft">For information only, not investment advice. Earnings are never guaranteed.</p>
        </div>
      )}
    </section>
  );
}
