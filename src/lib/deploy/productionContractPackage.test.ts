import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_CONTRACT_PACKAGE,
  evaluateConsolidation,
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

  it('keeps absent contracts blocked and fails the consolidation gate closed', () => {
    const verdict = evaluateConsolidation();
    expect(verdict.pass).toBe(false);
    expect(verdict.missingContractIds).toEqual([
      'FlowBridgeRouterLens',
      'FlowBridgeActivityRegistry',
      'FlowBridgeBridgeAdapterV1',
    ]);
    expect(verdict.unprovenBuildIdentityIds).toContain('FlowBridgeRouterV4');
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
