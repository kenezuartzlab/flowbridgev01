import { liquidityWritesAllowed } from "./liquidityTokens";
import { getLiquidityVenues } from "./venues";
import type { LiquidityActivityKind } from "./lifecycle";

export function assertLiquidityExecution(input: {
  chainId: number; walletChainId?: number; wallet?: string; expectedWallet: string;
  dex: string; kind: LiquidityActivityKind; target: string;
}) {
  if (!liquidityWritesAllowed(input.chainId, input.wallet, input.dex)) throw new Error("Liquidity writes are not enabled on this network.");
  if (!input.wallet || input.wallet.toLowerCase() !== input.expectedWallet.toLowerCase()) throw new Error("Wallet changed. Review the transaction again.");
  if (input.walletChainId !== input.chainId) throw new Error("Switch your wallet to the reviewed network.");
  const venue = getLiquidityVenues(input.chainId).find(v => v.label === input.dex);
  if (!venue) throw new Error("Unknown liquidity venue.");
  const target = venue.kind === "v2" ? venue.router : venue.positionManager;
  if (target.toLowerCase() !== input.target.toLowerCase()) throw new Error("Liquidity contract does not match the reviewed venue.");
  const allowed = input.kind === "create-pool" ? venue.caps.createPool
    : input.kind === "add-liquidity" || input.kind === "increase-liquidity" ? venue.caps.addLiquidity
    : input.kind === "remove-liquidity" || input.kind === "decrease-liquidity" ? venue.caps.removeLiquidity
    : input.kind === "collect-fees" ? venue.caps.collectFees
    : input.kind === "burn-position" ? venue.caps.positionNft : false;
  if (!allowed) throw new Error("This liquidity action is not supported by this venue.");
}

export function approvalAmounts(current: bigint, required: bigint): bigint[] {
  if (required <= 0n) throw new Error("Approval amount must be positive.");
  return current === required ? [] : current === 0n ? [required] : [0n, required];
}

export function parseSlippagePercent(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const bps = Math.round(Number(value) * 100);
  return bps >= 1 && bps <= 5000 ? bps : null;
}