import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { WagmiProvider } from "wagmi";
import { useAccount } from "wagmi";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  Wallet as WalletIcon,
} from "lucide-react";
import { wagmiConfig } from "@/lib/wagmi";
import { BottomNav } from "@/components/nav/BottomNav";
import { TokenIcon } from "@/components/TokenIcon";
import { formatUsd, formatBalance4 } from "@/lib/format";
import { fetchPortfolio, type Portfolio } from "@/lib/wallet/portfolio";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — Your BOT Chain Balances | FlowBridge" },
      {
        name: "description",
        content:
          "See every BOT Chain token you hold with live USD values, total portfolio worth and one-tap swap or bridge from your FlowBridge wallet tab.",
      },
      { property: "og:title", content: "FlowBridge Wallet" },
      {
        property: "og:description",
        content: "Live BOT Chain token balances and portfolio value in one screen.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/wallet" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/wallet" }],
  }),
  component: WalletRoute,
});

function WalletRoute() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <WalletPage />
    </WagmiProvider>
  );
}

function WalletPage() {
  const { address, isConnected } = useAccount();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setPortfolio(await fetchPortfolio(address, true));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setPortfolio(null);
      return;
    }
    void load();
  }, [address, load]);

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
  const held = (portfolio?.rows ?? []).filter((r) => r.amount > 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <WalletIcon className="h-4 w-4" />
            </span>
            <h1 className="truncate font-mono text-[13px] font-black uppercase tracking-[0.14em]">
              Wallet<span className="text-primary">.</span>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={!address || loading}
            aria-label="Refresh balances"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-3 sm:p-4">
        <section className="fb-surface p-4">
          <p className="fb-eyebrow">Portfolio value</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <p className="font-mono text-3xl font-black leading-none tabular-nums">
              {!isConnected ? "—" : loading && !portfolio ? "…" : formatUsd(portfolio?.totalUsd ?? 0)}
            </p>
            <Link
              to="/"
              className="fb-glow inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-primary px-3 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap
            </Link>
          </div>

          {isConnected ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="fb-inset inline-flex min-h-[34px] items-center gap-1.5 px-3 font-mono text-[10.5px] font-black uppercase tracking-[0.08em] text-muted transition-colors hover:text-foreground"
              >
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                {shortAddr}
              </button>
              <a
                href={`https://scan.botchain.ai/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="fb-inset inline-flex min-h-[34px] items-center gap-1.5 px-3 font-mono text-[10.5px] font-black uppercase tracking-[0.08em] text-muted transition-colors hover:text-foreground"
              >
                Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-muted">
              Connect your wallet on the trade screen to see your BOT Chain balances here.
            </p>
          )}
        </section>

        <section className="fb-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <p className="fb-eyebrow">Holdings</p>
            <Link
              to="/markets"
              className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
            >
              Markets
            </Link>
          </div>

          {!isConnected ? (
            <div className="p-4">
              <Link
                to="/"
                className="fb-glow inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary px-4 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
              >
                Connect wallet <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : loading && !portfolio ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="fb-inset h-11 animate-pulse" />
              ))}
            </div>
          ) : held.length === 0 ? (
            <p className="p-4 font-mono text-[11px] leading-relaxed text-muted">
              No token balances found on BOT Chain for this wallet.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {held.map((row) => (
                <li
                  key={row.token.address}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <TokenIcon symbol={row.token.symbol} className="h-7 w-7 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12px] font-black uppercase tracking-[0.06em]">
                      {row.token.symbol}
                    </p>
                    <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                      {row.priceUsd > 0 ? formatUsd(row.priceUsd) : row.token.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[12px] font-black tabular-nums">
                      {formatBalance4(row.amount)}
                    </p>
                    <p className="font-mono text-[9.5px] font-black tabular-nums text-muted">
                      {row.valueUsd > 0 ? formatUsd(row.valueUsd) : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
