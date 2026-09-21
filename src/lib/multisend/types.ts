/**
 * FlowBridge MultiSend V1 — canonical app types.
 *
 * One source wallet per on-chain call. A session groups the independent source
 * transactions a user authorizes under one app-generated clientBatchId.
 */
export type MultiSendMode = "one-to-many" | "many-to-one" | "many-to-many";
export type AssetKind = "native" | "erc20";

export type Address = `0x${string}`;

export interface TransferRow {
  id: string;
  source: Address;
  recipient: Address;
  amount: bigint;
}

export interface SourceExecutionPlan {
  source: Address;
  recipients: Address[];
  amounts: bigint[];
  recipientsTotal: bigint;
  serviceFee: bigint;
  requiredAssetSpend: bigint;
  transactionCount: 1;
}

export interface MultiSendPlan {
  mode: MultiSendMode;
  clientBatchId: `0x${string}`;
  feeBps: number;
  sources: SourceExecutionPlan[];
  recipientsTotal: bigint;
  serviceFeeTotal: bigint;
  sourceWalletCount: number;
  transferRowCount: number;
  destinationWalletCount: number;
}

/** Live on-chain configuration snapshot taken for Review and re-checked before signing. */
export interface MultiSendConfig {
  contract: Address;
  chainId: number;
  feeBps: number;
  feeRecipient: Address;
  maxRecipients: number;
  configNonce: bigint;
  paused: boolean;
}

export function configFingerprint(c: MultiSendConfig): string {
  return [
    c.chainId,
    c.contract.toLowerCase(),
    c.feeBps,
    c.feeRecipient.toLowerCase(),
    c.maxRecipients,
    c.configNonce.toString(),
    c.paused ? "paused" : "live",
  ].join("|");
}

export type SourceStatus =
  | "draft"
  | "ready"
  | "awaiting-approval"
  | "awaiting-signature"
  | "submitted"
  | "confirmed"
  | "failed"
  | "cancelled";

export type SessionStatus =
  | "draft"
  | "ready"
  | "in-progress"
  | "completed"
  | "partially-completed"
  | "failed"
  | "cancelled";

export interface SourceReceipt {
  source: Address;
  status: SourceStatus;
  txHash?: `0x${string}`;
  recipientCount: number;
  recipientsTotal: bigint;
  serviceFee: bigint;
  error?: string;
}

export interface MultiSendSession {
  clientBatchId: `0x${string}`;
  mode: MultiSendMode;
  chainId: number;
  assetKind: AssetKind;
  tokenAddress: Address | null;
  tokenSymbol: string;
  tokenDecimals: number;
  feeBps: number;
  configNonce: string;
  destination: Address | null;
  createdAt: number;
  updatedAt: number;
  receipts: SourceReceipt[];
}
