import { useCallback, useEffect, useState } from "react";
import { Info, Loader2, RefreshCw, ShieldCheck, Wallet } from "lucide-react";

import { SectionHeader, StatusPill, Surface } from "@/components/ui-kit/primitives";
import {
  BOT_TESTNET_CHAIN_ID,
  FLOW_STAKING_BLOCKED_COPY,
  describeRewardSchedule,
  getFlowStakingChainConfig,
  resolveFlowStakingReadiness,
} from "@/lib/staking/flowStakingRegistry";

/**
 * FlowBridge V13.2 — FLOW staking BOT Testnet panel.
 *
 * Read-only by construction: it reads the user's FLOW balance, their vault
 * position and the live on-chain schedule state. It never renders an APR/APY,
 * and it never signs, approves or submits a stake — user staking opens in a
 * later gate.
 */

const FLOW_DECIMALS = 18n;
const SELECTORS = {
  balanceOf: "0x70a08231",
  totalStaked: "0x817b1cd2",
  rewardRate: "0x7b0a47ee",
  periodFinish: "0xebe2b12b",
  minStake: "0x375b3c0a",
  rewardInventory: "0x7e7ae4aa",
  earned: "0x008cc262",
} as const;

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

function formatDays(seconds: bigint): string {
  const days = Number(seconds) / 86400;
  return days >= 1 ? `${days.toFixed(1)}d left` : `${Math.max(0, Math.round(Number(seconds) / 3600))}h left`;
}

export function FlowStakingPreviewCard({
  flowPoints,
  campaignPts,
}: {
  flowPoints?: number | null;
  campaignPts?: number | null;
}) {
  const chain = getFlowStakingChainConfig(BOT_TESTNET_CHAIN_ID)!;

  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [staked, setStaked] = useState<bigint | null>(null);
  const [earned, setEarned] = useState<bigint | null>(null);
  const [minStake, setMinStake] = useState<bigint | null>(null);
  const [inventory, setInventory] = useState<bigint | null>(null);
  const [rewardRate, setRewardRate] = useState<bigint | null>(null);
  const [periodFinish, setPeriodFinish] = useState<bigint | null>(null);
  const [totalStaked, setTotalStaked] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduleFunded = (inventory ?? 0n) > 0n && (rewardRate ?? 0n) > 0n;
  const readiness = resolveFlowStakingReadiness(BOT_TESTNET_CHAIN_ID, scheduleFunded);
  const blockedCopy = readiness.ready ? null : FLOW_STAKING_BLOCKED_COPY[readiness.reason];
  const scheduleState = describeRewardSchedule({
    rewardRatePerSecond: rewardRate,
    periodFinish,
    totalStaked,
    nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
  });

  const readState = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth || !chain.token) return;
    setLoading(true);
    setError(null);
    const call = async (to: string, data: string) => {
      const result: string = await eth.request({
        method: "eth_call",
        params: [{ to, data }, "latest"],
      });
      return BigInt(result && result !== "0x" ? result : "0x0");
    };
    try {
      const accounts: string[] = await eth.request({ method: "eth_accounts" });
      const addr = accounts?.[0] ?? null;
      setAccount(addr);

      if (chain.vault) {
        const [ms, inv, rate, finish, total] = await Promise.all([
          call(chain.vault, SELECTORS.minStake),
          call(chain.vault, SELECTORS.rewardInventory),
          call(chain.vault, SELECTORS.rewardRate),
          call(chain.vault, SELECTORS.periodFinish),
          call(chain.vault, SELECTORS.totalStaked),
        ]);
        setMinStake(ms);
        setInventory(inv);
        setRewardRate(rate);
        setPeriodFinish(finish);
        setTotalStaked(total);
      }

      if (!addr) {
        setBalance(null);
        setStaked(null);
        setEarned(null);
        return;
      }
      const arg = addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      setBalance(await call(chain.token, `${SELECTORS.balanceOf}${arg}`));
      if (chain.vault) {
        setStaked(await call(chain.vault, `${SELECTORS.balanceOf}${arg}`));
        setEarned(await call(chain.vault, `${SELECTORS.earned}${arg}`));
      }
    } catch {
      setError("Could not read on-chain staking state. Switch to BOT Testnet and retry.");
    } finally {
      setLoading(false);
    }
  }, [chain.token, chain.vault]);

  useEffect(() => {
    void readState();
  }, [readState]);

  return (
    <Surface>
      <SectionHeader
        title="FLOW staking"
        hint="BOT Testnet 968 — vault live"
        badge={
          <StatusPill tone={readiness.ready ? "ok" : "warn"}>
            <ShieldCheck className="h-3 w-3" />
            {readiness.ready ? "Funded schedule active" : "Schedule pending"}
          </StatusPill>
        }
      />

      <div className="grid grid-cols-2 gap-px border-t border-hairline bg-hairline">
        <Stat label="Your FLOW balance" value={formatFlow(balance)} />
        <Stat label="Your staked FLOW" value={formatFlow(staked)} />
        <Stat label="Your earned rewards" value={formatFlow(earned)} />
        <Stat
          label="Reward schedule"
          value={
            scheduleState?.active
              ? `${formatFlow(scheduleState.ratePerDay, 2)} FLOW/day`
              : "No funded schedule"
          }
        />
        <Stat label="Reward inventory" value={formatFlow(inventory)} />
        <Stat
          label="Schedule window"
          value={scheduleState?.active ? formatDays(scheduleState.remainingSeconds) : "—"}
        />
        <Stat label="Total staked (vault)" value={formatFlow(totalStaked)} />
        <Stat label="Minimum stake" value={`${formatFlow(minStake)} FLOW`} />
      </div>

      <div className="space-y-3 border-t border-hairline p-4">
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-soft">
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Wallet not connected"}
          </span>
          <button
            type="button"
            onClick={() => void readState()}
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
            {blockedCopy ??
              "The BOT Testnet vault is deployed, verified and funded with a 100,000 FLOW reward inventory over a 30-day schedule."}{" "}
            Staking uses the existing fixed-supply FLOW token as principal and pays rewards only from
            that separately pre-funded inventory — it never mints FLOW. Your reward share depends on
            the live on-chain reward rate and total staked, so no APR/APY is quoted. There is no
            lock-up, cooldown or early-withdraw penalty: principal stays withdrawable at any time.
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
          Stake FLOW — user staking opens in the next gate
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
