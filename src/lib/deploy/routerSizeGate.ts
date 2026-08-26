/**
 * FlowBridge V30.1B.1 — Router V4 EIP-170 production size gate.
 *
 * Pure, descriptive and fail-closed. It records the independently measured
 * creation vs deployed (runtime) bytecode of the size-safe Router candidate,
 * the removed-selector migration, the static-analysis triage and the delayed
 * governance preparation. It compiles nothing, deploys nothing, signs nothing.
 */
import { EIP170_LIMIT_BYTES } from './securityGate';

/** Target the gate prefers, leaving upgrade headroom below the hard limit. */
export const PREFERRED_RUNTIME_BUDGET_BYTES = 23_500;

export interface BytecodeMeasurement {
  contractId: string;
  /** Deployment (init) code length in bytes — NOT the EIP-170 subject. */
  creationBytes: number;
  /** Deployed/runtime code length in bytes — the EIP-170 subject. */
  runtimeBytes: number;
  creationSha256: string;
  runtimeSha256: string;
  sourceSha256: string;
  normalizedAbiSha256: string;
}

/**
 * Measured in the isolated pinned workspace (solc 0.8.20, viaIR, EVM shanghai;
 * Router optimizer runs 200, Lens runs 1) with sources at `src/<Name>.sol`.
 * Solidity embeds the source path in metadata, so hashes are only reproducible
 * with that exact layout.
 */
export const V30_1B1_BASELINE: readonly BytecodeMeasurement[] = [
  {
    contractId: 'FlowBridgeRouterV4@V30.1B',
    creationBytes: 29_074,
    runtimeBytes: 28_703,
    creationSha256: '51bd139b17376a6cbcc1a1c721c2fcdb65c649004beb05781bacdd067b6f75f4',
    runtimeSha256: '81453edb9a72fa87af7278956ffcfebc1bfa4d2730016478d9d4a50a6d0380eb',
    sourceSha256: 'd6fdd281b5bd0c3211aca95fba94bf38c4031973c175d12d4b26455a5c584a46',
    normalizedAbiSha256: 'aed8a4a3fa195a58ff9da812808e1423ac239b0b41769ba9cfd1cebd84f95f00',
  },
] as const;

export const V30_1B1_SIZE_SAFE: readonly BytecodeMeasurement[] = [
  {
    contractId: 'FlowBridgeRouterV4',
    creationBytes: 20_020,
    runtimeBytes: 19_720,
    creationSha256: '7dc0c1869a3eab59afae396294256b3d968a00de33e0554be9c6b63c30ff1195',
    runtimeSha256: '93a922d67c281bf076d87bcf71de186f0998a8feb9c3dccafe592d097000a0f9',
    sourceSha256: 'bb43445af143d8c4a36fd144315c2d99f13fe28c73eca63c4f3736709e3ba905',
    normalizedAbiSha256: '913ace626b49a5e32b24457bf0fc6982ecca2fbfdcafff6d616ab67fc095d6df',
  },
  {
    contractId: 'FlowBridgeRouterLens',
    creationBytes: 8_069,
    runtimeBytes: 7_829,
    creationSha256: 'c075879e896baaf0ce61f3c15f11313753d75b77d9dfc4a9795e0c28aaea319b',
    runtimeSha256: '05cde1794ef1620af4248deebb92680d1b806e534dd99ee5f5c8b4603dea6ca3',
    sourceSha256: '8a5e1c842d6177b380c93b6670eb8e47ef58f00eb5e10bcc4508a3b16ff71aa2',
    normalizedAbiSha256: '0ee994f33acf1df22e0fd5e558f757d83e0f9913663bf596ef0044dc02dc7042',
  },
] as const;

export function sizeSafeMeasurement(contractId: string): BytecodeMeasurement | null {
  return V30_1B1_SIZE_SAFE.find((m) => m.contractId === contractId) ?? null;
}

/** Bytes saved on the EIP-170 subject (runtime code) by the size reduction. */
export const RUNTIME_BYTES_SAVED =
  (V30_1B1_BASELINE[0]?.runtimeBytes ?? 0) - (V30_1B1_SIZE_SAFE[0]?.runtimeBytes ?? 0);

export type SizeAttribution =
  | 'LEGACY_SWAP_WRAPPERS'
  | 'DISABLED_BRIDGE_PROXY_EXECUTION'
  | 'DISCOVERY_AND_QUOTE_READS'
  | 'REVERT_STRING_TO_CUSTOM_ERRORS';

export interface SizeReductionItem {
  attribution: SizeAttribution;
  detail: string;
  /** Selectors removed from the Router ABI, if any. */
  removedFunctions: readonly string[];
  /** Where the capability lives now, or null when it is intentionally gone. */
  replacement: string | null;
  /** True only when no execution-safety invariant was weakened. */
  invariantsPreserved: true;
}

export const SIZE_REDUCTION_LEDGER: readonly SizeReductionItem[] = [
  {
    attribution: 'LEGACY_SWAP_WRAPPERS',
    detail:
      'The non fee-bound V3-compatible swap wrappers were deleted. Only the hardened `*Safe` entry points remain, so every mainnet swap is bound to a maxProtocolFee the caller actually read.',
    removedFunctions: [
      'swapV2',
      'swapV3Single',
      'swapV3Multi',
      'swapNativeToToken',
      'swapTokenToNative',
      'swapMultiHop',
    ],
    replacement: 'swapV2Safe / swapV3SingleSafe / swapV3MultiSafe / swapNativeToTokenSafe / swapTokenToNativeSafe / swapMultiHopSafe',
    invariantsPreserved: true,
  },
  {
    attribution: 'DISABLED_BRIDGE_PROXY_EXECUTION',
    detail:
      'Bridge proxy execution was already disabled for mainnet, so the executable surface (bridgeWithFee / bridgeBot and their internals) was removed entirely. Bridging stays the direct official BOT Bridge architecture; bridge registry metadata reads are unchanged.',
    removedFunctions: ['bridgeWithFee', 'bridgeBot'],
    replacement: 'direct official BOT Bridge gateway (unchanged production architecture)',
    invariantsPreserved: true,
  },
  {
    attribution: 'DISCOVERY_AND_QUOTE_READS',
    detail:
      'Read-only registry discovery and V2 quoting were removed from the Router; FlowBridgeRouterLens already serves the identical signatures plus the hardened findBestV2Rate / getRoutersPage / getBridgesPage reads.',
    removedFunctions: [
      'getActiveRouters',
      'getActiveBridges',
      'getBridgeRouteConfig',
      'getBestV2Rate',
      'getV2RatesPage',
    ],
    replacement: 'FlowBridgeRouterLens (read-only, no authority, no custody)',
    invariantsPreserved: true,
  },
  {
    attribution: 'REVERT_STRING_TO_CUSTOM_ERRORS',
    detail:
      '107 string-based require checks became 58 custom errors. Every check, condition and ordering is preserved — only the revert encoding changed, which removes the string blobs from deployed code.',
    removedFunctions: [],
    replacement: 'contracts/production/router-v4/V30_1B1_ERROR_MAP.json',
    invariantsPreserved: true,
  },
] as const;

export type StaticAnalysisDisposition = 'FALSE_POSITIVE' | 'BY_DESIGN' | 'ACTION_REQUIRED';

export interface StaticAnalysisResult {
  detector: string;
  severity: 'HIGH' | 'MEDIUM';
  location: string;
  disposition: StaticAnalysisDisposition;
  rationale: string;
}

/**
 * Slither 0.11.3 (pinned) against the size-safe candidate with solc 0.8.20,
 * --optimize --optimize-runs 200 --via-ir, informational/low excluded:
 * 10 contracts, 63 detectors, 3 results — all triaged, none actionable.
 */
export const SLITHER_RUN = {
  tool: 'slither-analyzer',
  version: '0.11.3',
  solc: '0.8.20',
  detectors: 63,
  results: 3,
  executed: true,
} as const;

export const SLITHER_TRIAGE: readonly StaticAnalysisResult[] = [
  {
    detector: 'arbitrary-send-eth',
    severity: 'HIGH',
    location: '_takeNativeFee — feeTreasury.call{value: fee}()',
    disposition: 'BY_DESIGN',
    rationale:
      'feeTreasury is owner-configured governance state, never a user-supplied destination, and the transfer is the protocol fee itself. A failed call reverts the swap.',
  },
  {
    detector: 'incorrect-equality',
    severity: 'MEDIUM',
    location: '_collectExactTokenInput — afterBalance - beforeBalance == amount',
    disposition: 'BY_DESIGN',
    rationale:
      'The strict equality is the fee-on-transfer/rebasing rejection invariant: any token that does not deliver the exact requested amount is refused before execution.',
  },
  {
    detector: 'reentrancy-no-eth',
    severity: 'MEDIUM',
    location: '_swapMultiHop — routers[routerId] read after external calls',
    disposition: 'FALSE_POSITIVE',
    rationale:
      'The reported "state written" is a local struct copy of routers[routerId] (a read). Every swap entry point is nonReentrant, and a malicious downstream router attempting re-entry reverts (test_MaliciousDownstreamReentrancyBlocked).',
  },
] as const;

export interface GovernancePreparation {
  role: string;
  /** Address is intentionally null: nothing is deployed or assigned here. */
  address: null;
  requirement: string;
}

/** Delayed governance preparation only — no deployment, no ownership transfer. */
export const GOVERNANCE_PREPARATION: readonly GovernancePreparation[] = [
  {
    role: 'FlowBridgeRouterV4 owner (Ownable2Step)',
    address: null,
    requirement:
      'Approved production multisig, held behind a timelock, accepted via the two-step handshake after deployment. Unassigned: blocker V30.1B-G1 remains open.',
  },
  {
    role: 'registryActivationDelay',
    address: null,
    requirement:
      'Set to the approved production delay before any integration is activated; every material mutation re-arms it and lowering it cannot accelerate a pending activation.',
  },
  {
    role: 'feeTreasury',
    address: null,
    requirement: 'Approved treasury address under the same governance owner; fee ceiling stays ≤ 10% absolute.',
  },
] as const;

export interface RouterSizeVerdict {
  pass: boolean;
  runtimeBytes: number;
  headroomBytes: number;
  withinPreferredBudget: boolean;
  reasons: readonly string[];
}

/** Fail-closed: an unknown or oversized runtime measurement blocks the gate. */
export function evaluateRouterSizeGate(): RouterSizeVerdict {
  const m = sizeSafeMeasurement('FlowBridgeRouterV4');
  if (!m) {
    return {
      pass: false,
      runtimeBytes: 0,
      headroomBytes: 0,
      withinPreferredBudget: false,
      reasons: ['No size-safe Router V4 runtime measurement is recorded.'],
    };
  }

  const reasons: string[] = [];
  if (m.runtimeBytes >= EIP170_LIMIT_BYTES) {
    reasons.push(
      `FlowBridgeRouterV4 runtime code ${m.runtimeBytes} bytes is not strictly below the EIP-170 limit ${EIP170_LIMIT_BYTES}.`,
    );
  }
  for (const item of SIZE_REDUCTION_LEDGER) {
    if (!item.invariantsPreserved) reasons.push(`${item.attribution}: execution invariants not preserved.`);
  }
  if (!SLITHER_RUN.executed) reasons.push('Static analysis (Slither) was not executed.');
  for (const r of SLITHER_TRIAGE) {
    if (r.disposition === 'ACTION_REQUIRED') reasons.push(`${r.detector}: unresolved static-analysis finding.`);
  }

  return {
    pass: reasons.length === 0,
    runtimeBytes: m.runtimeBytes,
    headroomBytes: EIP170_LIMIT_BYTES - m.runtimeBytes,
    withinPreferredBudget: m.runtimeBytes <= PREFERRED_RUNTIME_BUDGET_BYTES,
    reasons,
  };
}
