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
 * FlowBridge V13.3 — FLOW staking BOT Testnet panel.
 *
 * Reads authoritative on-chain state and lets the connected wallet run the full
 * lifecycle: exact-amount approve -> stake -> claim staking reward -> withdraw
 * principal. Every wallet signature is an explicit user click; nothing is ever
 * auto-submitted or batched. No APR/APY is hardcoded — any rate shown is
 * derived live from rewardRate/totalStaked and labelled a testnet estimate.
 */

const FLOW_DECIMALS = 18n;
const SELECTORS = {
  balanceOf: "0x70a08231",
  allowance: "0xdd62ed3e",
  approve: "0x095ea7b3",
  totalStaked: "0x817b1cd2",
  rewardRate: "0x7b0a47ee",
  periodFinish: "0xebe2b12b",
  minStake: "0x375b3c0a",
  rewardInventory: "0x7e7ae4aa",
  earned: "0x008cc262",
  paused: "0x5c975abb",
  stake: "0xa694fc3a",
  withdraw: "0x2e1a7d4d",
  claimReward: "0xb88a802f",
} as const;

const word = (value: bigint) => value.toString(16).padStart(64, "0");
const addrWord = (value: string) => value.toLowerCase().replace(/^0x/, "").padStart(64, "0");

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

function parseFlow(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
  const [whole, frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(Number(FLOW_DECIMALS))).slice(0, Number(FLOW_DECIMALS));
  return BigInt(whole || "0") * 10n ** FLOW_DECIMALS + BigInt(padded || "0");
}

function formatDays(seconds: bigint): string {
  const days = Number(seconds) / 86400;
  return days >= 1 ? `${days.toFixed(1)}d left` : `${Math.max(0, Math.round(Number(seconds) / 3600))}h left`;
}

/** Live testnet estimate only: annualised emission over current total staked. */
function deriveEstimatedApr(rewardRate: bigint | null, totalStaked: bigint | null): string | null {
  if (!rewardRate || !totalStaked || rewardRate <= 0n || totalStaked <= 0n) return null;
  const pct = Number((rewardRate * 31_536_000n * 10_000n) / totalStaked) / 100;
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return `${pct.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`;
}

type TxKind = "approve" | "stake" | "claim" | "withdraw";

export function FlowStakingPreviewCard({
  flowPoints,
  campaignPts,
}: {
  flowPoints?: number | null;
  campaignPts?: number | null;
}) {
  const chain = getFlowStakingChainConfig(BOT_TESTNET_CHAIN_ID)!;

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [staked, setStaked] = useState<bigint | null>(null);
  const [earned, setEarned] = useState<bigint | null>(null);
  const [minStake, setMinStake] = useState<bigint | null>(null);
  const [inventory, setInventory] = useState<bigint | null>(null);
  const [rewardRate, setRewardRate] = useState<bigint | null>(null);
  const [periodFinish, setPeriodFinish] = useState<bigint | null>(null);
  const [totalStaked, setTotalStaked] = useState<bigint | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<TxKind | null>(null);
  const [lastTx, setLastTx] = useState<{ kind: TxKind; hash: string } | null>(null);
  const [amountInput, setAmountInput] = useState("10");

  const scheduleFunded = (inventory ?? 0n) > 0n && (rewardRate ?? 0n) > 0n;
  const readiness = resolveFlowStakingReadiness(BOT_TESTNET_CHAIN_ID, scheduleFunded);
  const blockedCopy = readiness.ready ? null : FLOW_STAKING_BLOCKED_COPY[readiness.reason];
  const scheduleState = describeRewardSchedule({
    rewardRatePerSecond: rewardRate,
    periodFinish,
    totalStaked,
    nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
  });
  const estimatedApr = deriveEstimatedApr(rewardRate, totalStaked);

  const amount = parseFlow(amountInput);
  const onRightChain = chainId === BOT_TESTNET_CHAIN_ID;
  const belowMin = amount != null && minStake != null && amount < minStake && (staked ?? 0n) === 0n;
  const overBalance = amount != null && balance != null && amount > balance;
  const needsApproval = amount != null && (allowance ?? 0n) < amount;

  const readState = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth || !chain.token || !chain.vault) return;
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
      const rawChain: string = await eth.request({ method: "eth_chainId" });
      setChainId(Number(BigInt(rawChain)));
      const accounts: string[] = await eth.request({ method: "eth_accounts" });
      const addr = accounts?.[0] ?? null;
      setAccount(addr);

      const [ms, inv, rate, finish, total, isPaused] = await Promise.all([
        call(chain.vault, SELECTORS.minStake),
        call(chain.vault, SELECTORS.rewardInventory),
        call(chain.vault, SELECTORS.rewardRate),
        call(chain.vault, SELECTORS.periodFinish),
        call(chain.vault, SELECTORS.totalStaked),
        call(chain.vault, SELECTORS.paused),
      ]);
      setMinStake(ms);
      setInventory(inv);
      setRewardRate(rate);
      setPeriodFinish(finish);
      setTotalStaked(total);
      setPaused(isPaused === 1n);

      if (!addr) {
        setBalance(null);
        setAllowance(null);
        setStaked(null);
        setEarned(null);
        return;
      }
      const arg = addrWord(addr);
      setBalance(await call(chain.token, `${SELECTORS.balanceOf}${arg}`));
      setAllowance(await call(chain.token, `${SELECTORS.allowance}${arg}${addrWord(chain.vault)}`));
      setStaked(await call(chain.vault, `${SELECTORS.balanceOf}${arg}`));
      setEarned(await call(chain.vault, `${SELECTORS.earned}${arg}`));
    } catch {
      setError("Could not read on-chain staking state. Switch to BOT Testnet and retry.");
    } finally {
      setLoading(false);
    }
  }, [chain.token, chain.vault]);

  useEffect(() => {
    void readState();
  }, [readState]);

  useEffect(() => {
    if (!earned || earned <= 0n) return;
    const timer = setInterval(() => void readState(), 20_000);
    return () => clearInterval(timer);
  }, [earned, readState]);

  const send = useCallback(
    async (kind: TxKind, to: string, data: string) => {
      const eth = (window as any).ethereum;
      if (!eth) return;
      setError(null);
      setPending(kind);
      try {
        const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
        const from = accounts?.[0];
        if (!from) throw new Error("No wallet account");
        const hash: string = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from, to, data }],
        });
        setLastTx({ kind, hash });
        // Poll for the receipt; never auto-submit anything else.
        for (let i = 0; i < 60; i += 1) {
          const receipt = await eth.request({ method: "eth_getTransactionReceipt", params: [hash] });
          if (receipt) {
            if (BigInt(receipt.status ?? "0x0") !== 1n) setError("Transaction reverted on-chain.");
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        await readState();
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Wallet request failed.");
      } finally {
        setPending(null);
      }
    },
    [readState],
  );

  const disabledBase = !account || !onRightChain || pending != null || !chain.vault || !chain.token;

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
        <Stat label="Your earned rewards" value={formatFlow(earned, 8)} />
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
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-soft">
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

        {/* Amount + lifecycle actions — each button is one explicit wallet signature. */}
        <div className="space-y-2 rounded-xl border border-hairline p-3">
          <label className="block font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted-soft">
            Amount to stake (FLOW)
          </label>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-hairline bg-card px-3 py-2 font-mono text-[14px] font-black tabular-nums outline-none"
              placeholder="10"
            />
            <button
              type="button"
              onClick={() => setAmountInput(formatFlow(minStake, 18))}
              className="shrink-0 rounded-lg border border-hairline px-2 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em]"
            >
              Min
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              label={needsApproval ? "Approve exact" : "Approved"}
              busy={pending === "approve"}
              disabled={disabledBase || !amount || !needsApproval || overBalance}
              onClick={() =>
                void send(
                  "approve",
                  chain.token!,
                  `${SELECTORS.approve}${addrWord(chain.vault!)}${word(amount!)}`,
                )
              }
            />
            <ActionButton
              label="Stake"
              busy={pending === "stake"}
              disabled={disabledBase || !amount || needsApproval || overBalance || belowMin || paused}
              onClick={() => void send("stake", chain.vault!, `${SELECTORS.stake}${word(amount!)}`)}
            />
            <ActionButton
              label="Claim reward"
              busy={pending === "claim"}
              disabled={disabledBase || (earned ?? 0n) <= 0n || paused}
              onClick={() => void send("claim", chain.vault!, SELECTORS.claimReward)}
            />
            <ActionButton
              label="Withdraw principal"
              busy={pending === "withdraw"}
              disabled={disabledBase || (staked ?? 0n) <= 0n}
              onClick={() =>
                void send("withdraw", chain.vault!, `${SELECTORS.withdraw}${word(staked!)}`)
              }
            />
          </div>

          <p className="text-[10px] leading-relaxed text-muted-soft">
            {!onRightChain && account
              ? "Switch your wallet to BOT Testnet 968 to stake."
              : belowMin
                ? `Minimum first stake is ${formatFlow(minStake)} FLOW.`
                : overBalance
                  ? "Amount exceeds your FLOW balance."
                  : paused
                    ? "Staking and reward claims are paused by the operator — principal withdrawal stays open."
                    : "Approval is requested for the exact amount only. Nothing is submitted without your wallet confirmation."}
          </p>

          {estimatedApr && (
            <p className="text-[10px] text-muted-soft">
              Current testnet estimate only, derived live from on-chain reward rate ÷ total staked:{" "}
              <span className="font-mono font-black text-foreground">{estimatedApr}</span> — not a
              guaranteed or mainnet APY.
            </p>
          )}

          {lastTx && (
            <p className="break-all font-mono text-[10px] text-muted-soft">
              Last {lastTx.kind} tx: {lastTx.hash}
            </p>
          )}
        </div>

        {error && <p className="break-words text-[11px] text-destructive">{error}</p>}

        <div className="rounded-xl border border-hairline p-3 text-[11px] leading-relaxed text-muted-soft">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-foreground">
            <Info className="h-3.5 w-3.5" /> Status
          </span>
          <p className="mt-1.5">
            {blockedCopy ??
              "The BOT Testnet vault is deployed, verified and funded with a 100,000 FLOW reward inventory over a 30-day schedule."}{" "}
            Staking uses the existing fixed-supply FLOW token as principal and pays rewards only from
            that separately pre-funded inventory — it never mints FLOW. There is no lock-up, cooldown
            or early-withdraw penalty: principal stays withdrawable at any time, even while paused.
          </p>
          <p className="mt-2">
            Staking rewards are paid from the vault's pre-funded FLOW inventory — they are not FLOW
            Points. FLOW Points ({(flowPoints ?? 0).toLocaleString("en-US")} PTS) and Campaign PTS (
            {(campaignPts ?? 0).toLocaleString("en-US")}) are adjacent ecosystem metrics only and are
            never affected by staking, claiming or withdrawing.
          </p>
        </div>
      </div>
    </Surface>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-hairline py-2.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
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
