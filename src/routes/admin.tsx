import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { initAuth } from "@/lib/auth";
import {
  checkAdmin,
  deleteAdminToken,
  fetchAdminConfig,
  fetchAdminTokens,
  saveAdminSettings,
  saveAdminToken,
} from "@/lib/admin/adminApi";
import {
  DEFAULT_APP_CONFIG,
  loadAppConfig,
  type AppConfig,
} from "@/lib/config/appConfig";
import { fetchTokenMetadata } from "@/lib/swap/erc20";
import { hasAnyLiquidity } from "@/lib/swap/quoter";
import { TokenIcon } from "@/components/TokenIcon";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "FlowBridge Admin Console" },
      {
        name: "description",
        content:
          "Private FlowBridge admin console for publishing swap tokens and tuning fee, reward and feature settings.",
      },
      { property: "og:title", content: "FlowBridge Admin Console" },
      {
        property: "og:description",
        content: "Publish swap tokens and manage FlowBridge runtime settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminPage,
});

type Tab = "tokens" | "fees" | "rewards" | "flags";

const cardCls =
  "rounded-2xl border border-white/10 bg-[#0D1C2A]/70 p-4 space-y-3 font-mono text-[13px]";
const labelCls = "text-[11px] uppercase tracking-widest text-[#C5C1B9] font-black";
const inputCls =
  "w-full bg-[#010C1B] border border-white/15 rounded-xl px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#32FF8B]/50";
const btnPrimary =
  "px-4 py-2.5 rounded-xl bg-[#32FF8B] text-[#010C1B] text-[12px] font-black uppercase tracking-widest cursor-pointer hover:bg-[#1FFF7D] transition disabled:opacity-50";
const btnGhost =
  "px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/10 transition disabled:opacity-50";

function AdminPage() {
  const { address, isConnected } = useAccount();
  const wallet = address?.toLowerCase();

  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [gate, setGate] = useState<{ isAdmin: boolean; reason?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("tokens");

  useEffect(() => {
    const un = initAuth(
      (u) => {
        setUser(u);
        setAuthReady(true);
      },
      () => {
        setUser(null);
        setAuthReady(true);
      },
    );
    return () => un();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user || !wallet) {
      setGate({ isAdmin: false, reason: !user ? "Sign in with the admin email." : "Connect the bound admin wallet." });
      return;
    }
    let alive = true;
    checkAdmin(wallet).then((r) => alive && setGate(r));
    return () => {
      alive = false;
    };
  }, [authReady, user, wallet]);

  if (!authReady || gate === null) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-[#C5C1B9] font-mono text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking admin access…
        </div>
      </Shell>
    );
  }

  if (!gate.isAdmin) {
    return (
      <Shell>
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-amber-400 font-black uppercase tracking-widest text-[12px]">
            <AlertTriangle className="w-4 h-4" /> Admin access required
          </div>
          <p className="text-[#C5C1B9] leading-relaxed">
            {gate.reason ?? "This console is restricted."} Access needs the verified admin email
            signed in <span className="text-white">and</span> its bound wallet connected
            {isConnected && wallet ? ` (connected: ${wallet.slice(0, 6)}…${wallet.slice(-4)})` : ""}.
          </p>
          <Link to="/" className={btnGhost}>
            Back to app
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-2 text-[#32FF8B] font-mono text-[12px] font-black uppercase tracking-widest">
        <ShieldCheck className="w-4 h-4" /> Admin verified · {user?.email}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["tokens", "Tokens"],
            ["fees", "Fees & Slippage"],
            ["rewards", "Rewards"],
            ["flags", "Feature Flags"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest font-mono cursor-pointer transition ${
              tab === id
                ? "bg-[#32FF8B]/15 border border-[#32FF8B]/40 text-[#32FF8B]"
                : "bg-white/5 border border-white/10 text-[#C5C1B9] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tokens" ? <TokensPanel wallet={wallet!} /> : <SettingsPanel wallet={wallet!} tab={tab} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#010C1B] px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-white font-black tracking-widest uppercase font-mono text-lg">
            FlowBridge Admin
          </h1>
          <p className="text-[#C5C1B9] text-[12px] font-mono">
            Publish swap tokens and tune runtime settings without touching code.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------- Tokens ------------------------------- */

function TokensPanel({ wallet }: { wallet: string }) {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [chain, setChain] = useState<"mainnet" | "testnet">("mainnet");
  const [addr, setAddr] = useState("");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [decimals, setDecimals] = useState("18");
  const [logoUrl, setLogoUrl] = useState("");
  const [routerId, setRouterId] = useState("");
  const [checking, setChecking] = useState(false);
  const [liquidityOk, setLiquidityOk] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminTokens(wallet);
      setTokens(res.tokens ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const verify = async () => {
    setChecking(true);
    setError(null);
    setLiquidityOk(null);
    try {
      const meta = await fetchTokenMetadata(addr.trim(), chain === "mainnet");
      if (!meta) {
        setError("Not a valid ERC-20 contract on BOT Chain.");
        return;
      }
      setSymbol(meta.symbol);
      setName(meta.name);
      setDecimals(String(meta.decimals));
      const liquid = await hasAnyLiquidity(meta.address, chain === "mainnet");
      setLiquidityOk(liquid);
      if (!liquid) {
        setError(
          "No tradable liquidity found against BOT, USDT or CA on any active router. You can still force-publish it below.",
        );
      }
    } catch (e: any) {
      setError(e?.message ?? "Verification failed");
    } finally {
      setChecking(false);
    }
  };

  const publish = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveAdminToken(wallet, {
        chain,
        address: addr.trim(),
        symbol: symbol.trim(),
        name: (name || symbol).trim(),
        decimals: Number(decimals) || 18,
        logoUrl: logoUrl.trim() ? logoUrl.trim() : null,
        routerId: routerId.trim() ? Number(routerId) : null,
        liquidityVerified: liquidityOk === true,
        isActive: true,
      });
      setNotice(`${symbol.toUpperCase()} published to the global swap list.`);
      setAddr("");
      setSymbol("");
      setName("");
      setLogoUrl("");
      setRouterId("");
      setLiquidityOk(null);
      await reload();
      await loadAppConfig(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to publish token");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: any) => {
    try {
      await saveAdminToken(wallet, {
        chain: t.chain,
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoUrl: t.logo_url,
        routerId: t.router_id,
        liquidityVerified: t.liquidity_verified,
        isActive: !t.is_active,
      });
      await reload();
      await loadAppConfig(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to update token");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAdminToken(wallet, id);
      await reload();
      await loadAppConfig(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to remove token");
    }
  };

  const canPublish = /^0x[a-fA-F0-9]{40}$/.test(addr.trim()) && symbol.trim().length > 0 && !saving;

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <span className={labelCls}>Publish token</span>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value as any)}
            className="bg-[#010C1B] border border-white/15 rounded-lg px-2 py-1 text-white text-[12px] font-mono cursor-pointer"
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
          </select>
        </div>

        <input
          value={addr}
          onChange={(e) => {
            setAddr(e.target.value);
            setLiquidityOk(null);
          }}
          placeholder="0x token contract address"
          className={inputCls}
        />

        <div className="flex gap-2">
          <button type="button" onClick={verify} disabled={checking || addr.trim().length !== 42} className={btnGhost}>
            {checking ? "Verifying…" : "Verify on-chain"}
          </button>
          {liquidityOk === true && (
            <span className="flex items-center gap-1 text-[#32FF8B] text-[11px] font-black uppercase tracking-widest">
              <Check className="w-3.5 h-3.5" /> Liquidity found
            </span>
          )}
          {liquidityOk === false && (
            <span className="flex items-center gap-1 text-amber-400 text-[11px] font-black uppercase tracking-widest">
              <AlertTriangle className="w-3.5 h-3.5" /> No liquidity
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className={labelCls}>Symbol</div>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <div className={labelCls}>Decimals</div>
            <input value={decimals} onChange={(e) => setDecimals(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1 col-span-2">
            <div className={labelCls}>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <div className={labelCls}>Logo URL (optional)</div>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <div className={labelCls}>Preferred routerId (optional)</div>
            <input value={routerId} onChange={(e) => setRouterId(e.target.value)} className={inputCls} />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 text-[#32FF8B] bg-[#32FF8B]/5 border border-[#32FF8B]/20 rounded-lg px-3 py-2">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <button type="button" onClick={publish} disabled={!canPublish} className={btnPrimary}>
          <Plus className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          {liquidityOk === false ? "Force publish" : "Publish token"}
        </button>
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <span className={labelCls}>Published tokens</span>
          <button type="button" onClick={() => void reload()} className={btnGhost}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {loading && <div className="text-[#C5C1B9]">Loading…</div>}
        {!loading && tokens.length === 0 && (
          <div className="text-[#C5C1B9]">No tokens published yet.</div>
        )}
        <div className="space-y-2">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl bg-[#010C1B]/60 border border-white/5 p-2.5"
            >
              <TokenIcon symbol={t.symbol} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-white font-black tracking-wider">
                  {t.symbol}
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-[#C5C1B9]">
                    {t.chain}
                  </span>
                  {!t.liquidity_verified && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-400">
                      unverified
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#C5C1B9] truncate">{t.address}</div>
              </div>
              <button type="button" onClick={() => void toggleActive(t)} className={btnGhost}>
                {t.is_active ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                onClick={() => void remove(t.id)}
                className="p-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 cursor-pointer hover:bg-red-500/20"
                aria-label={`Remove ${t.symbol}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Settings ------------------------------ */

function SettingsPanel({ wallet, tab }: { wallet: string; tab: Exclude<Tab, "tokens"> }) {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAdminConfig(wallet)
      .then((c) => alive && setCfg(c))
      .catch((e) => alive && setError(e?.message ?? "Failed to load settings"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [wallet]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveAdminSettings(wallet, { fees: cfg.fees, rewards: cfg.rewards, flags: cfg.flags });
      await loadAppConfig(true);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const numField = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    hint?: string,
  ) => (
    <div className="space-y-1">
      <div className={labelCls}>{label}</div>
      <input
        type="number"
        step="any"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls}
      />
      {hint && <div className="text-[11px] text-[#C5C1B9]">{hint}</div>}
    </div>
  );

  const body = useMemo(() => {
    if (tab === "fees") {
      return (
        <>
          {numField("Default slippage %", cfg.fees.defaultSlippagePct, (n) =>
            setCfg({ ...cfg, fees: { ...cfg.fees, defaultSlippagePct: n } }),
          )}
          {numField("Max slippage % (warning ceiling)", cfg.fees.maxSlippagePct, (n) =>
            setCfg({ ...cfg, fees: { ...cfg.fees, maxSlippagePct: n } }),
          )}
          {numField(
            "Minimum bridge amount (USD)",
            cfg.fees.minBridgeUsd,
            (n) => setCfg({ ...cfg, fees: { ...cfg.fees, minBridgeUsd: n } }),
            "Enforced in the UI before any wallet prompt.",
          )}
          <div className="rounded-xl border border-white/10 bg-[#010C1B]/60 px-3 py-2 text-[11px] text-[#C5C1B9] leading-relaxed">
            The 0.1% platform fee is enforced on-chain by FlowBridgeRouter and can only be changed
            in the router contract — it is intentionally not editable here so UI disclosure can
            never drift from the chain.
          </div>
        </>
      );
    }
    if (tab === "rewards") {
      return (
        <>
          {numField("Minimum swap value to earn (USD)", cfg.rewards.minUsd, (n) =>
            setCfg({ ...cfg, rewards: { ...cfg.rewards, minUsd: n } }),
          )}
          {numField("USD per FLOW block", cfg.rewards.usdBlock, (n) =>
            setCfg({ ...cfg, rewards: { ...cfg.rewards, usdBlock: n } }),
          )}
          {numField("FLOW points per block", cfg.rewards.pointsPerBlock, (n) =>
            setCfg({ ...cfg, rewards: { ...cfg.rewards, pointsPerBlock: n } }),
          )}
          {numField(
            "Referral-signup unlock per swap volume (USD)",
            cfg.rewards.referralClaimMinSwapUsd,
            (n) => setCfg({ ...cfg, rewards: { ...cfg.rewards, referralClaimMinSwapUsd: n } }),
          )}
          {numField("Claim threshold (FLOW)", cfg.rewards.claimThreshold, (n) =>
            setCfg({ ...cfg, rewards: { ...cfg.rewards, claimThreshold: n } }),
          )}
          {numField("Referral activity share (% of referee swap points)", cfg.rewards.referralActivityPct, (n) =>
            setCfg({ ...cfg, rewards: { ...cfg.rewards, referralActivityPct: n } }),
          )}
        </>
      );
    }
    return (
      <>
        <Toggle
          label="Show LIMIT tab to everyone"
          hint="Off = admin-only (current behaviour)."
          value={cfg.flags.limitTabPublic}
          onChange={(v) => setCfg({ ...cfg, flags: { ...cfg.flags, limitTabPublic: v } })}
        />
        <Toggle
          label="Show hero banners"
          value={cfg.flags.showBanners}
          onChange={(v) => setCfg({ ...cfg, flags: { ...cfg.flags, showBanners: v } })}
        />
        <div className="space-y-1">
          <div className={labelCls}>Maintenance notice (empty = hidden)</div>
          <textarea
            value={cfg.flags.maintenanceNotice}
            maxLength={300}
            onChange={(e) =>
              setCfg({ ...cfg, flags: { ...cfg.flags, maintenanceNotice: e.target.value } })
            }
            className={`${inputCls} min-h-[72px]`}
          />
        </div>
      </>
    );
  }, [cfg, tab]);

  return (
    <div className={cardCls}>
      {loading ? (
        <div className="text-[#C5C1B9]">Loading settings…</div>
      ) : (
        <>
          {body}
          {error && (
            <div className="flex items-start gap-2 text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 text-[#32FF8B]">
              <Check className="w-3.5 h-3.5" /> Saved — live for all users.
            </div>
          )}
          <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </>
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between gap-3 rounded-xl bg-[#010C1B]/60 border border-white/10 px-3 py-2.5 cursor-pointer text-left"
    >
      <span>
        <span className="block text-white text-[12px] font-black uppercase tracking-widest">
          {label}
        </span>
        {hint && <span className="block text-[11px] text-[#C5C1B9]">{hint}</span>}
      </span>
      <span
        className={`w-10 h-5 rounded-full relative transition ${
          value ? "bg-[#32FF8B]" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#010C1B] transition-all ${
            value ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
