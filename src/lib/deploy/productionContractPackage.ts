/**
 * FlowBridge V30.1A.1 — production contract package resolution.
 *
 * One canonical production contract package lives at `contracts/production/`.
 * Historical copies live at `contracts/archive/` and are NEVER selectable by
 * deployment tooling. This module is pure, descriptive and fail-closed: it does
 * not compile, deploy, sign or broadcast anything, and it never infers an
 * address or artifact from an archived manifest.
 */
import { ROUTER_V4_BUILD_LINE, type CompilerProfile } from './contractInventory';

export type PackageSelection = 'PRODUCTION_CANDIDATE' | 'ARCHIVED_REFERENCE';

export type ParityVerdict = 'PARITY_CONFIRMED' | 'PARITY_UNPROVEN' | 'BLOCKED_SOURCE_ABSENT';

export interface SourceIdentity {
  /** Repository path, or null when the source is not present in this workspace. */
  path: string | null;
  /** SHA-256 of the imported file bytes, or null when absent. */
  sourceSha256: string | null;
  /** Creation (artifact) hash — requires a reproduced compile. */
  artifactSha256: string | null;
  /** Runtime bytecode hash — requires a reproduced compile. */
  runtimeSha256: string | null;
  /** SHA-256 of the reviewed ABI export that shipped with the candidate. */
  abiSourceSha256: string | null;
}

export interface ProductionPackageEntry {
  contractId: string;
  selection: PackageSelection;
  compiler: CompilerProfile | null;
  identity: SourceIdentity;
  /** Reviewed-candidate hash the import is compared against (source parity). */
  reviewedSourceSha256: string | null;
  testPath: string | null;
  parity: ParityVerdict;
  notes: readonly string[];
}

/** Reviewed Router V4 reference pack hashes (candidate evidence, verbatim). */
const REVIEWED_ROUTER_V4_STACKFIX_SHA256 =
  'eb2069e5d5b2eef8c6c34cc8d9826417d767792d3812dbcebbe318397e46cebd';
const REVIEWED_ROUTER_V4_ORIGINAL_SHA256 =
  '8d5ebab2e9e5506074f9dae4a5b922d63f889d55edcac6477dcbbe16f0833d91';
const REVIEWED_ROUTER_V4_TEST_SHA256 =
  '629f5fd75d1074b1de3f985d070054120ee65061b1ad59a79248788b3b457a11';
const REVIEWED_ROUTER_V4_ABI_SHA256 =
  '7d25b676013777112996fecc036eacbcfc7f09635ddd9b7dd7b6e1cbacddff73';

export const PRODUCTION_CONTRACT_PACKAGE: readonly ProductionPackageEntry[] = [
  {
    contractId: 'FlowBridgeRouterV4',
    selection: 'PRODUCTION_CANDIDATE',
    compiler: ROUTER_V4_BUILD_LINE,
    identity: {
      path: 'contracts/production/router-v4/FlowBridgeRouterV4.sol',
      sourceSha256: REVIEWED_ROUTER_V4_STACKFIX_SHA256,
      artifactSha256: null,
      runtimeSha256: null,
      abiSourceSha256: REVIEWED_ROUTER_V4_ABI_SHA256,
    },
    reviewedSourceSha256: REVIEWED_ROUTER_V4_STACKFIX_SHA256,
    testPath: 'contracts/production/router-v4/test/FlowBridgeRouterV4.t.sol',
    parity: 'PARITY_UNPROVEN',
    notes: [
      'Imported byte-for-byte from the reviewed reference pack; no reformatting, refactor or upgrade applied.',
      'Build identity preserved: solc 0.8.20, existing optimizer settings, viaIR on, EVM target shanghai.',
      'The stackfix variant is the single PRODUCTION_CANDIDATE: identical external ABI, sequential named returns in getBridgeRouteConfig() only.',
      'Artifact/runtime hashes are null: no Solidity toolchain runs in this workspace, so creation/runtime bytecode parity is not yet reproducible.',
      `Reviewed test suite imported (SHA-256 ${REVIEWED_ROUTER_V4_TEST_SHA256}) but not executed here — no Solidity test runner is available.`,
      'Router bridge proxy execution remains disabled for mainnet.',
    ],
  },
  {
    contractId: 'FlowBridgeRouterV4@original',
    selection: 'ARCHIVED_REFERENCE',
    compiler: ROUTER_V4_BUILD_LINE,
    identity: {
      path: 'contracts/archive/router-v4/FlowBridgeRouterV4-original.sol',
      sourceSha256: REVIEWED_ROUTER_V4_ORIGINAL_SHA256,
      artifactSha256: null,
      runtimeSha256: null,
      abiSourceSha256: REVIEWED_ROUTER_V4_ABI_SHA256,
    },
    reviewedSourceSha256: REVIEWED_ROUTER_V4_ORIGINAL_SHA256,
    testPath: null,
    parity: 'PARITY_UNPROVEN',
    notes: [
      'Archived historical copy. Never selectable by deployment tooling.',
      'Differs from the candidate only in getBridgeRouteConfig() return construction.',
    ],
  },
  {
    contractId: 'FlowBridgeRouterLens',
    selection: 'PRODUCTION_CANDIDATE',
    compiler: MISSING_CONTRACT_BUILD_LINE,
    identity: {
      path: 'contracts/production/router-lens/FlowBridgeRouterLens.sol',
      sourceSha256: REVIEWED_LENS.source,
      artifactSha256: REVIEWED_LENS.creation,
      runtimeSha256: REVIEWED_LENS.runtime,
      abiSourceSha256: REVIEWED_LENS.normalizedAbi,
    },
    reviewedSourceSha256: REVIEWED_LENS.source,
    testPath: null,
    parity: 'PARITY_CONFIRMED',
    notes: [
      'Imported byte-for-byte from the reviewed V30.1A.2 handoff (source SHA-256 parity confirmed).',
      'Recompiled in an isolated Hardhat workspace with solc 0.8.20, optimizer runs 1, viaIR on, EVM shanghai: creation, runtime and normalized-ABI hashes reproduce the archived values exactly.',
      'Artifact JSON wrapper bytes differ from the archived file (non-semantic Hardhat metadata fields); bytecode and ABI identity are identical.',
      'Read-only lens: no write authority, and its IFlowBridgeRouterV4View binding was verified selector-for-selector against the frozen Router V4 candidate.',
    ],
  },
  {
    contractId: 'FlowBridgeActivityRegistry',
    selection: 'PRODUCTION_CANDIDATE',
    compiler: MISSING_CONTRACT_BUILD_LINE,
    identity: {
      path: 'contracts/production/activity-registry/FlowBridgeActivityRegistry.sol',
      sourceSha256: REVIEWED_ACTIVITY_REGISTRY.source,
      artifactSha256: REVIEWED_ACTIVITY_REGISTRY.creation,
      runtimeSha256: REVIEWED_ACTIVITY_REGISTRY.runtime,
      abiSourceSha256: REVIEWED_ACTIVITY_REGISTRY.normalizedAbi,
    },
    reviewedSourceSha256: REVIEWED_ACTIVITY_REGISTRY.source,
    testPath: 'contracts/production/activity-registry/test/FlowBridgeActivityRegistry.t.sol',
    parity: 'PARITY_CONFIRMED',
    notes: [
      'Imported byte-for-byte from the reviewed V30.1A.2 handoff; creation, runtime and normalized-ABI hashes reproduce the archived values.',
      'Reviewed Solidity acceptance suite executed in the isolated workspace: 27 passing (canonical activity id formula, duplicate rejection, role separation, pause behaviour, fail-closed unknown reads).',
      'ActivityRecorded.sourceLogIndex is uint256, matching A2.1 parity; verified by the supplied ABI policy checker.',
    ],
  },
  {
    contractId: 'FlowBridgeBridgeAdapterV1',
    selection: 'PRODUCTION_CANDIDATE',
    compiler: MISSING_CONTRACT_BUILD_LINE,
    identity: {
      path: 'contracts/production/bridge-adapter-v1/FlowBridgeBridgeAdapterV1.sol',
      sourceSha256: REVIEWED_BRIDGE_ADAPTER.source,
      artifactSha256: REVIEWED_BRIDGE_ADAPTER.creation,
      runtimeSha256: REVIEWED_BRIDGE_ADAPTER.runtime,
      abiSourceSha256: REVIEWED_BRIDGE_ADAPTER.normalizedAbi,
    },
    reviewedSourceSha256: REVIEWED_BRIDGE_ADAPTER.source,
    testPath: 'contracts/production/bridge-adapter-v1/test/FlowBridgeBridgeAdapterMocks.sol',
    parity: 'PARITY_CONFIRMED',
    notes: [
      'Imported byte-for-byte from the reviewed V30.1A.2 handoff; creation, runtime and normalized-ABI hashes reproduce the archived values.',
      'Supplied local smoke, adversarial security, randomized accounting (40 cases) and gateway reentrancy/balance evidence scripts all pass against a local in-memory chain.',
      'Mainnet Adapter execution stays DISABLED: source parity does not resolve the refund/recovery governance blocker.',
    ],
  },
] as const;

/** Exactly one PRODUCTION_CANDIDATE per logical contract is allowed. */
export function productionCandidate(contractId: string): ProductionPackageEntry | null {
  const matches = PRODUCTION_CONTRACT_PACKAGE.filter(
    (e) => e.contractId === contractId && e.selection === 'PRODUCTION_CANDIDATE',
  );
  return matches.length === 1 ? (matches[0] as ProductionPackageEntry) : null;
}

export function productionCandidateIds(): string[] {
  return PRODUCTION_CONTRACT_PACKAGE.filter((e) => e.selection === 'PRODUCTION_CANDIDATE').map(
    (e) => e.contractId,
  );
}

/** True only when imported bytes match the reviewed candidate hash exactly. */
export function isSourceParityConfirmed(entry: ProductionPackageEntry): boolean {
  return (
    entry.identity.sourceSha256 !== null &&
    entry.reviewedSourceSha256 !== null &&
    entry.identity.sourceSha256 === entry.reviewedSourceSha256
  );
}

export interface ConsolidationVerdict {
  pass: boolean;
  missingContractIds: readonly string[];
  unprovenBuildIdentityIds: readonly string[];
  reasons: readonly string[];
}

const REQUIRED_CONTRACT_IDS = [
  'FlowBridgeRouterV4',
  'FlowBridgeRouterLens',
  'FlowBridgeActivityRegistry',
  'FlowBridgeBridgeAdapterV1',
] as const;

/**
 * Fail-closed consolidation gate. PASS requires every required contract present
 * as a single PRODUCTION_CANDIDATE with confirmed source parity AND a
 * reproducible build identity (artifact + runtime hashes).
 */
export function evaluateConsolidation(): ConsolidationVerdict {
  const missing: string[] = [];
  const unproven: string[] = [];
  const reasons: string[] = [];

  for (const id of REQUIRED_CONTRACT_IDS) {
    const entry = productionCandidate(id);
    if (!entry || !isSourceParityConfirmed(entry)) {
      missing.push(id);
      reasons.push(`${id}: no single PRODUCTION_CANDIDATE with confirmed source parity.`);
      continue;
    }
    if (!entry.identity.artifactSha256 || !entry.identity.runtimeSha256) {
      unproven.push(id);
      reasons.push(`${id}: creation/runtime bytecode identity is not reproducible in this workspace.`);
    }
  }

  return {
    pass: missing.length === 0 && unproven.length === 0,
    missingContractIds: missing,
    unprovenBuildIdentityIds: unproven,
    reasons,
  };
}
