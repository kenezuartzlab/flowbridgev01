/**
 * V15.1 §3 — live staking evidence for Flow AI.
 *
 * Reads the funded BOT Testnet FlowStakingVault over public RPC (read-only
 * eth_call, no keys, no wallet). Every read is time-boxed so a slow RPC
 * degrades the answer to "staking state unavailable" instead of hanging or
 * inviting the model to guess. Rates are labelled estimates, never APY.
 */
import type { EvidenceItem } from "./aiTypes";
import { BOT_TESTNET_CHAIN_ID, getFlowStakingChainConfig } from "@/lib/staking/flowStakingRegistry";

const RPC_URL = "https://rpc.bohr.life";
const TIMEOUT_MS = 4_000;

const SELECTORS = {
  balanceOf: "0x70a08231",
  totalStaked: "0x817b1cd2",
  rewardRate: "0x7b0a47ee",
  periodFinish: "0xebe2b12b",
  minStake: "0x375b3c0a",
  rewardInventory: "0x7e7ae4aa",
  earned: "0x008cc262",
  paused: "0x5c975abb",
} as const;

const addrWord = (a: string) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

async function ethCall(to: string, data: string): Promise<bigint> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: controller.signal,
    });
    const json = (await res.json()) as { result?: string };
    return BigInt(json.result && json.result !== "0x" ? json.result : "0x0");
  } finally {
    clearTimeout(timer);
  }
}

const ONE = 10n ** 18n;

function flow(raw: bigint, maxFrac = 4): string {
  const whole = raw / ONE;
  const frac = raw % ONE;
  const fracStr = frac.toString().padStart(18, "0").slice(0, maxFrac).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fracStr ? `.${fracStr}` : ""}`;
}

/**
 * Live vault state, plus the actor's own position when a wallet is bound.
 * Returns [] when the chain is unreachable so the caller can disclose a gap.
 */
export async function loadStakingEvidence(wallet?: string | null): Promise<EvidenceItem[]> {
  const chain = getFlowStakingChainConfig(BOT_TESTNET_CHAIN_ID);
  if (!chain?.vault || !chain.stakingEnabled) return [];

  try {
    const [minStake, inventory, rewardRate, periodFinish, totalStaked, paused] = await Promise.all([
      ethCall(chain.vault, SELECTORS.minStake),
      ethCall(chain.vault, SELECTORS.rewardInventory),
      ethCall(chain.vault, SELECTORS.rewardRate),
      ethCall(chain.vault, SELECTORS.periodFinish),
      ethCall(chain.vault, SELECTORS.totalStaked),
      ethCall(chain.vault, SELECTORS.paused),
    ]);

    let staked: bigint | null = null;
    let earned: bigint | null = null;
    if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      const arg = addrWord(wallet);
      [staked, earned] = await Promise.all([
        ethCall(chain.vault, `${SELECTORS.balanceOf}${arg}`),
        ethCall(chain.vault, `${SELECTORS.earned}${arg}`),
      ]);
    }

    const observedAt = new Date().toISOString();
    const finished = Number(periodFinish) * 1000 <= Date.now();
    // Estimate only: rewardRate is per-second across the whole pool.
    const yearly = rewardRate * 31_536_000n;
    const rateEstimate =
      totalStaked > 0n ? `${((Number(yearly) / Number(totalStaked)) * 100).toFixed(2)}%` : "n/a";

    const items: EvidenceItem[] = [
      {
        id: "chain.staking.vault",
        label: `FLOW staking vault state (${chain.label})`,
        dataClass: "ON_CHAIN",
        authority: "AUTHORITATIVE_STATE",
        freshness: "REALTIME",
        observedAt,
        url: `https://scan.bohr.life/address/${chain.vault}`,
        value: {
          chainId: chain.chainId,
          vault: chain.vault,
          paused: paused === 1n,
          minStakeFlow: flow(minStake),
          totalStakedFlow: flow(totalStaked),
          rewardInventoryFlow: flow(inventory),
          scheduleEnded: finished,
          periodFinishIso: new Date(Number(periodFinish) * 1000).toISOString(),
          rateEstimateAnnualized: rateEstimate,
          rateIsEstimateNotApy: true,
        },
        excerpt: `${chain.label} vault: ${flow(totalStaked)} FLOW staked, minimum stake ${flow(minStake)} FLOW, reward inventory ${flow(inventory)} FLOW, schedule ${finished ? "ended" : "active"}${paused === 1n ? ", vault paused" : ""}. Current pool-wide rate estimate ${rateEstimate} annualized — a testnet estimate, not a guaranteed APY.`,
      },
    ];

    if (staked != null && earned != null) {
      items.push({
        id: "chain.staking.position",
        label: "Your FLOW staking position",
        dataClass: "ON_CHAIN",
        authority: "AUTHORITATIVE_STATE",
        freshness: "REALTIME",
        observedAt,
        value: {
          stakedFlow: flow(staked, 8),
          earnedFlow: flow(earned, 8),
          principalAlwaysWithdrawable: true,
        },
        excerpt: `You have ${flow(staked, 8)} FLOW staked with ${flow(earned, 8)} FLOW earned but unclaimed. Principal is always withdrawable; you sign every stake, claim and withdrawal yourself on /stake.`,
      });
    }

    return items;
  } catch {
    return [];
  }
}

/** Campaign PTS earned by the actor's bound wallet — separate from FLOW Points. */
export async function loadCampaignPointsEvidence(wallet?: string | null): Promise<EvidenceItem[]> {
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) return [];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("campaign_completions")
      .select("campaign_id,task_id,points,completed_at")
      .eq("user_wallet", wallet.toLowerCase())
      .order("completed_at", { ascending: false })
      .limit(25);
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const total = rows.reduce((sum: number, r: any) => sum + Number(r.points ?? 0), 0);
    return [
      {
        id: "db.campaigns.mine",
        label: "Your campaign PTS record",
        dataClass: "FLOWBRIDGE_DB",
        authority: "AUTHORITATIVE_STATE",
        freshness: "REALTIME",
        observedAt: new Date().toISOString(),
        value: { totalCampaignPts: total, completions: rows.length, recent: rows.slice(0, 5) },
        excerpt: `Campaign PTS ${total} across ${rows.length} verified task completion${rows.length === 1 ? "" : "s"}. Campaign PTS are separate from FLOW Points and are not FLOW tokens.`,
      },
    ];
  } catch {
    return [];
  }
}
