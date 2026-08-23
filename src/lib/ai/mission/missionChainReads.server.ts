/**
 * FlowBridge V17.1 §3/§5/§6 — canonical chain reads used to ADVANCE a mission.
 *
 * Read-only JSON-RPC. Never signs, never submits, never approves. A mission may
 * only advance from values read here (or from the V15.3M verified-activity
 * ledger); a wallet approval, a submitted hash or an optimistic UI never counts.
 */
import { getFlowRewardsChainConfig } from "@/lib/rewards/flowRewardsRegistry";
import { getFlowStakingChainConfig } from "@/lib/staking/flowStakingRegistry";

const DEFAULT_RPC = "https://rpc.bohr.life";
const TIMEOUT_MS = 6_000;

function rpcUrlFor(chainId: number): string {
  if (chainId === 968) return process.env["BOT_TESTNET_RPC_URL"] || DEFAULT_RPC;
  return DEFAULT_RPC;
}

async function rpc<T = any>(chainId: number, method: string, params: unknown[]): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(rpcUrlFor(chainId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const json: any = await res.json();
    if (json?.error) return null;
    return json?.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const word = (addr: string) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

async function callUint(chainId: number, to: string, data: string): Promise<bigint | null> {
  const result = await rpc<string>(chainId, "eth_call", [{ to, data }, "latest"]);
  if (typeof result !== "string") return null;
  try {
    return BigInt(result === "0x" ? "0x0" : result);
  } catch {
    return null;
  }
}

/** keccak256 selectors (already used elsewhere in the codebase). */
const SEL = {
  claimed: "0xc884ef83", // claimed(address) on FlowRewardsDistributor
  balanceOf: "0x70a08231", // balanceOf(address)
  minStake: "0x375b3c0a", // minStake() on FlowStakingVault
  paused: "0x5c975abb", // paused()
  allowance: "0xdd62ed3e", // allowance(address,address)
} as const;

export interface ClaimChainState {
  chainId: number;
  distributor: string;
  token: string;
  /** distributor.claimed[account] — cumulative FLOW delivered, base units. */
  claimedWei: bigint;
  /** Wallet FLOW balance, base units. */
  walletFlowWei: bigint;
  blockNumber: number | null;
}

export async function readClaimState(input: {
  chainId: number;
  account: string;
}): Promise<ClaimChainState | null> {
  const cfg = getFlowRewardsChainConfig(input.chainId);
  if (!cfg?.distributor || !cfg.token) return null;
  const [claimedWei, walletFlowWei, blockHex] = await Promise.all([
    callUint(input.chainId, cfg.distributor, `${SEL.claimed}${word(input.account)}`),
    callUint(input.chainId, cfg.token, `${SEL.balanceOf}${word(input.account)}`),
    rpc<string>(input.chainId, "eth_blockNumber", []),
  ]);
  if (claimedWei == null || walletFlowWei == null) return null;
  return {
    chainId: input.chainId,
    distributor: cfg.distributor,
    token: cfg.token,
    claimedWei,
    walletFlowWei,
    blockNumber: typeof blockHex === "string" ? Number(BigInt(blockHex)) : null,
  };
}

export interface StakeChainState {
  chainId: number;
  vault: string;
  token: string;
  /** vault.balanceOf(account) — the user's staked position, base units. */
  stakedWei: bigint;
  minStakeWei: bigint | null;
  paused: boolean;
  /** token.allowance(account, vault). */
  allowanceWei: bigint | null;
  walletFlowWei: bigint | null;
  blockNumber: number | null;
}

export async function readStakeState(input: {
  chainId: number;
  account: string;
}): Promise<StakeChainState | null> {
  const cfg = getFlowStakingChainConfig(input.chainId);
  if (!cfg?.vault || !cfg.token) return null;
  const [stakedWei, minStakeWei, pausedWei, allowanceWei, walletFlowWei, blockHex] = await Promise.all([
    callUint(input.chainId, cfg.vault, `${SEL.balanceOf}${word(input.account)}`),
    callUint(input.chainId, cfg.vault, SEL.minStake),
    callUint(input.chainId, cfg.vault, SEL.paused),
    callUint(input.chainId, cfg.token, `${SEL.allowance}${word(input.account)}${word(cfg.vault)}`),
    callUint(input.chainId, cfg.token, `${SEL.balanceOf}${word(input.account)}`),
    rpc<string>(input.chainId, "eth_blockNumber", []),
  ]);
  if (stakedWei == null) return null;
  return {
    chainId: input.chainId,
    vault: cfg.vault,
    token: cfg.token,
    stakedWei,
    minStakeWei,
    paused: pausedWei === 1n,
    allowanceWei,
    walletFlowWei,
    blockNumber: typeof blockHex === "string" ? Number(BigInt(blockHex)) : null,
  };
}

export interface ReceiptFacts {
  status: "success" | "reverted";
  from: string | null;
  to: string | null;
  blockNumber: number | null;
}

/** A receipt PROVES inclusion only; canonical state reads still decide progress. */
export async function readReceipt(input: {
  chainId: number;
  txHash: string;
}): Promise<ReceiptFacts | null> {
  const r = await rpc<any>(input.chainId, "eth_getTransactionReceipt", [input.txHash]);
  if (!r || typeof r !== "object") return null;
  return {
    status: String(r.status) === "0x1" ? "success" : "reverted",
    from: typeof r.from === "string" ? r.from.toLowerCase() : null,
    to: typeof r.to === "string" ? r.to.toLowerCase() : null,
    blockNumber: typeof r.blockNumber === "string" ? Number(BigInt(r.blockNumber)) : null,
  };
}
