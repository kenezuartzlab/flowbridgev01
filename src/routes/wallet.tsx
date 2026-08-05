import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";
import { useAccount } from "wagmi";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  Wallet as WalletIcon,
} from "lucide-react";
import { wagmiConfig } from "@/lib/wagmi";
import { SignInButton } from "@/components/auth/SignInButton";
import { BottomNav } from "@/components/nav/BottomNav";
import { TokenIcon } from "@/components/TokenIcon";
import { formatUsd, formatBalance4 } from "@/lib/format";
import { fetchPortfolio, type Portfolio } from "@/lib/wallet/portfolio";
import { SendModal } from "@/components/wallet/SendModal";
import { ReceiveModal } from "@/components/wallet/ReceiveModal";
import { useAccountData } from "@/lib/app/useAccountData";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — Your BOT Chain Balances | FlowBridge" },
      {
        name: "description",
        content:
          "See every BOT Chain token you hold with live USD values, send and receive assets, and review your full swap and bridge history in the FlowBridge wallet tab.",
      },
      { property: "og:title", content: "FlowBridge Wallet" },
      {
        property: "og:description",
        content: "Live BOT Chain balances, send/receive and transaction history in one screen.",
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

function timeAgo(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function statusTone(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("fail") || s.includes("revert") || s.includes("error"))
    return "border-destructive/30 bg-destructive/10 text-destructive";
  if (s.includes("pend") || s.includes("progress") || s.includes("wait"))
    return "border-warning/30 bg-warning/10 text-warning";
  return "border-success/30 bg-success/10 text-success";
}

function formatDirection(direction: string) {
  if (!direction) return "";
  const parts = direction.replace(/_TO_/g, "_").replace(/^TO_/, "").split("_").filter(Boolean);
  return parts.length >= 2 ? `${parts[0]} → ${parts[parts.length - 1]}` : direction;
}

function WalletPage() {
  const { address, isConnected } = useAccount();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [, setTick] = useState(0);

  const {
    user,
    authReady,
    transactions,
    loading: historyLoading,
    refresh: refreshHistory,
  } = useAccountData();

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setLoadError("");
    try {
      setPortfolio(await fetchPortfolio(address, true));
    } catch {
      setLoadError("Could not reach the BOT Chain network. Check your connection and retry.");
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

  // Keep the "updated Xs ago" label honest without refetching.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

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
  const rows = portfolio?.rows ?? [];
  const held = useMemo(() => rows.filter((r) => r.amount > 0 || r.balanceFailed), [rows]);
  const recent = useMemo(() => (transactions ?? []).slice(0, 8), [transactions]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar
        eyebrow="BOT Chain · Mainnet"
        title="Wallet"
        avatar={user?.photoURL ?? null}
        initial={(user?.displayName || user?.email || "G").slice(0, 1).toUpperCase()}
        actions={
          <button
            type="button"
            onClick={() => {
              void load();
              void refreshHistory();
            }}
            disabled={!address || loading}
            aria-label="Refresh balances and history"
            className="grid h-10 w-10 place-items-center rounded-2xl border border-hairline bg-card text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      />

      <main className="mx-auto max-w-2xl space-y-4 p-3 pb-24 sm:p-4">
        <section className="fb-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="fb-eyebrow">Portfolio value</p>
            {isConnected && portfolio && !loading && (
              <p className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                Updated {timeAgo(portfolio.fetchedAt)}
              </p>
            )}
            {isConnected && loading && (
              <p className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                Refreshing…
              </p>
            )}
          </div>
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

          {isConnected && (portfolio?.partial || portfolio?.pricesPartial) && (
            <p className="mt-2 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {portfolio?.partial
                ? "Some balances could not be read from the network — this total is partial."
                : "Some tokens have no USD price right now, so they are excluded from the total."}
            </p>
          )}

          {isConnected && loadError && (
            <div className="mt-2 space-y-2">
              <p className="flex items-start gap-1.5 font-mono text-[10.5px] leading-relaxed text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="fb-inset inline-flex min-h-[34px] items-center gap-1.5 px-3 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-foreground"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          )}

          {isConnected ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSendOpen(true)}
                  disabled={!portfolio}
                  className="fb-inset inline-flex min-h-[42px] items-center justify-center gap-1.5 px-3 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-foreground disabled:opacity-40"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 text-primary" /> Send
                </button>
                <button
                  type="button"
                  onClick={() => setReceiveOpen(true)}
                  className="fb-inset inline-flex min-h-[42px] items-center justify-center gap-1.5 px-3 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-foreground"
                >
                  <ArrowDownLeft className="h-3.5 w-3.5 text-primary" /> Receive
                </button>
              </div>

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
            </>
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
                <li key={row.token.address} className="flex items-center gap-3 px-4 py-2.5">
                  <TokenIcon symbol={row.token.symbol} className="h-7 w-7 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12px] font-black uppercase tracking-[0.06em]">
                      {row.token.symbol}
                    </p>
                    <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                      {row.balanceFailed
                        ? "Balance unavailable"
                        : row.priceUsd > 0
                          ? formatUsd(row.priceUsd)
                          : "No price feed"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[12px] font-black tabular-nums">
                      {row.balanceFailed ? "—" : formatBalance4(row.amount)}
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

        <section className="fb-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <p className="fb-eyebrow">Transaction history</p>
            <Link
              to="/activity"
              className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
            >
              All activity
            </Link>
          </div>

          {!authReady || (user && historyLoading && recent.length === 0) ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="fb-inset h-11 animate-pulse" />
              ))}
            </div>
          ) : !user ? (
            <div className="space-y-3 p-4">
              <p className="font-mono text-[11px] leading-relaxed text-muted">
                Sign in to keep a permanent record of your swaps and bridges.
              </p>
              <SignInButton label="Sign in" />
            </div>
          ) : recent.length === 0 ? (
            <p className="p-4 font-mono text-[11px] leading-relaxed text-muted">
              No transactions yet. Your swaps and bridges appear here automatically.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {recent.map((tx: any) => {
                const type = tx.tx_type ?? tx.txType ?? "SWAP";
                const status = tx.status ?? "";
                const hash = tx.tx_hash ?? tx.txHash ?? "";
                const created = tx.created_at ?? tx.createdAt;
                return (
                  <li key={tx.id ?? hash} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-primary">
                          {type}
                        </span>
                        <span className="truncate font-mono text-[11.5px] font-black uppercase tracking-[0.06em]">
                          {formatDirection(tx.direction ?? "")}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] tabular-nums text-muted">
                        {tx.from_amount ?? tx.fromAmount ?? "—"} → {tx.to_amount ?? tx.toAmount ?? "—"}
                        {created ? ` · ${new Date(created).toLocaleString()}` : ""}
                      </p>
                      {hash && (
                        <a
                          href={`https://scan.botchain.ai/tx/${hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 font-mono text-[9.5px] font-black uppercase tracking-[0.08em] text-primary"
                        >
                          {hash.slice(0, 8)}…{hash.slice(-6)} <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] ${statusTone(status)}`}
                    >
                      {status || "Recorded"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <SendModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        rows={rows}
        onSent={() => {
          void load();
          void refreshHistory();
        }}
      />
      <ReceiveModal
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        address={address}
      />

      <BottomNav />
    </div>
  );
}
