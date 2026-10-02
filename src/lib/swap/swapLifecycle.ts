import { upsertLiquidityActivity, type LiquidityActivity, type TxPhase } from "@/lib/liquidity/lifecycle";

export interface RoutedSwapActivityInput {
  id: string;
  chainId: number;
  wallet: string;
  pair: string;
  dex: string;
  amount: string;
}

export function createRoutedSwapActivity(input: RoutedSwapActivityInput): LiquidityActivity {
  return { ...input, kind: "routed-swap", amounts: [input.amount], createdAt: Date.now(), txs: [] };
}

export function recordRoutedSwapTx(activity: LiquidityActivity, tx: { hash: string; label: string; phase: TxPhase }) {
  const existing = activity.txs.find((t) => t.hash.toLowerCase() === tx.hash.toLowerCase());
  if (existing) Object.assign(existing, tx);
  else activity.txs.push(tx);
  upsertLiquidityActivity(activity);
}

export function atomicFailureMessage(): string {
  return "Transaction failed. Your route was not automatically resubmitted.";
}
