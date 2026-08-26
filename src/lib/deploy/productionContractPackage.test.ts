import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_CONTRACT_PACKAGE,
  V30_1A2_MISSING_CONTRACT_IDS,
  evaluateConsolidation,
  evaluateMissingSourceParity,
  isSourceParityConfirmed,
  productionCandidate,
  productionCandidateIds,
} from './productionContractPackage';
import { inventoryEntry, mainnetReadyContractIds, registryRecord } from './contractInventory';

describe('V30.1A.1 production contract package', () => {
  it('marks exactly one PRODUCTION_CANDIDATE per contract id', () => {
    const ids = productionCandidateIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('FlowBridgeRouterV4');
  });

  it('confirms Router V4 source parity against the reviewed candidate hash', () => {
    const entry = productionCandidate('FlowBridgeRouterV4');
    expect(entry).not.toBeNull();
    expect(isSourceParityConfirmed(entry!)).toBe(true);
    expect(entry!.compiler).toEqual({
      version: '0.8.20',
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: 'shanghai',
    });
  });

  it('never selects an archived copy as a production candidate', () => {
    expect(productionCandidate('FlowBridgeRouterV4@original')).toBeNull();
    for (const entry of PRODUCTION_CONTRACT_PACKAGE) {
      if (entry.identity.path?.startsWith('contracts/archive/')) {
        expect(entry.selection).toBe('ARCHIVED_REFERENCE');
      }
    }
  });

  it('still fails the full consolidation gate on Router V4 build identity', () => {
    const verdict = evaluateConsolidation();
    expect(verdict.pass).toBe(false);
    expect(verdict.missingContractIds).toEqual([]);
    expect(verdict.unprovenBuildIdentityIds).toEqual(['FlowBridgeRouterV4']);
  });

  it('reflects Router V4 consolidation in the inventory without promoting mainnet', () => {
    const router = inventoryEntry('FlowBridgeRouterV4');
    expect(router?.readiness).toBe('HARDENING_REQUIRED');
    expect(router?.sourcePath).toBe('contracts/production/router-v4/FlowBridgeRouterV4.sol');
    expect(mainnetReadyContractIds()).toEqual([]);
    const record = registryRecord('mainnet', 'FlowBridgeRouterV4');
    expect(record?.address).toBeNull();
    expect(record?.state).toBe('PROMOTION_PENDING');
  });
});

describe('V30.1A.2 missing contract source + toolchain parity', () => {
  it('passes the missing-source parity gate for all three contracts', () => {
    const verdict = evaluateMissingSourceParity();
    expect(verdict.missingContractIds).toEqual([]);
    expect(verdict.unprovenBuildIdentityIds).toEqual([]);
    expect(verdict.pass).toBe(true);
  });

  it('records reproduced creation/runtime/ABI identity for each imported contract', () => {
    for (const id of V30_1A2_MISSING_CONTRACT_IDS) {
      const entry = productionCandidate(id);
      expect(entry, id).not.toBeNull();
      expect(entry!.parity).toBe('PARITY_CONFIRMED');
      expect(isSourceParityConfirmed(entry!)).toBe(true);
      expect(entry!.identity.path).toMatch(/^contracts\/production\//);
      expect(entry!.identity.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry!.identity.runtimeSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry!.identity.abiSourceSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('preserves the archived optimizer runs of 1 and never adopts the Router line', () => {
    for (const id of V30_1A2_MISSING_CONTRACT_IDS) {
      expect(productionCandidate(id)!.compiler).toEqual({
        version: '0.8.20',
        optimizer: { enabled: true, runs: 1 },
        viaIR: true,
        evmVersion: 'shanghai',
      });
    }
    expect(productionCandidate('FlowBridgeRouterV4')!.compiler?.optimizer.runs).toBe(200);
  });

  it('keeps every mainnet registry slot empty and unpromoted after import', () => {
    expect(mainnetReadyContractIds()).toEqual([]);
    for (const id of V30_1A2_MISSING_CONTRACT_IDS) {
      const record = registryRecord('mainnet', id);
      expect(record?.address).toBeNull();
      expect(record?.state).toBe('PROMOTION_PENDING');
      expect(record?.verified).toBe(false);
    }
    expect(inventoryEntry('FlowBridgeBridgeAdapterV1')?.readiness).toBe('BLOCKED');
  });
});
