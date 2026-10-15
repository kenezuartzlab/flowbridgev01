/**
 * V36.3A — one-click publisher gate (pure). Applies the batch/day limits to a
 * prepared settlement and decides whether the connected wallet may be asked
 * for its single signature. Never signs; autonomous signing stays off.
 */
import { PUBLISHER_CONFIG } from "./settlementQueue";

export interface LimitInput { wallets: number; totalFlow: number; flowPublishedLast24h: number }
export type LimitCheck = { id: "MAX_WALLETS_PER_BATCH" | "MAX_FLOW_PER_BATCH" | "MAX_FLOW_PER_DAY"; pass: boolean; detail: string };

export function publisherLimitChecks(i: LimitInput, cfg = PUBLISHER_CONFIG): LimitCheck[] {
  return [
    { id: "MAX_WALLETS_PER_BATCH", pass: i.wallets <= cfg.maxWalletsPerEpoch, detail: `${i.wallets} / ${cfg.maxWalletsPerEpoch} wallets` },
    { id: "MAX_FLOW_PER_BATCH", pass: i.totalFlow <= cfg.maxFlowPerEpoch, detail: `${i.totalFlow} / ${cfg.maxFlowPerEpoch} FLOW` },
    { id: "MAX_FLOW_PER_DAY", pass: i.totalFlow + i.flowPublishedLast24h <= cfg.maxFlowPerDay, detail: `${i.totalFlow + i.flowPublishedLast24h} / ${cfg.maxFlowPerDay} FLOW in 24h` },
  ];
}

export type WalletGate = "OK" | "NOT_CONNECTED" | "WRONG_WALLET" | "WRONG_NETWORK" | "BATCH_NOT_READY" | "STALE" | "SIMULATION_FAILED";

export function publisherWalletGate(p: {
  connected: string | null; chainId: number | null; requiredSigner: string; ready: boolean; stale: boolean; simulationOk: boolean;
}): WalletGate {
  if (!p.ready) return "BATCH_NOT_READY";
  if (p.stale) return "STALE";
  if (!p.simulationOk) return "SIMULATION_FAILED";
  if (!p.connected) return "NOT_CONNECTED";
  if (p.connected.toLowerCase() !== p.requiredSigner.toLowerCase()) return "WRONG_WALLET";
  if (p.chainId !== 677) return "WRONG_NETWORK";
  return "OK";
}

export const WALLET_GATE_COPY: Record<WalletGate, string> = {
  OK: "Ready to request one signature from the publisher wallet.",
  NOT_CONNECTED: "Connect the authorized publisher wallet.",
  WRONG_WALLET: "Connected wallet is not the authorized publisher.",
  WRONG_NETWORK: "Switch the wallet to BOT Mainnet (677).",
  BATCH_NOT_READY: "Batch is not ready — see failed checks.",
  STALE: "Settlement changed — rebuild before signing.",
  SIMULATION_FAILED: "On-chain simulation failed — publication would revert.",
};

/** Publication is only ever "successful" after a confirmed receipt and full on-chain verification. */
export type PublishPhase = "IDLE" | "REVALIDATING" | "AWAITING_SIGNATURE" | "BROADCAST_PENDING" | "CONFIRMED_VERIFIED" | "CONFIRMED_MISMATCH" | "REVERTED" | "REJECTED" | "ERROR";
export function phaseFromVerification(receipt: "success" | "reverted" | null, complete: boolean): PublishPhase {
  if (receipt === null) return "BROADCAST_PENDING";
  if (receipt === "reverted") return "REVERTED";
  return complete ? "CONFIRMED_VERIFIED" : "CONFIRMED_MISMATCH";
}
