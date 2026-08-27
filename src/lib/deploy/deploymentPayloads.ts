/**
 * FlowBridge V30.1E.1 — deterministic deployment payloads.
 *
 * Constructor arguments for every stage are derived from the approved decision
 * manifest (V30.1D.4) and the staged dependency graph, then hashed. Nothing
 * here signs, broadcasts or holds a private key. Values that only exist after
 * a prior stage is DEPLOYED_VERIFIED are represented as unresolved dependency
 * references, so an unresolved payload can never be approved or broadcast.
 */
import {
  APPROVED_AUTHORITIES,
  FLOW_TOKEN_DECIMALS,
  FLOW_TOTAL_SUPPLY_FLOW,
  type DeploymentStageId,
} from './mainnetDeploymentGate';
import { fnv1a64 } from './mainnetReleaseFreeze';
import { PRODUCTION_BYTECODE, type ProductionContractId } from './productionBytecode';

/** Reference to an address that only exists once an earlier stage is verified. */
export interface DependencyRef {
  kind: 'DEPLOYED_CONTRACT';
  contractId: ProductionContractId;
}

export type ConstructorValue = string | number | DependencyRef;

export interface ConstructorArgSpec {
  name: string;
  type: string;
  value: ConstructorValue;
  /** Human-readable rendering shown beside the hash in the admin surface. */
  display: string;
}

export interface DeploymentPayload {
  stage: DeploymentStageId;
  contractId: ProductionContractId;
  chainId: 677;
  creationSha256: string;
  runtimeSha256: string | null;
  args: readonly ConstructorArgSpec[];
  /** Hash over the canonical constructor-argument object. */
  constructorArgsHash: string;
  /** Hash over creation bytecode identity + constructor args (unsigned payload). */
  unsignedPayloadHash: string;
  unresolvedDependencies: readonly ProductionContractId[];
  expectedEffect: string;
}

const isRef = (v: ConstructorValue): v is DependencyRef =>
  typeof v === 'object' && v !== null && (v as DependencyRef).kind === 'DEPLOYED_CONTRACT';

const FLOW_TOTAL_SUPPLY_WEI = (
  BigInt(FLOW_TOTAL_SUPPLY_FLOW) * 10n ** BigInt(FLOW_TOKEN_DECIMALS)
).toString();

const ref = (contractId: ProductionContractId): DependencyRef => ({
  kind: 'DEPLOYED_CONTRACT',
  contractId,
});

const arg = (name: string, type: string, value: ConstructorValue): ConstructorArgSpec => ({
  name,
  type,
  value,
  display: isRef(value) ? `<deployed ${value.contractId}>` : String(value),
});

interface PayloadDefinition {
  stage: DeploymentStageId;
  contractId: ProductionContractId;
  args: readonly ConstructorArgSpec[];
  expectedEffect: string;
}

const DEFINITIONS: readonly PayloadDefinition[] = [
  {
    stage: 'A_FLOW_TOKEN',
    contractId: 'FlowToken',
    args: [
      arg('name_', 'string', 'FlowBridge'),
      arg('symbol_', 'string', 'FLOW'),
      arg('treasury_', 'address', APPROVED_AUTHORITIES.treasurySafe),
      arg('totalSupply_', 'uint256', FLOW_TOTAL_SUPPLY_WEI),
    ],
    expectedEffect:
      'Deploys FLOW with a fixed 1,000,000,000 supply (18 decimals), fully minted to the approved Treasury Safe. No mint function remains.',
  },
  {
    stage: 'B_REWARDS_DISTRIBUTOR',
    contractId: 'FlowRewardsMerkleDistributor',
    args: [
      arg('token_', 'address', ref('FlowToken')),
      arg('admin_', 'address', APPROVED_AUTHORITIES.governanceSafe),
      arg('budgetManager_', 'address', APPROVED_AUTHORITIES.governanceSafe),
      arg('publisher_', 'address', APPROVED_AUTHORITIES.rootPublisher),
      arg('pauser_', 'address', APPROVED_AUTHORITIES.operationsSafe),
      arg('recoveryRecipient_', 'address', APPROVED_AUTHORITIES.treasurySafe),
      arg('minPublishDelay_', 'uint64', 86_400),
    ],
    expectedEffect:
      'Deploys the budgeted Merkle distributor bound to the deployed FLOW token, unfunded, with a 24h publish delay and Governance/Operations role split.',
  },
  {
    stage: 'C_ROUTER_V4_AND_LENS',
    contractId: 'FlowBridgeRouterV4',
    args: [arg('initialOwner', 'address', APPROVED_AUTHORITIES.governanceSafe)],
    expectedEffect:
      'Deploys Router V4 owned by the Governance Safe with bridge proxy execution OFF. Existing Router v3 stays untouched and keeps production traffic until an explicit migration decision.',
  },
  {
    stage: 'C_ROUTER_V4_AND_LENS',
    contractId: 'FlowBridgeRouterLens',
    args: [arg('flowRouter_', 'address', ref('FlowBridgeRouterV4'))],
    expectedEffect:
      'Deploys the read-only Lens bound to the freshly deployed Router V4 (constructor requires deployed code at the target).',
  },
  {
    stage: 'D_ACTIVITY_REGISTRY',
    contractId: 'FlowBridgeActivityRegistry',
    args: [
      arg('admin', 'address', APPROVED_AUTHORITIES.governanceSafe),
      arg('attester', 'address', APPROVED_AUTHORITIES.activityAttester),
      arg('pauser', 'address', APPROVED_AUTHORITIES.operationsSafe),
    ],
    expectedEffect:
      'Deploys an empty Activity Registry with admin != attester, the approved Activity Attester and Operations pauser.',
  },
  {
    stage: 'E_STAKING_V2',
    contractId: 'FlowStakingRewardTreasury',
    args: [
      arg('token_', 'address', ref('FlowToken')),
      arg('admin', 'address', APPROVED_AUTHORITIES.governanceSafe),
      arg('recoveryRecipient_', 'address', APPROVED_AUTHORITIES.treasurySafe),
    ],
    expectedEffect:
      'Deploys the staking reward treasury bound to FLOW, unfunded, recovering only to the Treasury Safe.',
  },
  {
    stage: 'E_STAKING_V2',
    contractId: 'FlowStakingController',
    args: [
      arg('admin', 'address', APPROVED_AUTHORITIES.governanceSafe),
      arg('governor', 'address', APPROVED_AUTHORITIES.governanceSafe),
      arg('publisher', 'address', APPROVED_AUTHORITIES.rootPublisher),
    ],
    expectedEffect:
      'Deploys the staking controller with the five approved products and frozen Year-1 ceilings (1M genesis / 2M standard / 3M total, 50,000 FLOW weekly).',
  },
  {
    stage: 'E_STAKING_V2',
    contractId: 'FlowStakingVaultV2',
    args: [
      arg('token_', 'address', ref('FlowToken')),
      arg('controller_', 'address', ref('FlowStakingController')),
      arg('treasury_', 'address', ref('FlowStakingRewardTreasury')),
      arg('admin', 'address', APPROVED_AUTHORITIES.governanceSafe),
    ],
    expectedEffect:
      'Deploys the staking vault cross-bound to FLOW, the deployed controller and the deployed reward treasury, with zero positions and zero liabilities.',
  },
] as const;

function canonicalArgs(args: readonly ConstructorArgSpec[]): string {
  return JSON.stringify(
    args.map((a) => ({
      name: a.name,
      type: a.type,
      value: isRef(a.value) ? `ref:${a.value.contractId}` : String(a.value),
    })),
  );
}

function build(def: PayloadDefinition): DeploymentPayload {
  const entry = PRODUCTION_BYTECODE[def.contractId];
  const constructorArgsHash = fnv1a64(canonicalArgs(def.args));
  return {
    stage: def.stage,
    contractId: def.contractId,
    chainId: 677,
    creationSha256: entry.creationSha256,
    runtimeSha256: entry.runtimeSha256,
    args: def.args,
    constructorArgsHash,
    unsignedPayloadHash: fnv1a64(
      `${def.contractId}|677|${entry.creationSha256}|${constructorArgsHash}`,
    ),
    unresolvedDependencies: def.args.filter((a) => isRef(a.value)).map((a) => (a.value as DependencyRef).contractId),
    expectedEffect: def.expectedEffect,
  };
}

export const DEPLOYMENT_PAYLOADS: readonly DeploymentPayload[] = DEFINITIONS.map(build);

export function payloadFor(contractId: ProductionContractId): DeploymentPayload {
  const found = DEPLOYMENT_PAYLOADS.find((p) => p.contractId === contractId);
  if (!found) throw new Error(`no frozen deployment payload for ${contractId}`);
  return found;
}

export function payloadsForStage(stage: DeploymentStageId): readonly DeploymentPayload[] {
  return DEPLOYMENT_PAYLOADS.filter((p) => p.stage === stage);
}

/**
 * Resolve dependency references against addresses proven on chain. Returns null
 * when any dependency is still unknown — a payload can never be half-resolved.
 */
export function resolvePayload(
  payload: DeploymentPayload,
  deployed: Partial<Record<ProductionContractId, string>>,
): { args: readonly (string | number)[]; constructorArgsHash: string } | null {
  const out: (string | number)[] = [];
  for (const a of payload.args) {
    if (isRef(a.value)) {
      const addr = deployed[a.value.contractId];
      if (!addr) return null;
      out.push(addr.toLowerCase());
    } else {
      out.push(a.value);
    }
  }
  return {
    args: out,
    constructorArgsHash: fnv1a64(
      JSON.stringify(
        payload.args.map((a, i) => ({ name: a.name, type: a.type, value: String(out[i]) })),
      ),
    ),
  };
}
