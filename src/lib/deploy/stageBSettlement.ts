/**
 * FlowBridge V30.1E.7 — Stage B settlement record
 * (FlowRewardsMerkleDistributor, BOT Mainnet 677).
 *
 * Public chain evidence only. No key material, no signing, no broadcast, no
 * funding path. The distributor is deployed empty and stays unfunded.
 */
import { STAGE_A_SETTLEMENT } from './stageASettlement';
import { STAGE_B_ARTIFACT, STAGE_B_CONSTRUCTOR_ARGS } from './stageBDeployer';

export const STAGE_B_SETTLEMENT = {
  stage: 'B_REWARDS_DISTRIBUTOR',
  status: 'STAGE_B_SETTLED',
  chainId: 677,
  deployer: '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD',
  txHash: '0x289727efd8830a6b767a2be05cdd1dec6f70900ac98877f336c5242b775ad4da',
  blockNumber: 21_317_987,
  nonce: 1,
  gasLimit: 1_978_948n,
  gasUsed: 1_509_124n,
  effectiveGasPriceWei: 20_000_000_000n,
  feeWei: 30_182_480_000_000_000n,
  receiptStatus: 'success',
  contractAddress: '0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB',
  runtimeBytes: 5861,
  onChainRuntimeSha256: '419095319aa817e2f0e94327ab9aaddbfedd71017c90af41066e5849cc40ce9f',
  /** All 100 byte differences vs the frozen runtime sit in the 5 `token` immutable slots. */
  runtimeParity: 'PROVEN_MODULO_IMMUTABLES',
  immutableDiffBytes: 100,
  token: STAGE_A_SETTLEMENT.contractAddress,
  admin: STAGE_B_CONSTRUCTOR_ARGS.admin_,
  budgetManager: STAGE_B_CONSTRUCTOR_ARGS.budgetManager_,
  publisher: STAGE_B_CONSTRUCTOR_ARGS.publisher_,
  pauser: STAGE_B_CONSTRUCTOR_ARGS.pauser_,
  recoveryRecipient: STAGE_B_CONSTRUCTOR_ARGS.recoveryRecipient_,
  minPublishDelay: 86_400,
  campaignBudgetWei: 0n,
  totalReservedWei: 0n,
  totalClaimedWei: 0n,
  epochCount: 0,
  distributorFlowBalanceWei: 0n,
  paused: false,
  adminIsDeployer: false,
  publisherIsDeployer: false,
  sourceVerification: 'EXPLORER_TRANSPORT_BLOCKED',
  releaseStatus: 'DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING',
  funding: 'NOT_FUNDED',
  stageC: 'NOT_STARTED',
} as const;

/** Stage B settles only when every economic and authority invariant holds exactly. */
export function stageBSettlementValid(): boolean {
  const s = STAGE_B_SETTLEMENT;
  return (
    s.chainId === 677 &&
    s.receiptStatus === 'success' &&
    s.gasUsed <= s.gasLimit &&
    s.runtimeBytes === STAGE_B_ARTIFACT.runtimeBytes &&
    s.runtimeParity === 'PROVEN_MODULO_IMMUTABLES' &&
    s.token === STAGE_A_SETTLEMENT.contractAddress &&
    s.minPublishDelay === 86_400 &&
    s.campaignBudgetWei === 0n &&
    s.totalReservedWei === 0n &&
    s.totalClaimedWei === 0n &&
    s.epochCount === 0 &&
    s.distributorFlowBalanceWei === 0n &&
    s.adminIsDeployer === false &&
    s.publisherIsDeployer === false &&
    s.funding === 'NOT_FUNDED' &&
    (STAGE_B_ARTIFACT.runtimeSha256 as string) !== (s.onChainRuntimeSha256 as string)
  );
}

/** Stage B is not release-complete until the explorer publishes the source. */
export function stageBReleaseComplete(): boolean {
  return (STAGE_B_SETTLEMENT.releaseStatus as string) === 'DEPLOYED_VERIFIED';
}
