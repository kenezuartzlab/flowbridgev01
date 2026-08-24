/**
 * FlowBridge V27 §7 — plain-English staking calculator.
 *
 * Reads the live published schedule from the BOT Testnet vault (read-only
 * eth_call) and computes a PREVIEW estimate with the deterministic V27
 * calculator. No wallet is required, nothing is approved, nothing is submitted,
 * and no estimate is ever presented as income.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, RefreshCw } from "lucide-react";
import { StatusChip } from "@/components/ai/StatusChip";
import { computeStakingEstimate } from "@/lib/growth/stakingCalculator";
import {
  BOT_TESTNET_CHAIN_ID,
  getFlowStakingChainConfig,
} from "@/lib/staking/flowStakingRegistry";

const RPC_URL = "https://rpc.bohr.life";
const SELECTORS = {
  totalStaked: "0x817b1cd2",
  rewardRate: "0x7b0a47ee",
  periodFinish: "0xebe2b12b",
  minStake: "0x375b3c0a",
  rewardInventory: "0x7e7ae4aa",
} as const;

const WEI = 1e18;

interface VaultRead {
  rewardFlowPerSecond: number | null;
  totalStakedFlow: number | null;
  minStakeFlow: number | null;
  scheduleSecondsRemaining: number | null;
  rewardInventoryFlow: number | null;
}

const EMPTY_READ: VaultRead = {
  rewardFlowPerSecond: null,
  totalStakedFlow: null,
  minStakeFlow: null,
  scheduleSecondsRemaining: null,
  rewardInventoryFlow: null,
};

function fmt(n: number | null, frac = 4): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: frac });
}

export function StakingCalculatorCard() {
  const chain = getFlowStakingChainConfig(BOT_TESTNET_CHAIN_ID);
  const [read, setRead] = useState<VaultRead>(EMPTY_READ);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [amount, setAmount] = useState("500");
  const [days, setDays] = useState("30");

  const load = useCallback(async () => {
    if (!chain?.vault) {
      setLoading(false);
      setFailed(true);
      return;
    }
    setLoading(true);
    setFailed(false);
    const call = async (data: string) => {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: chain.vault, data }, "latest"],
        }),
      });
      const json = await res.json();
      const result: string | undefined = json?.result;
      return BigInt(result && result !== "0x" ? result : "0x0");
    };
    try {
      const [rate, total, min, finish, inventory] = await Promise.all([
        call(SELECTORS.rewardRate),
        call(SELECTORS.totalStaked),
        call(SELECTORS.minStake),
        call(SELECTORS.periodFinish),
        call(SELECTORS.rewardInventory),
      ]);
      const nowSec = Math.floor(Date.now() / 1000);
      setRead({
        rewardFlowPerSecond: Number(rate) / WEI,
        totalStakedFlow: Number(total) / WEI,
        minStakeFlow: Number(min) / WEI,
        scheduleSecondsRemaining: Math.max(0, Number(finish) - nowSec),
        rewardInventoryFlow: Number(inventory) / WEI,
      });
    } catch {
      setRead(EMPTY_READ);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [chain?.vault]);

  useEffect(() => {
    void load();
  }, [load]);

  const result = useMemo(
    () =>
      computeStakingEstimate({
        amountFlow: Number(amount) || 0,
        days: Number(days) || 0,
        ...read,
      }),
    [amount, days, read],
  );

  return (
    <section className="fb-surface overflow-hidden" data-testid="staking-calculator">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <p className="fb-eyebrow flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          Staking calculator
        </p>
        <div className="flex items-center gap-2">
          <StatusChip status="PREVIEW" label="Preview · estimate" />
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh published rate"
            className="grid h-7 w-7 place-items-center rounded-xl border border-hairline text-muted transition-colors hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-3.5 p-3.5 sm:p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="fb-eyebrow">Amount (FLOW)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              data-testid="calc-amount"
              className="mt-1.5 w-full rounded-xl border border-hairline bg-background px-3 py-2 font-mono text-[13px] font-black tabular-nums outline-none focus:border-primary/50"
            />
          </label>
          <label className="block">
            <span className="fb-eyebrow">Days</span>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              data-testid="calc-days"
              className="mt-1.5 w-full rounded-xl border border-hairline bg-background px-3 py-2 font-mono text-[13px] font-black tabular-nums outline-none focus:border-primary/50"
            />
          </label>
        </div>

        <div className="fb-inset grid grid-cols-2 gap-2.5 rounded-2xl p-3">
          <Fact label="Published rate" value={`${fmt(read.rewardFlowPerSecond ? read.rewardFlowPerSecond * 86400 : null)} FLOW/day`} />
          <Fact label="Total staked" value={`${fmt(read.totalStakedFlow, 2)} FLOW`} />
          <Fact label="Minimum first stake" value={`${fmt(read.minStakeFlow)} FLOW`} />
          <Fact
            label="Schedule left"
            value={
              read.scheduleSecondsRemaining === null
                ? "—"
                : `${fmt(read.scheduleSecondsRemaining / 86400, 1)} days`
            }
          />
        </div>

        <div className="rounded-2xl border border-primary/25 bg-primary/8 p-3">
          <p className="fb-eyebrow text-primary">Estimated reward · Preview</p>
          <p
            className="mt-1 font-mono text-[20px] font-black tabular-nums"
            data-testid="calc-estimate"
          >
            {result.estimatedRewardFlow === null
              ? "—"
              : `${fmt(result.estimatedRewardFlow)} FLOW`}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{result.formula}</p>
        </div>

        {failed && (
          <p className="text-[11px] leading-relaxed text-muted">
            The published rate could not be read right now, so no estimate is shown. Nothing is
            guessed here.
          </p>
        )}

        <details className="rounded-2xl border border-hairline p-3">
          <summary className="cursor-pointer font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted">
            Assumptions & limits
          </summary>
          <ul className="mt-2 space-y-1.5">
            {[...result.assumptions, ...result.limits].map((line) => (
              <li key={line} className="flex gap-2 text-[11px] leading-relaxed text-muted-soft">
                <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-muted-soft" />
                {line}
              </li>
            ))}
          </ul>
        </details>

        <p className="text-[10px] leading-relaxed text-muted-soft">
          Preview only — not income and not a guarantee. Staking itself always happens on the staking
          screen with your own wallet confirmations.
        </p>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="block">
      <span className="block font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted-soft">
        {label}
      </span>
      <span className="mt-1 block font-mono text-[12px] font-black tabular-nums">{value}</span>
    </span>
  );
}
