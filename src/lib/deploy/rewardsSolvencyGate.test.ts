import { describe, expect, it } from 'vitest';

import {
  CANONICAL_REWARDS_IDENTITY,
  REWARDS_BUILD_LINE,
  REWARDS_GOVERNANCE_PREPARATION,
  REWARDS_ROLE_MATRIX,
  SLITHER_TRIAGE,
  SOLIDITY_EVIDENCE,
  SOLVENCY_MODEL,
  evaluateRewardsSolvencyGate,
} from './rewardsSolvencyGate';
import { EIP170_LIMIT_BYTES } from './securityGate';
import {
  FLOW_REWARDS_MODELS,
  allowsMerkleProofClaims,
  allowsSignerAuthorizedClaims,
  getFlowRewardsModel,
} from '@/lib/rewards/flowRewardsModel';
import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from '@/lib/rewards/flowRewardsRegistry';

describe('V30.1B.2 canonical rewards model', () => {
  it('has exactly one canonical mainnet reward authority', () => {
    const canonical = FLOW_REWARDS_MODELS.filter((m) => m.canonical);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]!.chainId).toBe(BOT_MAINNET_CHAIN_ID);
    expect(canonical[0]!.model).toBe('BUDGETED_MERKLE_EPOCH');
  });

  it('keeps the EIP-712 distributor testnet-only and historical', () => {
    const testnet = getFlowRewardsModel(BOT_TESTNET_CHAIN_ID)!;
    expect(testnet.model).toBe('CUMULATIVE_EIP712');
    expect(testnet.historical).toBe(true);
    expect(testnet.canonical).toBe(false);
  });

  it('never lets mainnet use signer claims, nor testnet use proof claims', () => {
    expect(allowsSignerAuthorizedClaims(BOT_MAINNET_CHAIN_ID)).toBe(false);
    expect(allowsMerkleProofClaims(BOT_MAINNET_CHAIN_ID)).toBe(true);
    expect(allowsSignerAuthorizedClaims(BOT_TESTNET_CHAIN_ID)).toBe(true);
    expect(allowsMerkleProofClaims(BOT_TESTNET_CHAIN_ID)).toBe(false);
  });

  it('fails closed on unknown chains', () => {
    expect(getFlowRewardsModel(1)).toBeNull();
    expect(allowsMerkleProofClaims(1)).toBe(false);
    expect(allowsSignerAuthorizedClaims(null)).toBe(false);
  });
});

describe('V30.1B.2 solvency gate evidence', () => {
  it('records a reproducible frozen build line and identity', () => {
    expect(REWARDS_BUILD_LINE).toMatchObject({ version: '0.8.24', viaIR: true, evmVersion: 'cancun' });
    expect(CANONICAL_REWARDS_IDENTITY.sourceSha256).toHaveLength(64);
    expect(CANONICAL_REWARDS_IDENTITY.creationSha256).toHaveLength(64);
    expect(CANONICAL_REWARDS_IDENTITY.runtimeSha256).toHaveLength(64);
    expect(CANONICAL_REWARDS_IDENTITY.normalizedAbiSha256).toHaveLength(64);
  });

  it('is comfortably inside EIP-170', () => {
    expect(CANONICAL_REWARDS_IDENTITY.runtimeBytes).toBeLessThan(EIP170_LIMIT_BYTES);
    expect(CANONICAL_REWARDS_IDENTITY.runtimeBytes).toBe(5_861);
  });

  it('states a solvency formula with no mint path', () => {
    expect(SOLVENCY_MODEL.mintPaths).toBe(0);
    expect(SOLVENCY_MODEL.freeFormula).toContain('totalReserved');
    expect(SOLVENCY_MODEL.releaseRules).toHaveLength(2);
  });

  it('separates budget authority from publication authority', () => {
    const publisher = REWARDS_ROLE_MATRIX.find((r) => r.role === 'PUBLISHER_ROLE')!;
    const manager = REWARDS_ROLE_MATRIX.find((r) => r.role === 'BUDGET_MANAGER_ROLE')!;
    expect(publisher.cannot.join(' ')).toContain('campaignBudget');
    expect(manager.cannot.join(' ')).toContain('publish');
    const admin = REWARDS_ROLE_MATRIX.find((r) => r.role === 'DEFAULT_ADMIN_ROLE')!;
    expect(admin.holder).toBe('APPROVED_MULTISIG_REQUIRED');
    expect(admin.cannot.join(' ')).toContain('reserved');
  });

  it('carries Solidity and static-analysis evidence', () => {
    expect(SOLIDITY_EVIDENCE.passing).toBeGreaterThanOrEqual(24);
    expect(SOLIDITY_EVIDENCE.fuzzProperties * SOLIDITY_EVIDENCE.fuzzRunsPerProperty).toBe(512);
    expect(SLITHER_TRIAGE.every((f) => f.disposition.length > 20)).toBe(true);
  });

  it('leaves every governance holder unassigned', () => {
    expect(REWARDS_GOVERNANCE_PREPARATION.admin).toBeNull();
    expect(REWARDS_GOVERNANCE_PREPARATION.budgetManager).toBeNull();
    expect(REWARDS_GOVERNANCE_PREPARATION.publisher).toBeNull();
    expect(REWARDS_GOVERNANCE_PREPARATION.pauser).toBeNull();
    expect(REWARDS_GOVERNANCE_PREPARATION.recoveryRecipient).toBeNull();
  });

  it('passes the solvency gate while still blocking deployment', () => {
    const verdict = evaluateRewardsSolvencyGate();
    expect(verdict.pass).toBe(true);
    expect(verdict.solvencyEnforced).toBe(true);
    expect(verdict.reasons).toHaveLength(0);
    expect(verdict.deploymentBlockers.length).toBeGreaterThanOrEqual(4);
    expect(verdict.deploymentBlockers.join(' ')).toContain('V30.1B-G1');
  });
});
