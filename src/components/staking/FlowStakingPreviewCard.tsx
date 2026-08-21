import { useCallback, useEffect, useState } from "react";
import { Info, Loader2, Lock, RefreshCw, Wallet } from "lucide-react";

import { SectionHeader, StatusPill, Surface } from "@/components/ui-kit/primitives";
import {
  BOT_TESTNET_CHAIN_ID,
  FLOW_STAKING_BLOCKED_COPY,
  getFlowStakingChainConfig,
  resolveFlowStakingReadiness,
} from "@/lib/staking/flowStakingRegistry";

/**
 * FlowBridge V13 — FLOW staking TESTNET PREVIEW panel.
 *
 * Presentation only, and deliberately fail-closed: no vault is deployed, so
 * this panel can never show staking as live and never renders an APR/APY. The
 * only live number it reads is the user's real FLOW balance from the canonical
 * token contract. It cannot stake, sign or submit anything.
 */

const FLOW_DECIMALS = 18n;
const BALANCE_OF = "0x70a08231";

function formatFlow(raw: bigint | null, maxFrac = 4): string {
  if (raw == null) return "—";
  const base = 10n ** FLOW_DECIMALS;
  const whole = raw / base;
  const frac = raw % base;
  if (frac === 0n) return whole.toLocaleString("en-US");
  const fracStr = frac
    .toString()
    .padStart(Number(FLOW_DECIMALS), "0")
    .slice(0, maxFrac)
    .replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fracStr ? `.${fracStr}` : ""}`;
}

export function FlowStakingPreviewCard({
  flowPoints,
  campaignPts,
}: {
  flowPoints?: number | null;
  campaignPts?: number | null;
}) {
  const chain = getFlowStakingChainConfig(BOT_TESTNET_CHAIN_ID)!;
  const readiness = resolveFlowStakingReadiness(BOT_TESTNET_CHAIN_ID, false);
  const blockedCopy = readiness.ready ? null : FLOW_STAKING_BLOCKED_COPY[readiness.reason];

  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readBalance = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth || !chain.token) return;
    setLoading(true);
    setError(null);
    try {
      const accounts: string[] = await eth.request({ method: "eth_accounts" });
      const addr = accounts?.[0] ?? null;
      setAccount(addr);
      if (!addr) {
        setBalance(null);
        return;
      }
      const data = `${BALANCE_OF}${addr.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
      const result: string = await eth.request({
        method: "eth_call",
        params: [{ to: chain.token, data }, "latest"],
      });
      setBalance(BigInt(result && result !== "0x" ? result : "0x0"));
    } catch {
      setError("Could not read your FLOW balance. Switch to BOT Testnet and retry.");
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [chain.token]);

  useEffect(() => {
    void readBalance();
  }, [readBalance]);

  return (
    <Surface>
      <SectionHeader
        icon={Lock}
        title="FLOW staking"
        subtitle="BOT Testnet 968 — build preview"
        right={<StatusPill tone="warn" label="Testnet preview · not active" />}
      />

      <div className="grid grid-cols-2 gap-px border-t border-hairline bg-hairline">
        <Stat label="Your FLOW balance" value={formatFlow(balance)} />
        <Stat label="Staked" value={readiness.ready ? formatFlow(null) : "—"} />
        <Stat label="Earned rewards" value="—" />
        <Stat label="Reward schedule" value="No funded schedule" />
      </div>

      <div className="space-y-3 border-t border-hairline p-4">
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-soft">
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Wallet not connected"}
          </span>
          <button
            type="button"
            onClick={() => void readBalance()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2 py-1 font-mono text-[10px] font-black uppercase tracking-[0.1em]"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>

        {error && <p className="text-[11px] text-destructive">{error}</p>}

        <div className="rounded-xl border border-hairline p-3 text-[11px] leading-relaxed text-muted-soft">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-foreground">
            <Info className="h-3.5 w-3.5" /> Status
          </span>
          <p className="mt-1.5">
            {blockedCopy} Staking will use the existing fixed-supply FLOW token as principal and pay
            rewards only from a separately pre-funded reward inventory — it never mints FLOW.
            Minimum stake, reward budget, epoch duration and start time all remain owner-gated, so
            no rate is shown. There is no lock-up and no early-withdraw penalty.
          </p>
          <p className="mt-2">
            FLOW Points ({(flowPoints ?? 0).toLocaleString("en-US")} PTS) and Campaign PTS (
            {(campaignPts ?? 0).toLocaleString("en-US")}) are adjacent ecosystem metrics only. They
            can never be staked, converted into staking principal or used as a staking multiplier.
          </p>
        </div>

        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-xl border border-hairline py-2.5 font-mono text-[11px] font-black uppercase tracking-[0.12em] opacity-50"
        >
          Stake FLOW — pending vault deployment
        </button>
      </div>
    </Surface>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-3">
      <span className="block font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted-soft">
        {label}
      </span>
      <span className="mt-1 block font-mono text-[14px] font-black tabular-nums">{value}</span>
    </div>
  );
}
