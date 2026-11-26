// V1.15 owner-input-deferred readiness — PURE, NON-EXECUTABLE.
// No network, signer, calldata, Safe deployment or role configuration. Observed facts must come from read-only chain-56 checks.
import { BNB_EXECUTION_ENABLED } from './executionReviewPolicy';

export const LAUNCH_HOLD = true as const;
export const OWNER_INPUT_STATUS = 'GUARDIAN_AND_TREASURY_DEFERRED_BY_OWNER' as const;
export const FIXED_PROTOCOL_TARGETS = {
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  PANCAKE_V3_ROUTER: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
} as const;

/** Request these only after human review, wallet acceptance readiness and separately authorized deployment planning. */
export const OWNER_INPUT_CHECKLIST = [
  { id: 'OI-01', request: 'Two distinct deployed BNB-chain Safe contract addresses; independently read code, owners and threshold for each.', proposal: 'Prefer 2-of-3 for each Safe; this is not configured.', status: OWNER_INPUT_STATUS },
  { id: 'OI-02', request: 'Fee choice of 0, 5 or 10 bps and explicit consent to pay that fee to the Treasury Safe.', proposal: 'No fee or payout recipient is selected.', status: OWNER_INPUT_STATUS },
  { id: 'OI-03', request: 'Pause and recovery policy for the immutable pause-only guardian.', proposal: 'No sweep, upgrade, key or recovery-phrase collection.', status: OWNER_INPUT_STATUS },
  { id: 'OI-04', request: 'Slippage, maximum swap size and user-approved minNetOut versus signed-quote policy.', proposal: 'Current review ceiling is 1 BNB / 1,000 USDT, 1% slippage and no server quote signing.', status: OWNER_INPUT_STATUS },
  { id: 'OI-05', request: 'UTC date on which the owner accepts the final reviewed source hash.', proposal: 'Any later source change requires a new candidate and resets reviewed status.', status: OWNER_INPUT_STATUS },
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
  | typeof OWNER_INPUT_STATUS | 'BAD_CHECKSUM' | 'WRONG_CHAIN' | 'NO_CODE' | 'PROTOCOL_TARGET'
  | 'THRESHOLD_TOO_LOW' | 'GUARDIAN_EQUALS_TREASURY' | 'OWNERS_OVERLAP_FULLY'
  | 'INVALID_OWNER' | 'UNVERIFIED_CHAIN_OBSERVATION';

/** Development may proceed with mocks and read-only evidence while financial launch remains held. */
export function developmentReadiness() {
  return {
    status: 'PASS_FOR_NON_EXECUTABLE_DEVELOPMENT',
    ownerInput: OWNER_INPUT_STATUS,
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

export function assessGovernance(
  guardian: SafeFacts | null, treasury: SafeFacts | null, keccakHex: (s: string) => string,
): { status: GovernanceStatus; reasons: GovernanceReason[]; canConfigureRoles: false } {
  if (!guardian || !treasury) return { status: 'NOT_CONFIGURED', reasons: [OWNER_INPUT_STATUS], canConfigureRoles: false };
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

/** Illustration only — no fee is chosen. Output-side fee on gross output, floor rounding as in V1.13. */
export const CANDIDATE_FEE_BPS = [0, 5, 10] as const;
export function illustrateFees(grossOut: bigint) {
  return CANDIDATE_FEE_BPS.map((bps) => {
    const fee = (grossOut * BigInt(bps)) / 10_000n;
    return { bps, fee, userNet: grossOut - fee, chosen: false as const };
  });
}

export type DecisionId = 'D-01' | 'D-02' | 'D-03' | 'D-04' | 'D-05';
export type Decision = { id: DecisionId; question: string; options: string[]; recommendation: string; status: 'OWNER_DECISION_PENDING'; decidedBy: null; decidedAt: null };
export const DECISIONS: readonly Decision[] = [
  { id: 'D-01', question: 'Signed quote vs user-approved net floor', options: ['User-approved minNetOut only (no server signing)', 'Authenticated signed quote (new trust root)'], recommendation: 'User-approved minNetOut; quote snapshot is caller-provided, not an oracle; sandwich within slippage remains possible', status: 'OWNER_DECISION_PENDING', decidedBy: null, decidedAt: null },
  { id: 'D-02', question: 'Guardian roles and recovery', options: ['Immutable Safe multisig guardian (pause-only)', 'No guardian'], recommendation: 'Distinct BNB56 Safe, preferably 2-of-3, pause-only, no sweep/upgrade; addresses deferred by owner', status: 'OWNER_DECISION_PENDING', decidedBy: null, decidedAt: null },
  { id: 'D-03', question: 'Fee recipient and rate', options: ['0 bps', '5 bps', '10 bps'], recommendation: 'None chosen; recipient must be a distinct treasury Safe, never a protocol target; payout consent required', status: 'OWNER_DECISION_PENDING', decidedBy: null, decidedAt: null },
  { id: 'D-04', question: 'Quote block-age ceiling and size/slippage policy', options: ['Keep 100 blocks / 30 s review and current caps', 'Tighten'], recommendation: 'Keep current review limits pending device testing; no signed oracle is configured', status: 'OWNER_DECISION_PENDING', decidedBy: null, decidedAt: null },
  { id: 'D-05', question: 'WalletConnect dependency removal', options: ['Keep installed, disabled everywhere (current)', 'Remove dependency', 'Wait for upstream zod fix'], recommendation: 'Keep disabled; advisory stays OPEN while installed', status: 'OWNER_DECISION_PENDING', decidedBy: null, decidedAt: null },
];

export function launchGate(i: { governance: GovernanceStatus; humanReviewSignoffs: number; decisionsOpen: number; deviceTestsPassed: boolean; dependencyHighOpen: boolean; slitherHighOpen: number }) {
  const blockers: string[] = [];
  if (LAUNCH_HOLD) blockers.push('LAUNCH_HOLD');
  if (!BNB_EXECUTION_ENABLED) blockers.push('EXECUTION_DISABLED');
  if (i.governance !== 'READY_FOR_HUMAN_REVIEW') blockers.push('GOVERNANCE_' + i.governance);
  if (i.humanReviewSignoffs < 1) blockers.push('HUMAN_REVIEW_PENDING');
  if (i.decisionsOpen > 0) blockers.push('OWNER_DECISIONS_PENDING');
  if (!i.deviceTestsPassed) blockers.push('DEVICE_TESTS_UNVERIFIED');
  if (i.dependencyHighOpen) blockers.push('DEPENDENCY_HIGH_OPEN');
  if (i.slitherHighOpen > 0) blockers.push('SLITHER_HIGH_OPEN');
  return { go: false as const, blockers };
}
