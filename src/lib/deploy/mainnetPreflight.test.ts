import { describe, expect, it } from 'vitest';
import { evaluateMainnetPreflight, mainnetReadinessMatrix, type PreflightInput } from './mainnetPreflight';
import {
  CONTRACT_INVENTORY,
  ROUTER_V4_BUILD_LINE,
  contractRegistry,
  inventoryEntry,
  registryRecord,
  testnetAddressSet,
} from './contractInventory';

const APPROVED = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';

function baseInput(over: Partial<PreflightInput> = {}): PreflightInput {
  const entry = inventoryEntry('FlowToken')!;
  return {
    contractId: 'FlowToken',
    expectedChainId: 677,
    rpcChainId: 677,
    deployerAddress: APPROVED,
    approvedDeployers: [APPROVED],
    deployerBalanceWei: 10n ** 18n,
    requiredGasWei: 10n ** 17n,
    sourceHash: 'src-hash',
    expectedSourceHash: 'src-hash',
    artifactHash: 'art-hash',
    expectedArtifactHash: 'art-hash',
    compiler: entry.compiler,
    constructorArgs: { name: 'Flow', symbol: 'FLOW', totalSupply: '1', treasury: OWNER },
    productionOwner: OWNER,
    deploymentSecretPresent: true,
    ...over,
  };
}

const check = (input: PreflightInput, id: string) =>
  evaluateMainnetPreflight(input).checks.find((c) => c.id === id)!;

describe('V30.1A mainnet preflight — fail closed', () => {
  it('blocks a wrong-network deployment', () => {
    expect(check(baseInput({ expectedChainId: 968 }), 'EXPECTED_NETWORK_677').ok).toBe(false);
    expect(check(baseInput({ rpcChainId: 56 }), 'RPC_CHAIN_MATCHES').ok).toBe(false);
  });

  it('blocks unresolved 1024 network assumptions', () => {
    const r = check(baseInput({ expectedChainId: 1024, rpcChainId: 1024 }), 'NO_UNRESOLVED_1024');
    expect(r.ok).toBe(false);
  });

  it('blocks unauthorized deployers and insufficient gas', () => {
    expect(check(baseInput({ deployerAddress: OWNER }), 'DEPLOYER_APPROVED').ok).toBe(false);
    expect(check(baseInput({ deployerBalanceWei: 0n }), 'GAS_SUFFICIENT').ok).toBe(false);
  });

  it('blocks source and artifact mismatch', () => {
    expect(check(baseInput({ sourceHash: 'other' }), 'SOURCE_HASH_MATCH').ok).toBe(false);
    expect(check(baseInput({ artifactHash: 'other' }), 'ARTIFACT_HASH_MATCH').ok).toBe(false);
  });

  it('blocks a compiler/EVM-target change away from the reviewed build line', () => {
    const r = check(baseInput({ compiler: ROUTER_V4_BUILD_LINE }), 'COMPILER_MATCHES_BUILD_LINE');
    expect(r.ok).toBe(false);
  });

  it('blocks testnet-address contamination', () => {
    const testnetAddress = [...testnetAddressSet()][0]!;
    const r = check(
      baseInput({ constructorArgs: { treasury: testnetAddress } }),
      'NO_TESTNET_CONTAMINATION',
    );
    expect(r.ok).toBe(false);
  });

  it('blocks unfrozen constructor values and missing production owner', () => {
    expect(
      check(baseInput({ constructorArgs: { totalSupply: null } }), 'CONSTRUCTOR_ARGS_COMPLETE').ok,
    ).toBe(false);
    expect(check(baseInput({ productionOwner: null }), 'PROduction_OWNER_SET'.toUpperCase() as string).ok).toBe(
      false,
    );
  });

  it('never produces a plan while any inventory blocker stands', () => {
    const result = evaluateMainnetPreflight(baseInput());
    expect(result.ok).toBe(false);
    expect(result.plan).toBeNull();
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it('blocks bridge proxy and adapter mainnet activation', () => {
    for (const id of ['FlowBridgeRouterV4', 'FlowBridgeBridgeAdapterV1']) {
      const result = evaluateMainnetPreflight(baseInput({ contractId: id }));
      expect(result.ok).toBe(false);
      expect(result.plan).toBeNull();
    }
  });
});

describe('V30.1A contract registry', () => {
  it('keeps every mainnet slot undeployed and promotion-pending', () => {
    for (const record of contractRegistry('mainnet')) {
      expect(record.chainId).toBe(677);
      expect(record.address).toBeNull();
      expect(record.state).toBe('PROMOTION_PENDING');
      expect(record.verified).toBe(false);
    }
  });

  it('never copies a testnet address into a mainnet record', () => {
    const testnet = testnetAddressSet();
    for (const record of contractRegistry('mainnet')) {
      expect(record.address === null || !testnet.has(String(record.address).toLowerCase())).toBe(true);
    }
    expect(registryRecord('testnet', 'FlowToken')?.chainId).toBe(968);
  });

  it('reports a readiness matrix for every inventoried contract', () => {
    const matrix = mainnetReadinessMatrix();
    expect(matrix).toHaveLength(CONTRACT_INVENTORY.length);
    expect(matrix.every((m) => m.readiness !== 'READY_FOR_MAINNET')).toBe(true);
  });
});
