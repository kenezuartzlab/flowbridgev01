/**
 * FlowBridge V30.1A — mainnet deployment preflight + deterministic plan.
 *
 * Pure, fail-closed evaluation. It NEVER broadcasts, NEVER signs and NEVER sees
 * secret material: the caller passes only public facts plus booleans describing
 * whether server-side secrets are present. Every check must pass before a
 * deployment plan is produced; otherwise the plan is null.
 */
import {
  BOT_MAINNET_CHAIN_ID,
  classifyNetworkIdentifier,
} from '@/lib/network/canonicalNetworks';
import {
  CONTRACT_INVENTORY,
  inventoryEntry,
  registryRecord,
  testnetAddressSet,
  type CompilerProfile,
} from './contractInventory';

export interface PreflightInput {
  contractId: string;
  /** Network the operator says they are targeting. */
  expectedChainId: number;
  /** Chain id reported by the configured RPC endpoint. */
  rpcChainId: number | null;
  deployerAddress: string | null;
  approvedDeployers: readonly string[];
  /** Deployer native BOT balance, wei. */
  deployerBalanceWei: bigint | null;
  requiredGasWei: bigint;
  sourceHash: string | null;
  expectedSourceHash: string | null;
  artifactHash: string | null;
  expectedArtifactHash: string | null;
  compiler: CompilerProfile | null;
  constructorArgs: Record<string, string | number | null>;
  productionOwner: string | null;
  /** true when the deployment secret exists server-side (never its value). */
  deploymentSecretPresent: boolean;
}

export type PreflightCheckId =
  | 'EXPECTED_NETWORK_677'
  | 'RPC_CHAIN_MATCHES'
  | 'NO_UNRESOLVED_1024'
  | 'DEPLOYER_APPROVED'
  | 'GAS_SUFFICIENT'
  | 'SOURCE_HASH_MATCH'
  | 'ARTIFACT_HASH_MATCH'
  | 'COMPILER_MATCHES_BUILD_LINE'
  | 'CONSTRUCTOR_ARGS_COMPLETE'
  | 'PRODUCTION_OWNER_SET'
  | 'NO_TESTNET_CONTAMINATION'
  | 'DEPLOY_SECRET_SERVER_SIDE'
  | 'CONTRACT_READY_FOR_MAINNET'
  | 'REGISTRY_SLOT_UNDEPLOYED';

export interface PreflightCheck {
  id: PreflightCheckId;
  ok: boolean;
  detail: string;
}

export interface DeploymentPlan {
  contractId: string;
  chainId: number;
  compiler: CompilerProfile;
  sourceHash: string;
  artifactHash: string;
  constructorArgs: Record<string, string | number | null>;
  productionOwner: string;
  /** Deterministic ordered steps. Execution stays outside this module. */
  steps: readonly string[];
}

export interface PreflightResult {
  contractId: string;
  checks: readonly PreflightCheck[];
  blockers: readonly string[];
  ok: boolean;
  plan: DeploymentPlan | null;
}

const lower = (v: string | null | undefined) => (v ?? '').toLowerCase().trim();

function sameCompiler(a: CompilerProfile | null, b: CompilerProfile | null): boolean {
  if (!a || !b) return false;
  return (
    a.version === b.version &&
    a.evmVersion === b.evmVersion &&
    a.viaIR === b.viaIR &&
    a.optimizer.enabled === b.optimizer.enabled &&
    a.optimizer.runs === b.optimizer.runs
  );
}

function containsTestnetAddress(input: PreflightInput): string | null {
  const testnet = testnetAddressSet();
  const candidates: string[] = [lower(input.deployerAddress), lower(input.productionOwner)];
  for (const value of Object.values(input.constructorArgs)) {
    if (typeof value === 'string') candidates.push(lower(value));
  }
  return candidates.find((c) => c && testnet.has(c)) ?? null;
}

export function evaluateMainnetPreflight(input: PreflightInput): PreflightResult {
  const entry = inventoryEntry(input.contractId);
  const checks: PreflightCheck[] = [];
  const add = (id: PreflightCheckId, ok: boolean, detail: string) =>
    checks.push({ id, ok, detail });

  add(
    'EXPECTED_NETWORK_677',
    input.expectedChainId === BOT_MAINNET_CHAIN_ID,
    `expected chain ${input.expectedChainId} (canonical BOT Mainnet is ${BOT_MAINNET_CHAIN_ID})`,
  );
  add(
    'RPC_CHAIN_MATCHES',
    input.rpcChainId === BOT_MAINNET_CHAIN_ID,
    `RPC reported chain ${input.rpcChainId ?? 'unknown'}`,
  );

  const legacyValues = [input.expectedChainId, input.rpcChainId].filter(
    (v) => classifyNetworkIdentifier(v) === 'UNVERIFIED_LEGACY',
  );
  add(
    'NO_UNRESOLVED_1024',
    legacyValues.length === 0,
    legacyValues.length === 0
      ? 'no unresolved legacy 1024 network assumption'
      : 'unverified legacy identifier 1024 present — fails closed',
  );

  const approved = new Set(input.approvedDeployers.map(lower));
  add(
    'DEPLOYER_APPROVED',
    Boolean(lower(input.deployerAddress)) && approved.has(lower(input.deployerAddress)),
    'deployer public address must be on the approved list',
  );

  add(
    'GAS_SUFFICIENT',
    input.deployerBalanceWei !== null && input.deployerBalanceWei >= input.requiredGasWei,
    'deployer must hold at least the required BOT gas budget',
  );

  add(
    'SOURCE_HASH_MATCH',
    Boolean(input.sourceHash) && input.sourceHash === input.expectedSourceHash,
    'source hash must equal the reviewed source hash',
  );
  add(
    'ARTIFACT_HASH_MATCH',
    Boolean(input.artifactHash) && input.artifactHash === input.expectedArtifactHash,
    'artifact hash must equal the reviewed artifact hash',
  );
  add(
    'COMPILER_MATCHES_BUILD_LINE',
    sameCompiler(input.compiler, entry?.compiler ?? null),
    'compiler version, optimizer, viaIR and EVM target must match the reviewed build line',
  );

  const missingArgs = Object.entries(input.constructorArgs)
    .filter(([, v]) => v === null || v === '')
    .map(([k]) => k);
  add(
    'CONSTRUCTOR_ARGS_COMPLETE',
    Object.keys(input.constructorArgs).length > 0 && missingArgs.length === 0,
    missingArgs.length ? `unfrozen constructor values: ${missingArgs.join(', ')}` : 'all frozen',
  );

  add(
    'PRODUCTION_OWNER_SET',
    Boolean(lower(input.productionOwner)),
    'expected production owner/admin must be declared before deployment',
  );

  const contaminated = containsTestnetAddress(input);
  add(
    'NO_TESTNET_CONTAMINATION',
    contaminated === null,
    contaminated ? `testnet address reused: ${contaminated}` : 'no testnet address reuse',
  );

  add(
    'DEPLOY_SECRET_SERVER_SIDE',
    input.deploymentSecretPresent,
    'deployment secret must exist server-side (its value never leaves the server)',
  );

  add(
    'CONTRACT_READY_FOR_MAINNET',
    entry?.readiness === 'READY_FOR_MAINNET',
    entry ? `inventory readiness = ${entry.readiness}` : 'contract not in inventory',
  );

  const record = registryRecord('mainnet', input.contractId);
  add(
    'REGISTRY_SLOT_UNDEPLOYED',
    record !== null && record.address === null,
    'mainnet registry slot must be empty before a first deployment',
  );

  const blockers = [
    ...checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`),
    ...(entry?.blockers ?? []),
  ];
  const ok = checks.every((c) => c.ok) && (entry?.blockers.length ?? 1) === 0;

  const plan: DeploymentPlan | null =
    ok && entry?.compiler && input.sourceHash && input.artifactHash && input.productionOwner
      ? {
          contractId: input.contractId,
          chainId: BOT_MAINNET_CHAIN_ID,
          compiler: entry.compiler,
          sourceHash: input.sourceHash,
          artifactHash: input.artifactHash,
          constructorArgs: input.constructorArgs,
          productionOwner: input.productionOwner,
          steps: [
            'confirm RPC chain id 677',
            'confirm approved deployer + gas budget',
            'deploy with frozen constructor arguments',
            'record address, tx hash, block and runtime hash in the mainnet registry',
            'verify source on the BOT explorer',
            'transfer ownership/admin to approved multisig/timelock governance',
            'execute the approved funding sequence',
          ],
        }
      : null;

  return { contractId: input.contractId, checks, blockers, ok, plan };
}

/** Whole-inventory readiness matrix for reporting. */
export function mainnetReadinessMatrix() {
  return CONTRACT_INVENTORY.map((c) => ({
    id: c.id,
    readiness: c.readiness,
    sourcePresent: c.sourcePath !== null,
    mainnetState: registryRecord('mainnet', c.id)?.state ?? 'NOT_DEPLOYED',
    blockers: c.blockers,
  }));
}
