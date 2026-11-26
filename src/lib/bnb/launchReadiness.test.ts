import { describe, expect, it } from 'vitest';
import { keccak256, toBytes, getAddress } from 'viem';
import {
  assessDirectEoaPair, assessGovernance, DECISIONS, developmentReadiness, DIRECT_EOA_RISKS,
  DIRECT_EOA_RISK_ACKNOWLEDGMENT, EMPTY_CODE_KECCAK, FIXED_PROTOCOL_TARGETS, HISTORIC_OWNER_EOA_EVIDENCE,
  illustrateFees, isChecksumAddress, launchGate, openDecisionCount, OWNER_DIRECT_EOA_ADDRESSES,
  OWNER_EOA_EXCEPTION_STATUS, OWNER_INPUT_CHECKLIST, OWNER_INPUT_STATUS,
  type DirectEoaObservation, type DirectEoaPairInput, type SafeFacts,
} from './launchReadiness';
import { reviewBnbSwap } from './executionReviewPolicy';

const k = (s: string) => keccak256(toBytes(s)).slice(2);
const A = getAddress('0x' + '11'.repeat(20)), B = getAddress('0x' + '22'.repeat(20));
const o = [getAddress('0x' + 'a1'.repeat(20)), getAddress('0x' + 'b2'.repeat(20)), getAddress('0x' + 'c3'.repeat(20))];
const safe = (address: string, p: Partial<SafeFacts> = {}): SafeFacts => ({ address, chainId: 56, hasCode: true, owners: o, threshold: 2, observedAtBlock: 135_800_000, evidence: 'READ_ONLY_CHAIN56_RPC', ...p });
const observation = (endpointId: string, patch: Partial<DirectEoaObservation> = {}): DirectEoaObservation => ({
  endpointId, chainId: 56, blockNumber: HISTORIC_OWNER_EOA_EVIDENCE.blockNumber,
  blockHash: HISTORIC_OWNER_EOA_EVIDENCE.blockHash, codeHash: EMPTY_CODE_KECCAK, codeBytes: 0, rpcError: null, ...patch,
});
const validAcknowledgment = {
  status: 'ACKNOWLEDGED', acceptedRiskIds: DIRECT_EOA_RISKS.map((risk) => risk.id),
  acknowledgedBy: 'SYNTHETIC_TEST_OWNER', acknowledgedAt: '2026-11-26T05:00:00Z', ownerChoiceMessageIsAcknowledgment: false,
} as const;
const pair = (patch: Partial<DirectEoaPairInput> = {}): DirectEoaPairInput => ({
  guardianAddress: OWNER_DIRECT_EOA_ADDRESSES.guardian,
  treasuryAddress: OWNER_DIRECT_EOA_ADDRESSES.treasury,
  guardianObservations: [observation('BNB_CHAIN_OFFICIAL'), observation('PUBLICNODE')],
  treasuryObservations: [observation('BNB_CHAIN_OFFICIAL'), observation('PUBLICNODE')],
  expectedBlockNumber: HISTORIC_OWNER_EOA_EVIDENCE.blockNumber,
  expectedBlockHash: HISTORIC_OWNER_EOA_EVIDENCE.blockHash,
  observedAtUnixSec: HISTORIC_OWNER_EOA_EVIDENCE.observedAtUnixSec,
  evaluatedAtUnixSec: HISTORIC_OWNER_EOA_EVIDENCE.observedAtUnixSec + 60,
  evidenceGeneration: 'FINAL_DEPLOYMENT_PREPARATION', finalDeploymentPreparation: true,
  treasuryIssuerRestriction: 'CLEAR', ownershipControlEvidence: 'SEPARATELY_AUTHORIZED_OFFCHAIN_SIGNATURE_VERIFIED',
  riskAcknowledgment: validAcknowledgment, ...patch,
});

describe('owner direct-EOA choice and development readiness', () => {
  it('records the choice without selecting a fee or authorizing financial actions', () => {
    expect(developmentReadiness()).toEqual({
      status: 'PASS_FOR_NON_EXECUTABLE_DEVELOPMENT', ownerInput: 'OWNER_DIRECT_EOA_CHOICE_RECORDED',
      governanceException: 'OWNER_EOA_EXCEPTION_PROPOSED', riskAcknowledgment: 'PENDING', feeBpsSelected: 5, payableConfigurationAuthorized: false,
      launch: 'HOLD', executionEnabled: false, financialActionsAuthorized: false,
    });
  });
  it('retains the 2-of-3 Safe recommendation as a separate preferred standard', () => {
    expect(OWNER_INPUT_CHECKLIST.map((item) => item.id)).toEqual(['OI-01', 'OI-02', 'OI-03', 'OI-04', 'OI-05']);
    expect(OWNER_INPUT_CHECKLIST[0]!.status).toBe(OWNER_INPUT_STATUS);
    expect(OWNER_INPUT_CHECKLIST[0]!.proposal).toContain('Prefer separate 2-of-3');
    expect(OWNER_INPUT_CHECKLIST[0]!.proposal).toContain(OWNER_EOA_EXCEPTION_STATUS);
    expect(JSON.stringify(OWNER_INPUT_CHECKLIST)).not.toMatch(/private key|recovery phrase collection\./i);
  });
  it('requires a separate owner-readable risk record; this owner choice is not acknowledgment', () => {
    expect(DIRECT_EOA_RISK_ACKNOWLEDGMENT).toEqual({ status: 'PENDING', acceptedRiskIds: [], acknowledgedBy: null, acknowledgedAt: null, ownerChoiceMessageIsAcknowledgment: false });
    expect(DIRECT_EOA_RISKS.map((risk) => risk.id)).toEqual(['SINGLE_KEY_PAUSE_CONTROL', 'GUARDIAN_COMPROMISE', 'IMMUTABLE_GUARDIAN_LOSS', 'IMMUTABLE_TREASURY_COMPROMISE', 'ISSUER_RESTRICTION_UNKNOWN', 'NO_ROTATION_WITHOUT_REDEPLOYMENT']);
    expect(DIRECT_EOA_RISKS[2]!.risk).toContain('blocked indefinitely');
    expect(DIRECT_EOA_RISKS[5]!.risk).toContain('without deploying');
  });
});

describe('preferred Safe governance remains unchanged', () => {
  it('does not silently turn missing Safes into a configured EOA deployment', () => {
    expect(assessGovernance(null, null, k)).toEqual({ status: 'NOT_CONFIGURED', reasons: ['OWNER_EOA_EXCEPTION_PROPOSED'], canConfigureRoles: false });
    expect(assessGovernance(safe('0x' + '00'.repeat(20)), safe(B), k).status).toBe('INVALID');
  });
  it('checksum validation', () => {
    expect(isChecksumAddress(A, k)).toBe(true);
    expect(isChecksumAddress(FIXED_PROTOCOL_TARGETS.USDT, k)).toBe(true);
    expect(isChecksumAddress('0x55D398326f99059fF775485246999027B3197955', k)).toBe(false);
  });
  it('rejects protocol targets, same address, no code, wrong chain, 1-of-n', () => {
    const r = assessGovernance(safe(FIXED_PROTOCOL_TARGETS.WBNB, { threshold: 1, hasCode: false, chainId: 1 }), safe(FIXED_PROTOCOL_TARGETS.WBNB), k);
    expect(r.status).toBe('INVALID');
    for (const x of ['PROTOCOL_TARGET', 'THRESHOLD_TOO_LOW', 'NO_CODE', 'WRONG_CHAIN', 'GUARDIAN_EQUALS_TREASURY']) expect(r.reasons).toContain(x);
  });
  it('requires read-only observation provenance, valid unique owners and a valid block', () => {
    expect(assessGovernance(safe(A, { owners: [o[0]!, o[0]!], threshold: 2 }), safe(B), k).reasons).toContain('INVALID_OWNER');
    expect(assessGovernance(safe(A, { observedAtBlock: 0 }), safe(B), k).reasons).toContain('UNVERIFIED_CHAIN_OBSERVATION');
  });
  it('distinct valid 2-of-3 Safe facts are only READY_FOR_HUMAN_REVIEW, never role config', () => {
    expect(assessGovernance(safe(A), safe(B, { owners: [o[0]!, o[1]!] }), k)).toEqual({ status: 'READY_FOR_HUMAN_REVIEW', reasons: [], canConfigureRoles: false });
  });
});

describe('exact direct-EOA pair eligibility (synthetic final-preparation facts only)', () => {
  it('accepts only the exact two checksummed identities with two-RPC consensus and all separate gates', () => {
    const result = assessDirectEoaPair(pair(), k);
    expect(result).toMatchObject({
      ownerChoice: 'OWNER_DIRECT_EOA_CHOICE_RECORDED', exception: 'OWNER_EOA_EXCEPTION_PROPOSED',
      safeVerified: false, eligibleForFutureDeploymentReview: true, reasons: [], feeBpsSelected: 5, payableConfigurationAuthorized: false,
      releaseReady: false, canConfigureRoles: false, refreshRequiredAtFinalPreparation: true,
    });
  });
  it('rejects third-party Guardian and Treasury substitution', () => {
    expect(assessDirectEoaPair(pair({ guardianAddress: A }), k).reasons).toContain('GUARDIAN_IDENTITY_MISMATCH');
    expect(assessDirectEoaPair(pair({ treasuryAddress: B }), k).reasons).toContain('TREASURY_IDENTITY_MISMATCH');
  });
  it('rejects invalid checksum, zero and protocol targets even when substituted', () => {
    const invalidChecksum = OWNER_DIRECT_EOA_ADDRESSES.guardian.toLowerCase();
    expect(assessDirectEoaPair(pair({ guardianAddress: invalidChecksum }), k).reasons).toContain('GUARDIAN_BAD_CHECKSUM');
    const zero = '0x' + '00'.repeat(20);
    expect(assessDirectEoaPair(pair({ guardianAddress: zero }), k).reasons).toContain('GUARDIAN_ZERO_ADDRESS');
    expect(assessDirectEoaPair(pair({ treasuryAddress: FIXED_PROTOCOL_TARGETS.USDT }), k).reasons).toContain('TREASURY_PROTOCOL_TARGET');
    expect(assessDirectEoaPair(pair({ guardianAddress: FIXED_PROTOCOL_TARGETS.PANCAKE_V3_ROUTER }), k).reasons).toContain('GUARDIAN_PROTOCOL_TARGET');
  });
  it('requires both named independent RPCs and rejects duplicates', () => {
    expect(assessDirectEoaPair(pair({ guardianObservations: [observation('BNB_CHAIN_OFFICIAL')] }), k).reasons).toContain('GUARDIAN_INSUFFICIENT_INDEPENDENT_OBSERVATIONS');
    expect(assessDirectEoaPair(pair({ treasuryObservations: [observation('BNB_CHAIN_OFFICIAL'), observation('BNB_CHAIN_OFFICIAL')] }), k).reasons).toContain('TREASURY_INSUFFICIENT_INDEPENDENT_OBSERVATIONS');
  });
  it('fails closed on wrong chain, RPC failure and changed block hash', () => {
    expect(assessDirectEoaPair(pair({ guardianObservations: [observation('BNB_CHAIN_OFFICIAL', { chainId: 1 }), observation('PUBLICNODE')] }), k).reasons).toContain('GUARDIAN_WRONG_CHAIN');
    expect(assessDirectEoaPair(pair({ treasuryObservations: [observation('BNB_CHAIN_OFFICIAL', { rpcError: 'timeout', codeBytes: null }), observation('PUBLICNODE')] }), k).reasons).toContain('TREASURY_RPC_OBSERVATION_UNAVAILABLE');
    expect(assessDirectEoaPair(pair({ expectedBlockHash: '0x' + 'ff'.repeat(32) }), k).reasons).toContain('GUARDIAN_PINNED_BLOCK_MISMATCH');
  });
  it('rejects contract code, changed code hash and provider disagreement', () => {
    expect(assessDirectEoaPair(pair({ guardianObservations: [observation('BNB_CHAIN_OFFICIAL', { codeBytes: 1, codeHash: '0x' + '12'.repeat(32) }), observation('PUBLICNODE')] }), k).reasons).toEqual(expect.arrayContaining(['GUARDIAN_CONTRACT_CODE_PRESENT', 'GUARDIAN_CODE_CONSENSUS_MISMATCH']));
    expect(assessDirectEoaPair(pair({ treasuryObservations: [observation('BNB_CHAIN_OFFICIAL', { codeHash: '0x' + '12'.repeat(32) }), observation('PUBLICNODE')] }), k).reasons).toEqual(expect.arrayContaining(['TREASURY_EMPTY_CODE_HASH_MISMATCH', 'TREASURY_CODE_CONSENSUS_MISMATCH']));
  });
  it('requires a fresh final-preparation observation, not the historical block', () => {
    expect(assessDirectEoaPair(pair({ evidenceGeneration: 'HISTORICAL_READINESS' }), k).reasons).toContain('STALE_HISTORICAL_OBSERVATION');
    expect(assessDirectEoaPair(pair({ evaluatedAtUnixSec: HISTORIC_OWNER_EOA_EVIDENCE.observedAtUnixSec + 301 }), k).reasons).toContain('STALE_OBSERVATION');
    expect(assessDirectEoaPair(pair({ expectedBlockNumber: 1 }), k).reasons).toContain('GUARDIAN_PINNED_BLOCK_MISMATCH');
  });
  it('marks issuer restriction UNKNOWN or BLOCKED as unsafe, never clear', () => {
    const unknown = assessDirectEoaPair(pair({ treasuryIssuerRestriction: 'UNKNOWN' }), k);
    expect(unknown).toMatchObject({ issuerRestriction: 'UNKNOWN', eligibleForFutureDeploymentReview: false, releaseReady: false });
    expect(unknown.reasons).toContain('TREASURY_ISSUER_RESTRICTION_UNKNOWN');
    expect(assessDirectEoaPair(pair({ treasuryIssuerRestriction: 'BLOCKED' }), k).reasons).toContain('TREASURY_ISSUER_BLOCKED');
  });
  it('requires explicit complete risk acknowledgment and separately authorized control evidence', () => {
    expect(assessDirectEoaPair(pair({ riskAcknowledgment: DIRECT_EOA_RISK_ACKNOWLEDGMENT }), k).reasons).toContain('DIRECT_EOA_RISK_ACKNOWLEDGMENT_PENDING');
    expect(assessDirectEoaPair(pair({ riskAcknowledgment: { ...validAcknowledgment, acceptedRiskIds: [] } }), k).reasons).toContain('DIRECT_EOA_RISK_ACKNOWLEDGMENT_INCOMPLETE');
    expect(assessDirectEoaPair(pair({ ownershipControlEvidence: 'UNVERIFIED' }), k).reasons).toContain('WALLET_CONTROL_UNVERIFIED');
  });
  it('current historical record is choice evidence only, not payable configuration', () => {
    const result = assessDirectEoaPair(pair({
      evidenceGeneration: 'HISTORICAL_READINESS', finalDeploymentPreparation: false,
      treasuryIssuerRestriction: 'UNKNOWN', ownershipControlEvidence: 'UNVERIFIED', riskAcknowledgment: DIRECT_EOA_RISK_ACKNOWLEDGMENT,
    }), k);
    expect(result.ownerChoice).toBe('OWNER_DIRECT_EOA_CHOICE_RECORDED');
    expect(result.eligibleForFutureDeploymentReview).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['TREASURY_ISSUER_RESTRICTION_UNKNOWN', 'WALLET_CONTROL_UNVERIFIED', 'DIRECT_EOA_RISK_ACKNOWLEDGMENT_PENDING']));
  });
});

describe('fee illustration', () => {
  it('0/5/10 bps on 1000 USDT gross, only owner-selected 5 bps marked chosen', () => {
    const g = 1000n * 10n ** 18n;
    const f = illustrateFees(g);
    expect(f.map((x) => x.fee)).toEqual([0n, 5n * 10n ** 17n, 10n ** 18n]);
    expect(f.every((x) => x.chosen === (x.bps === 5) && x.fee + x.userNet === g)).toBe(true);
  });
});

describe('decisions & gate', () => {
  it('D-02 and D-03 record limited preferences; D-01/D-04/D-05 and all final gates remain open', () => {
    expect(DECISIONS.map((d) => d.id)).toEqual(['D-01', 'D-02', 'D-03', 'D-04', 'D-05']);
    expect(DECISIONS[1]).toMatchObject({ status: 'OWNER_PREFERENCE_SELECTED_RISK_ACKNOWLEDGMENT_PENDING', decidedBy: 'OWNER' });
    expect(DECISIONS[2]).toMatchObject({ status: 'FEE_RATE_SELECTED_PAYABLE_CONFIGURATION_NOT_AUTHORIZED', decidedBy: 'OWNER' });
    expect(DECISIONS[2]!.selectedOption).toContain('5 bps (0.05%)'); expect(DECISIONS[2]!.selectedOption).toContain('payable configuration NOT AUTHORIZED');
    for (const id of ['D-01', 'D-04', 'D-05']) expect(DECISIONS.find((d) => d.id === id)).toMatchObject({ status: 'OWNER_DECISION_PENDING', decidedBy: null });
    expect(openDecisionCount()).toBe(5);
  });
  it('gate is never GO even if every input is satisfied', () => {
    const g = launchGate({ governance: 'READY_FOR_HUMAN_REVIEW', humanReviewSignoffs: 2, decisionsOpen: 0, deviceTestsPassed: true, dependencyHighOpen: false, slitherHighOpen: 0, directEoaRiskAcknowledged: true, treasuryIssuerRestrictionClear: true, finalObservationRefreshed: true, walletControlVerified: true });
    expect(g.go).toBe(false);
    expect(g.blockers).toEqual(['LAUNCH_HOLD', 'EXECUTION_DISABLED']);
  });
  it('current state lists every blocker including EOA-specific risks', () => {
    const g = launchGate({ governance: 'NOT_CONFIGURED', humanReviewSignoffs: 0, decisionsOpen: 5, deviceTestsPassed: false, dependencyHighOpen: true, slitherHighOpen: 6 });
    expect(g.go).toBe(false);
    expect(g.blockers).toEqual(['LAUNCH_HOLD', 'EXECUTION_DISABLED', 'GOVERNANCE_NOT_CONFIGURED', 'HUMAN_REVIEW_PENDING', 'OWNER_DECISIONS_PENDING', 'DEVICE_TESTS_UNVERIFIED', 'DEPENDENCY_HIGH_OPEN', 'SLITHER_HIGH_OPEN', 'DIRECT_EOA_RISK_ACKNOWLEDGMENT_PENDING', 'TREASURY_ISSUER_RESTRICTION_UNKNOWN', 'FINAL_OBSERVATION_REFRESH_REQUIRED', 'WALLET_CONTROL_UNVERIFIED']);
  });
});

describe('user-approved min output & stale-context rejection', () => {
  const ctx = { chainId: 56, account: A, tokenIn: 'WBNB' as const, tokenOut: 'USDT' as const, poolFee: 500, amountIn: 10n ** 17n };
  const quote = { ...ctx, source: 'PANCAKE_V3_QUOTER' as const, quotedNetOut: 60n * 10n ** 18n, quotedAtSec: 1000, quoteBlock: 100 };
  const base = { quote, current: ctx, nowSec: 1005, currentBlock: 101, approvedMinNetOut: 59_800_000_000_000_000_000n, slippageBps: 50 };
  it('never signable', () => expect(reviewBnbSwap(base).canSign).toBe(false));
  it('requires user approved min', () => expect(reviewBnbSwap({ ...base, approvedMinNetOut: null }).reasons).toContain('MIN_NET_NOT_APPROVED'));
  for (const [name, cur] of [
    ['network', { ...ctx, chainId: 1 }], ['account', { ...ctx, account: B }], ['tier', { ...ctx, poolFee: 2500 }], ['amount', { ...ctx, amountIn: 2n * 10n ** 17n }],
  ] as const) it(`rejects ${name} change`, () => expect(reviewBnbSwap({ ...base, current: cur }).reasons).toContain('CONTEXT_CHANGED'));
  it('rejects stale quote', () => expect(reviewBnbSwap({ ...base, nowSec: 2000 }).reasons).toContain('QUOTE_STALE_TIME'));
});
