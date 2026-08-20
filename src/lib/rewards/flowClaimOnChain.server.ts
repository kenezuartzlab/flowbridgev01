/**
 * FlowBridge V12.3 — server-side on-chain reads for the FLOW claim path.
 *
 * Read-only. Never broadcasts, never signs, never mutates. Used by the claim
 * authority so that `claimableDelta` and the distributor's funded balance are
 * reconciled against chain truth before any signature is issued.
 */
import { BOT_TESTNET_CHAIN_ID, type Hex } from "./flowRewardsRegistry";

const RPC_BY_CHAIN: Record<number, string> = {
  [BOT_TESTNET_CHAIN_ID]: "https://rpc.bohr.life",
};

function rpcUrlFor(chainId: number): string {
  if (chainId === BOT_TESTNET_CHAIN_ID) {
    return process.env["BOT_TESTNET_RPC_URL"] || RPC_BY_CHAIN[chainId]!;
  }
  const url = RPC_BY_CHAIN[chainId];
  if (!url) throw new Error("NO_RPC_FOR_CHAIN");
  return url;
}

async function ethCall(chainId: number, to: Hex, data: string): Promise<bigint> {
  const res = await fetch(rpcUrlFor(chainId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const json: any = await res.json();
  if (json?.error || typeof json?.result !== "string") throw new Error("RPC_CALL_FAILED");
  return BigInt(json.result === "0x" ? "0x0" : json.result);
}

const pad = (addr: string) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/** keccak256("claimed(address)") selector. */
const CLAIMED_SELECTOR = "0xd6c0b2c4";
/** keccak256("balanceOf(address)") selector. */
const BALANCE_OF_SELECTOR = "0x70a08231";

export interface FlowClaimChainState {
  /** distributor.claimed[account] in FLOW base units. */
  alreadyClaimed: bigint;
  /** FLOW balance held by the distributor (pre-funded, never minted). */
  distributorBalance: bigint;
}

export async function readFlowClaimChainState(args: {
  chainId: number;
  token: Hex;
  distributor: Hex;
  account: Hex;
}): Promise<FlowClaimChainState> {
  const [alreadyClaimed, distributorBalance] = await Promise.all([
    ethCall(args.chainId, args.distributor, `${CLAIMED_SELECTOR}${pad(args.account)}`),
    ethCall(args.chainId, args.token, `${BALANCE_OF_SELECTOR}${pad(args.distributor)}`),
  ]);
  return { alreadyClaimed, distributorBalance };
}
