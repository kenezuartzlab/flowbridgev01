/** Activity — liquidity operations (device-local), grouped per user operation with every tx hash. */
import { useEffect, useState } from "react";
import { KIND_LABEL, listLiquidityActivity, operationStatus, PHASE_LABEL, type LiquidityActivity } from "@/lib/liquidity/lifecycle";

export function LiquidityActivityPanel() {
  const [items, setItems] = useState<LiquidityActivity[]>([]);
  useEffect(() => {
    const load = () => setItems(listLiquidityActivity());
    load();
    window.addEventListener("fb-liquidity-activity", load);
    return () => window.removeEventListener("fb-liquidity-activity", load);
  }, []);
  if (!items.length) return null;
  return (
    <section className="fb-surface p-4">
      <p className="fb-eyebrow">Liquidity · this device</p>
      <div className="mt-2 space-y-2">
        {items.slice(0, 30).map((a) => {
          const s = operationStatus(a);
          const explorer = a.chainId === 677 ? "https://scan.botchain.ai" : "https://scan.bohr.life";
          return (
            <div key={a.id} className="rounded-xl border border-hairline p-3 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black">{KIND_LABEL[a.kind]} · {a.pair}</span>
                <span className={`font-bold ${s.phase === "confirmed" ? "text-success" : s.phase === "failed" ? "text-danger" : "text-muted"}`}>{PHASE_LABEL[s.phase]}</span>
              </div>
              <p className="text-muted">{a.dex} · {a.chainId === 677 ? "BOT Mainnet" : "BOT Testnet"}{a.tokenId ? ` · #${a.tokenId}` : ""} · {s.summary}</p>
              {a.amounts.length > 0 && <p className="text-muted">{a.amounts.join(" + ")}</p>}
              {a.txs.map((t) => (
                <a key={t.hash} href={`${explorer}/tx/${t.hash}`} target="_blank" rel="noreferrer" className="block truncate font-mono text-[10.5px] text-primary">{t.label}: {t.hash}</a>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
