import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  STAGE_E_BUILD_MATRIX,
  STAGE_E_CAPS,
  STAGE_E_CONTRACTS,
  STAGE_E_GENESIS_STATE,
  STAGE_E_OBSERVATION,
  STAGE_E_PRODUCT_MATRIX,
  STAGE_E_PROHIBITIONS,
  STAGE_E_VERDICT,
  stageEApprovals,
} from './stageEPreflight';

describe('V30.1E.13 Stage E staking preflight', () => {
  it('uses the stakingV2 build line and never Router/Registry settings', () => {
    expect(STAGE_E_BUILD_MATRIX.solc).toContain('0.8.24');
    expect(STAGE_E_BUILD_MATRIX.optimizer.runs).toBe(200);
    expect(STAGE_E_BUILD_MATRIX.viaIR).toBe(true);
    expect(STAGE_E_BUILD_MATRIX.evmVersion).toBe('cancun');
  });

  it('deploys in dependency order with contiguous nonces from the live nonce', () => {
    expect(STAGE_E_CONTRACTS.map((c) => c.contract)).toEqual([
      'FlowStakingRewardTreasury',
      'FlowStakingController',
      'FlowStakingVaultV2',
    ]);
    expect(STAGE_E_CONTRACTS.map((c) => c.nonce)).toEqual([
      STAGE_E_OBSERVATION.liveNonce,
      STAGE_E_OBSERVATION.liveNonce + 1,
      STAGE_E_OBSERVATION.liveNonce + 2,
    ]);
  });

  it('vault constructor binds the predicted controller and treasury CREATE addresses', () => {
    const [treasury, controller, vault] = STAGE_E_CONTRACTS;
    expect(vault!.constructorArgs.join(' ')).toContain(controller!.expectedAddress);
    expect(vault!.constructorArgs.join(' ')).toContain(treasury!.expectedAddress);
  });

  it('every artifact is reproducible and retains a Standard JSON input that matches on disk', () => {
    for (const c of STAGE_E_CONTRACTS) {
      expect(c.doubleBuildReproducible).toBe(true);
      expect(c.manifestParity).toBe('EXACT_MATCH');
      expect(c.standardJsonReproducesArtifact).toBe(true);
      const sha = createHash('sha256').update(readFileSync(c.standardJsonInputPath)).digest('hex');
      expect(sha, `${c.contract} preserved compiler input must be byte-identical`).toBe(
        c.standardJsonInputSha256,
      );
    }
  });

  it('gas limits carry a 30% buffer and fit the observed balance', () => {
    let total = 0;
    for (const c of STAGE_E_CONTRACTS) {
      expect(c.gasLimitBuffered30).toBe(Math.ceil(c.gasEstimate * 1.3));
      total += c.gasLimitBuffered30 * 20e9;
    }
    expect(total / 1e18).toBeLessThan(Number(STAGE_E_OBSERVATION.balanceBOT));
  });

  it('genesis state is fully fail-closed: no funding, no products, no oracle', () => {
    expect(STAGE_E_GENESIS_STATE.rewardTreasuryFlowBalance).toBe(0);
    expect(STAGE_E_GENESIS_STATE.enabledProducts).toBe(0);
    expect(STAGE_E_GENESIS_STATE.controllerMaxFlowPerEpoch).toBe(0);
    expect(STAGE_E_GENESIS_STATE.dynamicBonusState).toBe('PENDING_POOL_FAIL_CLOSED');
    expect(STAGE_E_GENESIS_STATE.autoStakeOrClaim).toBe(false);
    expect(STAGE_E_CAPS.fundingAuthorizedInStageE).toBe(false);
    expect(STAGE_E_CAPS.mintPath).toBe(false);
  });

  it('mirrors the approved Year-1 ceilings and product matrix', () => {
    expect(STAGE_E_CAPS.genesisYear1CapFlow + STAGE_E_CAPS.standardYear1CapFlow).toBe(
      STAGE_E_CAPS.totalYear1CapFlow,
    );
    expect(STAGE_E_PRODUCT_MATRIX).toHaveLength(5);
    for (const p of STAGE_E_PRODUCT_MATRIX) {
      expect(p.targetBps).toBeLessThanOrEqual(p.hardCapBps);
      expect(p.hardCapBps).toBeLessThanOrEqual(p.genesisAprBps);
      if (p.lockSeconds === 0) expect(p.floorBps).toBe(0);
      else expect(p.floorBps).toBeGreaterThan(0);
    }
  });

  it('emits one scoped approval per transaction and nothing was signed or broadcast', () => {
    const approvals = stageEApprovals();
    expect(approvals).toHaveLength(3);
    for (const a of approvals) {
      expect(a.chainId).toBe(677);
      expect(a.valueBOT).toBe(0);
      expect(a.unsignedDataKeccak).toMatch(/^0x[0-9a-f]{64}$/);
      expect(a.excludes.join(' ')).toContain('funding');
    }
    expect(new Set(approvals.map((a) => a.nonce)).size).toBe(3);
    expect(STAGE_E_PROHIBITIONS).toMatchObject({
      signatures: 0,
      broadcasts: 0,
      flowFunded: 0,
      productsActivated: 0,
      oracleConfigured: false,
      roleGrants: 0,
      safeTransactions: 0,
    });
    expect(STAGE_E_VERDICT).toBe('STAGE_E_PREFLIGHT_PASS_APPROVED_NOT_BROADCAST');
  });
});
