// V1.16 direct-EOA governance exception — PURE, NON-EXECUTABLE.
// No network, signer, constructor calldata, deployment or role configuration. Chain facts are read-only inputs.
import { BNB_EXECUTION_ENABLED } from './executionReviewPolicy';

export const LAUNCH_HOLD = true as const;
export const OWNER_INPUT_STATUS = 'OWNER_DIRECT_EOA_CHOICE_RECORDED' as const;
export const OWNER_EOA_EXCEPTION_STATUS = 'OWNER_EOA_EXCEPTION_PROPOSED' as const;
export const PREFERRED_GOVERNANCE_STANDARD = 'SEPARATE_BNB56_SAFES_PREFER_2_OF_3' as const;
export const OWNER_DIRECT_EOA_ADDRESSES = {
  guardian: '0x351E236a636c8be4Fa0B602cb096d72346D1a412',
  treasury: '0xb7322660B40561ae7C224F963e51583e923F7fC8',
} as const;
export const FIXED_PROTOCOL_TARGETS = {
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  PANCAKE_V3_ROUTER: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
} as const;
export const EMPTY_CODE_KECCAK = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' as const;
export const HISTORIC_OWNER_EOA_EVIDENCE = {
  blockNumber: 135_782_648,
  blockHash: '0xef694504e51e2949ed0b71fa4470cb1a4c1fee3cf60962d14b34be3994c35828',
  observedAtUnixSec: 1_795_667_254,
  evidenceGeneration: 'HISTORICAL_READINESS',
  refreshRequiredAtFinalPreparation: true,
} as const;

/** The earlier Safe recommendation remains the preferred standard, not a silently relaxed rule. */
export const OWNER_INPUT_CHECKLIST = [
  { id: 'OI-01', request: 'Direct regular-wallet EOAs are the owner preference for the exact Guardian and Treasury inputs; final EOA risk acknowledgment remains separate.', proposal: 'Prefer separate 2-of-3 BNB56 Safes; OWNER_EOA_EXCEPTION_PROPOSED is not deployment authorization.', status: OWNER_INPUT_STATUS },
  { id: 'OI-02', request: 'Choose 0, 5 or 10 bps and explicitly consent to output-fee payment to the selected direct EOA Treasury.', proposal: 'Recipient preference is recorded; fee bps and payable configuration are not selected.', status: OWNER_INPUT_STATUS },
  { id: 'OI-03', request: 'Acknowledge single-key pause/unpause, immutable Guardian loss and immutable Treasury compromise risks, plus pause/recovery policy.', proposal: 'No rotation, sweep, upgrade, key or recovery-phrase collection.', status: OWNER_INPUT_STATUS },
  { id: 'OI-04', request: 'Confirm slippage, maximum swap size and user-approved minNetOut versus signed-quote policy.', proposal: 'Current review ceiling is 1 BNB / 1,000 USDT, 1% slippage and no server quote signing.', status: 'OWNER_DECISION_PENDING' },
  { id: 'OI-05', request: 'Refresh both exact addresses on two BNB56 RPCs at one new pinned block during final deployment preparation and record final source-hash acceptance UTC date.', proposal: 'Historical empty-code evidence is not final-preparation evidence; any source change resets review.', status: 'OWNER_DECISION_PENDING' },
] as const;

export type SafeFacts = {
  address: string;
  chainId: number;
  hasCode: boolean;
  owners: string[];
  threshold: number;
  observedAtBlock: number;
  evidence: 'READ_ONLY_CHAIN56_RPC';
};
export type GovernanceStatus = 'NOT_CONFIGURED' | 'INVALID' | 'READY_FOR_HUMAN_REVIEW';
export type GovernanceReason =
  | typeof OWNER_EOA_EXCEPTION_STATUS | 'BAD_CHECKSUM' | 'WRONG_CHAIN' | 'NO_CODE' | 'PROTOCOL_TARGET'
  | 'THRESHOLD_TOO_LOW' | 'GUARDIAN_EQUALS_TREASURY' | 'OWNERS_OVERLAP_FULLY'
  | 'INVALID_OWNER' | 'UNVERIFIED_CHAIN_OBSERVATION';

/** Development may proceed with mocks and read-only evidence while financial launch remains held. */
export function developmentReadiness() {
  return {
    status: 'PASS_FOR_NON_EXECUTABLE_DEVELOPMENT',
    ownerInput: OWNER_INPUT_STATUS,
    governanceException: OWNER_EOA_EXCEPTION_STATUS,
    riskAcknowledgment: 'PENDING',
    feeBpsSelected: null,
    launch: 'HOLD',
    executionEnabled: BNB_EXECUTION_ENABLED,
    financialActionsAuthorized: false,
  } as const;
}

// EIP-55 checksum validation via injected keccak (keeps module dependency-free and testable).
export function isChecksumAddress(a: string, keccakHex: (lowerHexNo0x: string) => string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return false;
  const body = a.slice(2), h = keccakHex(body.toLowerCase());
  for (let i = 0; i < 40; i++) {
    const c = body[i]!, n = parseInt(h[i]!, 16);
    if (/[a-f]/.test(c) && n > 7) return false;
    if (/[A-F]/.test(c) && n <= 7) return false;
  }
  return true;
}

const isTarget = (a: string) => Object.values(FIXED_PROTOCOL_TARGETS).some((t) => t.toLowerCase() === a.toLowerCase());
const isZero = (a: string) => /^0x0{40}$/i.test(a);

/** Preferred multisig assessment is unchanged and is not relaxed by the separate direct-EOA exception. */
export function assessGovernance(
  guardian: SafeFacts | null, treasury: SafeFacts | null, keccakHex: (s: string) => string,
): { status: GovernanceStatus; reasons: GovernanceReason[]; canConfigureRoles: false } {
  if (!guardian || !treasury) return { status: 'NOT_CONFIGURED', reasons: [OWNER_EOA_EXCEPTION_STATUS], canConfigureRoles: false };
  const r = new Set<GovernanceReason>();
  for (const s of [guardian, treasury]) {
    if (!isChecksumAddress(s.address, keccakHex) || isZero(s.address)) r.add('BAD_CHECKSUM');
    if (s.chainId !== 56) r.add('WRONG_CHAIN');
    if (s.evidence !== 'READ_ONLY_CHAIN56_RPC' || !Number.isSafeInteger(s.observedAtBlock) || s.observedAtBlock <= 0) r.add('UNVERIFIED_CHAIN_OBSERVATION');
    if (!s.hasCode) r.add('NO_CODE');
    if (isTarget(s.address)) r.add('PROTOCOL_TARGET');
    if (!Number.isInteger(s.threshold) || s.threshold < 2 || s.threshold > s.owners.length) r.add('THRESHOLD_TOO_LOW');
    const normalizedOwners = s.owners.map((owner) => owner.toLowerCase());
    if (s.owners.length === 0 || new Set(normalizedOwners).size !== s.owners.length || s.owners.some((owner) => isZero(owner) || !isChecksumAddress(owner, keccakHex))) r.add('INVALID_OWNER');
  }
  if (guardian.address.toLowerCase() === treasury.address.toLowerCase()) r.add('GUARDIAN_EQUALS_TREASURY');
  const g = new Set(guardian.owners.map((o) => o.toLowerCase()));
  if (treasury.owners.length > 0 && treasury.owners.every((o) => g.has(o.toLowerCase())) && treasury.owners.length === g.size) r.add('OWNERS_OVERLAP_FULLY');
  return { status: r.size ? 'INVALID' : 'READY_FOR_HUMAN_REVIEW', reasons: [...r], canConfigureRoles: false };
}

export const DIRECT_EOA_RISKS = [
  { id: 'SINGLE_KEY_PAUSE_CONTROL', risk: 'One Guardian private key can pause and unpause every user swap.' },
  { id: 'GUARDIAN_COMPROMISE', risk: 'Guardian key compromise lets an attacker toggle pause and disrupt trading.' },
  { id: 'IMMUTABLE_GUARDIAN_LOSS', risk: 'Lost Guardian key has no recovery or rotation; if paused, users may remain blocked indefinitely without redeployment.' },
  { id: 'IMMUTABLE_TREASURY_COMPROMISE', risk: 'Treasury key compromise can divert fees already received; future fees remain sent to the same immutable address.' },
  { id: 'ISSUER_RESTRICTION_UNKNOWN', risk: 'USDT issuer blocklist or transfer restrictions are not disproven by empty address code and may prevent fee payment.' },
  { id: 'NO_ROTATION_WITHOUT_REDEPLOYMENT', risk: 'Neither immutable Guardian nor immutable feeRecipient can be rotated without deploying and separately reviewing a new contract.' },
] as const;
export type DirectEoaRiskId = typeof DIRECT_EOA_RISKS[number]['id'];
export type DirectEoaRiskAcknowledgment = {
  status: 'PENDING' | 'ACKNOWLEDGED';
  acceptedRiskIds: readonly DirectEoaRiskId[];
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  ownerChoiceMessageIsAcknowledgment: false;
};
export const DIRECT_EOA_RISK_ACKNOWLEDGMENT: DirectEoaRiskAcknowledgment = {
  status: 'PENDING', acceptedRiskIds: [], acknowledgedBy: null, acknowledgedAt: null,
  ownerChoiceMessageIsAcknowledgment: false,
};

export type DirectEoaObservation = {
  endpointId: string;
  chainId: number | null;
  blockNumber: number | null;
  blockHash: string | null;
  codeHash: string | null;
  codeBytes: number | null;
  rpcError: string | null;
};
export type DirectEoaPairInput = {
  guardianAddress: string;
  treasuryAddress: string;
  guardianObservations: readonly DirectEoaObservation[];
  treasuryObservations: readonly DirectEoaObservation[];
  expectedBlockNumber: number;
  expectedBlockHash: string;
  observedAtUnixSec: number;
  evaluatedAtUnixSec: number;
  evidenceGeneration: 'HISTORICAL_READINESS' | 'FINAL_DEPLOYMENT_PREPARATION';
  finalDeploymentPreparation: boolean;
  treasuryIssuerRestriction: 'UNKNOWN' | 'CLEAR' | 'BLOCKED';
  ownershipControlEvidence: 'UNVERIFIED' | 'SEPARATELY_AUTHORIZED_OFFCHAIN_SIGNATURE_VERIFIED';
  riskAcknowledgment: DirectEoaRiskAcknowledgment;
};

/** Exact-owner-pair exception only. This never configures roles and never means release-ready. */
export function assessDirectEoaPair(i: DirectEoaPairInput, keccakHex: (s: string) => string) {
  const reasons = new Set<string>();
  if (i.guardianAddress !== OWNER_DIRECT_EOA_ADDRESSES.guardian) reasons.add('GUARDIAN_IDENTITY_MISMATCH');
  if (i.treasuryAddress !== OWNER_DIRECT_EOA_ADDRESSES.treasury) reasons.add('TREASURY_IDENTITY_MISMATCH');
  if (i.guardianAddress.toLowerCase() === i.treasuryAddress.toLowerCase()) reasons.add('ROLES_NOT_DISTINCT');
  for (const [role, address] of [['GUARDIAN', i.guardianAddress], ['TREASURY', i.treasuryAddress]] as const) {
    if (!isChecksumAddress(address, keccakHex)) reasons.add(`${role}_BAD_CHECKSUM`);
    if (isZero(address)) reasons.add(`${role}_ZERO_ADDRESS`);
    if (isTarget(address)) reasons.add(`${role}_PROTOCOL_TARGET`);
  }
  if (!Number.isSafeInteger(i.expectedBlockNumber) || i.expectedBlockNumber <= 0 || !/^0x[0-9a-fA-F]{64}$/.test(i.expectedBlockHash)) reasons.add('INVALID_PINNED_BLOCK');
  const expectedEndpoints = ['BNB_CHAIN_OFFICIAL', 'PUBLICNODE'];
  for (const [role, observations] of [['GUARDIAN', i.guardianObservations], ['TREASURY', i.treasuryObservations]] as const) {
    if (observations.length !== 2 || new Set(observations.map((o) => o.endpointId)).size !== 2
      || observations.some((o) => !expectedEndpoints.includes(o.endpointId))) reasons.add(`${role}_INSUFFICIENT_INDEPENDENT_OBSERVATIONS`);
    for (const o of observations) {
      if (o.rpcError || o.chainId === null || o.blockNumber === null || !o.blockHash || o.codeBytes === null || !o.codeHash) reasons.add(`${role}_RPC_OBSERVATION_UNAVAILABLE`);
      if (o.chainId !== 56) reasons.add(`${role}_WRONG_CHAIN`);
      if (o.blockNumber !== i.expectedBlockNumber || o.blockHash?.toLowerCase() !== i.expectedBlockHash.toLowerCase()) reasons.add(`${role}_PINNED_BLOCK_MISMATCH`);
      if (o.codeBytes !== 0) reasons.add(`${role}_CONTRACT_CODE_PRESENT`);
      if (o.codeHash?.toLowerCase() !== EMPTY_CODE_KECCAK) reasons.add(`${role}_EMPTY_CODE_HASH_MISMATCH`);
    }
    const [a, b] = observations;
    if (a && b) {
      if (a.blockNumber !== b.blockNumber || a.blockHash?.toLowerCase() !== b.blockHash?.toLowerCase()) reasons.add(`${role}_BLOCK_CONSENSUS_MISMATCH`);
      if (a.codeBytes !== b.codeBytes || a.codeHash?.toLowerCase() !== b.codeHash?.toLowerCase()) reasons.add(`${role}_CODE_CONSENSUS_MISMATCH`);
    }
  }
  if (i.finalDeploymentPreparation) {
    if (i.evidenceGeneration !== 'FINAL_DEPLOYMENT_PREPARATION') reasons.add('STALE_HISTORICAL_OBSERVATION');
    if (!Number.isSafeInteger(i.observedAtUnixSec) || !Number.isSafeInteger(i.evaluatedAtUnixSec)
      || i.observedAtUnixSec > i.evaluatedAtUnixSec || i.evaluatedAtUnixSec - i.observedAtUnixSec > 300) reasons.add('STALE_OBSERVATION');
  }
  if (i.treasuryIssuerRestriction === 'UNKNOWN') reasons.add('TREASURY_ISSUER_RESTRICTION_UNKNOWN');
  if (i.treasuryIssuerRestriction === 'BLOCKED') reasons.add('TREASURY_ISSUER_BLOCKED');
  if (i.ownershipControlEvidence !== 'SEPARATELY_AUTHORIZED_OFFCHAIN_SIGNATURE_VERIFIED') reasons.add('WALLET_CONTROL_UNVERIFIED');
  const acknowledgment = i.riskAcknowledgment;
  if (acknowledgment.status !== 'ACKNOWLEDGED') reasons.add('DIRECT_EOA_RISK_ACKNOWLEDGMENT_PENDING');
  else {
    const accepted = new Set(acknowledgment.acceptedRiskIds);
    if (accepted.size !== DIRECT_EOA_RISKS.length || !DIRECT_EOA_RISKS.every((risk) => accepted.has(risk.id))
      || !acknowledgment.acknowledgedBy || !acknowledgment.acknowledgedAt) reasons.add('DIRECT_EOA_RISK_ACKNOWLEDGMENT_INCOMPLETE');
  }
  return {
    ownerChoice: OWNER_INPUT_STATUS,
    exception: OWNER_EOA_EXCEPTION_STATUS,
    preferredStandard: PREFERRED_GOVERNANCE_STANDARD,
    safeVerified: false,
    issuerRestriction: i.treasuryIssuerRestriction,
    eligibleForFutureDeploymentReview: reasons.size === 0,
    reasons: [...reasons],
    refreshRequiredAtFinalPreparation: true,
    feeBpsSelected: null,
    releaseReady: false,
    canConfigureRoles: false,
  } as const;
}

/** Illustration only — no fee is chosen. Output-side fee on gross output, floor rounding as in V1.13. */
export const CANDIDATE_FEE_BPS = [0, 5, 10] as const;
export function illustrateFees(grossOut: bigint) {
  return CANDIDATE_FEE_BPS.map((bps) => {
    const fee = (grossOut * BigInt(bps)) / 10_000n;
    return { bps, fee, userNet: grossOut - fee, chosen: false as const };
  });
}

export type DecisionId = 'D-01' | 'D-02' | 'D-03' | 'D-04' | 'D-05';
export type DecisionStatus = 'OWNER_DECISION_PENDING' | 'OWNER_PREFERENCE_SELECTED_RISK_ACKNOWLEDGMENT_PENDING' | 'RECIPIENT_SELECTED_FEE_RATE_PENDING' | 'RESOLVED';
export type Decision = { id: DecisionId; question: string; options: string[]; recommendation: string; status: DecisionStatus; selectedOption: string | null; decidedBy: 'OWNER' | null; decidedAt: string | null };
export const DECISIONS: readonly Decision[] = [
  { id: 'D-01', question: 'Signed quote vs user-approved net floor', options: ['User-approved minNetOut only (no server signing)', 'Authenticated signed quote (new trust root)'], recommendation: 'User-approved minNetOut; quote snapshot is caller-provided, not an oracle; sandwich within slippage remains possible', status: 'OWNER_DECISION_PENDING', selectedOption: null, decidedBy: null, decidedAt: null },
  { id: 'D-02', question: 'Guardian roles and recovery', options: ['Immutable Safe multisig guardian (preferred)', 'Direct regular-wallet EOA (owner preference)', 'No guardian'], recommendation: 'Prefer a distinct BNB56 Safe, ideally 2-of-3; direct EOA is a proposed exception pending explicit risk acknowledgment', status: 'OWNER_PREFERENCE_SELECTED_RISK_ACKNOWLEDGMENT_PENDING', selectedOption: `Direct EOA Guardian ${OWNER_DIRECT_EOA_ADDRESSES.guardian}`, decidedBy: 'OWNER', decidedAt: '2026-11-26' },
  { id: 'D-03', question: 'Fee recipient and rate', options: ['0 bps', '5 bps', '10 bps'], recommendation: 'Direct EOA recipient preference recorded; fee rate, issuer-clear status and actual payable configuration remain unapproved', status: 'RECIPIENT_SELECTED_FEE_RATE_PENDING', selectedOption: `Direct EOA Treasury ${OWNER_DIRECT_EOA_ADDRESSES.treasury}; fee bps UNSELECTED`, decidedBy: 'OWNER', decidedAt: '2026-11-26' },
  { id: 'D-04', question: 'Quote block-age ceiling and size/slippage policy', options: ['Keep 100 blocks / 30 s review and current caps', 'Tighten'], recommendation: 'Keep current review limits pending device testing; no signed oracle is configured', status: 'OWNER_DECISION_PENDING', selectedOption: null, decidedBy: null, decidedAt: null },
  { id: 'D-05', question: 'WalletConnect dependency removal', options: ['Keep installed, disabled everywhere (current)', 'Remove dependency', 'Wait for upstream zod fix'], recommendation: 'Keep disabled; advisory stays OPEN while installed', status: 'OWNER_DECISION_PENDING', selectedOption: null, decidedBy: null, decidedAt: null },
];
export const openDecisionCount = () => DECISIONS.filter((decision) => decision.status !== 'RESOLVED').length;

export function launchGate(i: {
  governance: GovernanceStatus;
  humanReviewSignoffs: number;
  decisionsOpen: number;
  deviceTestsPassed: boolean;
  dependencyHighOpen: boolean;
  slitherHighOpen: number;
  directEoaRiskAcknowledged?: boolean;
  treasuryIssuerRestrictionClear?: boolean;
  finalObservationRefreshed?: boolean;
  walletControlVerified?: boolean;
}) {
  const blockers: string[] = [];
  if (LAUNCH_HOLD) blockers.push('LAUNCH_HOLD');
  if (!BNB_EXECUTION_ENABLED) blockers.push('EXECUTION_DISABLED');
  if (i.governance !== 'READY_FOR_HUMAN_REVIEW') blockers.push('GOVERNANCE_' + i.governance);
  if (i.humanReviewSignoffs < 1) blockers.push('HUMAN_REVIEW_PENDING');
  if (i.decisionsOpen > 0) blockers.push('OWNER_DECISIONS_PENDING');
  if (!i.deviceTestsPassed) blockers.push('DEVICE_TESTS_UNVERIFIED');
  if (i.dependencyHighOpen) blockers.push('DEPENDENCY_HIGH_OPEN');
  if (i.slitherHighOpen > 0) blockers.push('SLITHER_HIGH_OPEN');
  if (i.directEoaRiskAcknowledged !== true) blockers.push('DIRECT_EOA_RISK_ACKNOWLEDGMENT_PENDING');
  if (i.treasuryIssuerRestrictionClear !== true) blockers.push('TREASURY_ISSUER_RESTRICTION_UNKNOWN');
  if (i.finalObservationRefreshed !== true) blockers.push('FINAL_OBSERVATION_REFRESH_REQUIRED');
  if (i.walletControlVerified !== true) blockers.push('WALLET_CONTROL_UNVERIFIED');
  return { go: false as const, blockers };
}
