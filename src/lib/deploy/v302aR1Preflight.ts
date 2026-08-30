/**
 * FlowBridge V30.2A R1 — New FlowToken unsigned deployment preparation.
 *
 * Read-only and secret-free. This module records the frozen non-viaIR R1 build
 * identity, the exact constructor arguments, the live chain-677 deployer
 * observation, the unsigned deployment-data identity and the ONE-TIME R1
 * approval binding. It holds no private key, signs nothing and broadcasts
 * nothing. Signing happens exclusively in the operator's external wallet.
 */
import { fnv1a64 } from './mainnetReleaseFreeze';
import { GAS_SAFETY_BUFFER_BPS } from './mainnetDeploymentGate';
import {
  BOT_MAINNET_CHAIN_ID,
  V30_2A_FROZEN_BUILDS,
  V30_2A_CANDIDATE_DIGEST_INPUT,
  computeCandidateDigest,
  withinEip170,
} from './v302aRedeployCandidate';

/** Owner-frozen candidate digest that this preparation is bound to. */
export const R1_APPROVED_CANDIDATE_DIGEST = 'fnv1a64:e0ac31b5bb297880';

/** Public deployer EOA (unchanged across the release). */
export const R1_DEPLOYER_ADDRESS = '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD';

/** Treasury Safe that receives the whole fixed supply at construction. */
export const R1_TREASURY_SAFE = '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4';

export const R1_TOTAL_SUPPLY_FLOW = 1_000_000_000n;
export const R1_DECIMALS = 18;
export const R1_TOTAL_SUPPLY_WEI = R1_TOTAL_SUPPLY_FLOW * 10n ** BigInt(R1_DECIMALS);

/** Old FLOW stays exactly where it is. */
export const R1_OLD_FLOW_TOKEN = {
  address: '0x535dDDA826142AC42cE288154e9595f080940aE9',
  lifecycle: 'DEPRECATED_PENDING_REPLACEMENT',
  runtimeCodeBytesObserved: 3539,
  allowanceGranted: false,
  transferPrepared: false,
  fundingPrepared: false,
  burnPrepared: false,
  migrationPrepared: false,
} as const;

/** Exact compiler matrix used for the R1 artifact (non-viaIR). */
export const R1_COMPILER_MATRIX = {
  solc: '0.8.24+commit.e11b9ed9',
  solcLongVersion: '0.8.24+commit.e11b9ed9.Emscripten.clang',
  optimizerEnabled: true,
  optimizerRuns: 200,
  viaIR: false,
  evmVersion: 'cancun',
  metadataBytecodeHash: 'ipfs',
  metadataAppendCBOR: true,
  language: 'Solidity',
  solidityWarnings: 0,
  doubleBuildIdentical: true,
} as const;

/** Frozen artifact identity. Must equal the V30.2A candidate FlowToken row. */
export const R1_ARTIFACT = {
  contractId: 'FlowToken',
  sourceSha256: '96a757b53494a5cee3268ef289183c660c6c8b6bd22e27a44469b6780c83229e',
  standardInputSha256: 'd8188e0288c79807f2ff8a209cb099e48cedce51a3ef69086e44c6a448d73590',
  creationSha256: 'f15c487550c01c071784a39ff1de895645cb24ab626a719d449103730c7258d5',
  runtimeSha256: '73dcb8db0657a18bd57e4021900c57a646da1c6cb9b6eda3c2e3e725db4130f9',
  normalizedAbiSha256: '879c21aabfb51e2982e4f45db18453a5812d302be5f75a19484ba127da78b851',
  runtimeBytes: 3760,
} as const;

/** Deployment safety properties re-read from the compiled ABI + source. */
export const R1_SAFETY_PROPERTIES = {
  hasOwner: false,
  hasMintFunction: false,
  hasMinterRole: false,
  hasTransferTax: false,
  hasBlacklist: false,
  hasRebase: false,
  hasReflection: false,
  hasUpgradeableProxy: false,
  hasHooks: false,
  fixedSupplyMintedOnceInConstructor: true,
} as const;

export const R1_CONSTRUCTOR_ARGS = [
  { name: 'name_', type: 'string', value: 'FlowBridge' },
  { name: 'symbol_', type: 'string', value: 'FLOW' },
  { name: 'treasury_', type: 'address', value: R1_TREASURY_SAFE },
  { name: 'totalSupply_', type: 'uint256', value: R1_TOTAL_SUPPLY_WEI.toString() },
] as const;

/** ABI-encoded constructor arguments (appended to creation bytecode). */
export const R1_CONSTRUCTOR_ARGS_ABI_HEX =
  '0x000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000efc13d1a1dc30ba2da0bb005ba5a783c6b229ea40000000000000000000000000000000000000000033b2e3c9fd0803ce8000000000000000000000000000000000000000000000000000000000000000000000a466c6f77427269646765000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004464c4f5700000000000000000000000000000000000000000000000000000000';

export const R1_CONSTRUCTOR_ARGS_SHA256 =
  '06b40677b34dcbee89ef0a52799c99b453117ef16288f2430bca5fd8cb3b631a';

/** Unsigned deployment data = creation bytecode || encoded constructor args. */
export const R1_UNSIGNED_DATA = {
  bytes: 5780,
  keccak256: '0xa2f4737d87d3618603dfcc190d6c7c51cdc5c8839d4a1f4eca5b3573d46e423e',
  sha256: '27badf4f90f80d41b2e1637b89bb076f450b17252eadf8019bb8d802df87c0e6',
} as const;

/** Live read-only observation of BOT Mainnet 677 (public data only). */
export const R1_OBSERVATION = {
  chainId: BOT_MAINNET_CHAIN_ID,
  blockNumber: 21_471_458,
  deployerCode: '0x',
  deployerIsEoa: true,
  nonce: 8,
  balanceWei: 2_206_706_800_000_000_000n,
  gasPriceWei: 20_000_000_000n,
  gasEstimate: 994_903n,
  expectedCreateAddress: '0x123E64D074FD5d66DBd4BD62Dc4e71da7101DB63',
} as const;

export function bufferedGasLimit(estimate: bigint): bigint {
  return estimate + (estimate * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
}

export const R1_GAS_LIMIT = bufferedGasLimit(R1_OBSERVATION.gasEstimate);
export const R1_MAX_COST_WEI = R1_GAS_LIMIT * R1_OBSERVATION.gasPriceWei;

/** Verification package readiness for immediate explorer submission. */
export const R1_VERIFICATION_PACKAGE = {
  standardJsonPath: 'contracts/production/v30-2a-candidate/standard-inputs/FlowToken.standard-input.json',
  standardInputSha256: R1_ARTIFACT.standardInputSha256,
  viaIR: false,
  contractPath: 'FlowToken.sol',
  contractName: 'FlowToken',
  constructorArgsAbiHex: R1_CONSTRUCTOR_ARGS_ABI_HEX,
  readyForImmediateVerification: true,
} as const;

export interface R1PreflightCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface R1PreflightResult {
  gate: 'V30.2A.R1';
  contractId: 'FlowToken';
  chainId: number;
  candidateDigest: string;
  approvedCandidateDigest: string;
  checks: readonly R1PreflightCheck[];
  pass: boolean;
  broadcast: false;
  /** One-time approval binding hash (candidate + artifact + args + deployer + chain + tx). */
  approvalBindingHash: string;
}

/** One-time R1 approval binding. Any change to any bound field invalidates it. */
export function computeR1ApprovalBinding(): string {
  return fnv1a64(
    JSON.stringify({
      gate: 'V30.2A.R1',
      candidateDigest: R1_APPROVED_CANDIDATE_DIGEST,
      chainId: BOT_MAINNET_CHAIN_ID,
      contractId: R1_ARTIFACT.contractId,
      compiler: R1_COMPILER_MATRIX,
      artifact: R1_ARTIFACT,
      args: R1_CONSTRUCTOR_ARGS.map((a) => `${a.name}:${a.type}=${a.value}`),
      constructorArgsSha256: R1_CONSTRUCTOR_ARGS_SHA256,
      deployer: R1_DEPLOYER_ADDRESS.toLowerCase(),
      nonce: R1_OBSERVATION.nonce,
      expectedAddress: R1_OBSERVATION.expectedCreateAddress.toLowerCase(),
      unsignedDataKeccak: R1_UNSIGNED_DATA.keccak256,
      gasLimit: R1_GAS_LIMIT.toString(),
    }),
  );
}

export const R1_APPROVAL_BINDING_HASH = computeR1ApprovalBinding();

/** Fail-closed R1 preflight. Returns PASS only when every check holds. */
export function evaluateR1Preflight(): R1PreflightResult {
  const frozen = V30_2A_FROZEN_BUILDS.find((b) => b.stage === 'R1')!;
  const candidateDigest = computeCandidateDigest(V30_2A_CANDIDATE_DIGEST_INPUT);
  const safety = Object.entries(R1_SAFETY_PROPERTIES);

  const checks: R1PreflightCheck[] = [
    {
      id: 'chainId677',
      ok: R1_OBSERVATION.chainId === 677,
      detail: `observed chainId ${R1_OBSERVATION.chainId}`,
    },
    {
      id: 'candidateDigestFrozen',
      ok: candidateDigest === R1_APPROVED_CANDIDATE_DIGEST,
      detail: `${candidateDigest} vs approved ${R1_APPROVED_CANDIDATE_DIGEST}`,
    },
    { id: 'viaIrDisabled', ok: R1_COMPILER_MATRIX.viaIR === false && frozen.viaIR === false, detail: 'viaIR: false' },
    {
      id: 'compilerMatrixMatchesCandidate',
      ok:
        R1_COMPILER_MATRIX.solc === frozen.solc &&
        R1_COMPILER_MATRIX.optimizerRuns === frozen.optimizerRuns &&
        R1_COMPILER_MATRIX.evmVersion === frozen.evmVersion,
      detail: `${frozen.solc} runs=${frozen.optimizerRuns} evm=${frozen.evmVersion}`,
    },
    {
      id: 'artifactHashesMatchCandidate',
      ok:
        R1_ARTIFACT.sourceSha256 === frozen.sourceSha256 &&
        R1_ARTIFACT.standardInputSha256 === frozen.standardInputSha256 &&
        R1_ARTIFACT.creationSha256 === frozen.creationSha256 &&
        R1_ARTIFACT.runtimeSha256 === frozen.runtimeSha256 &&
        R1_ARTIFACT.normalizedAbiSha256 === frozen.normalizedAbiSha256 &&
        R1_ARTIFACT.runtimeBytes === frozen.runtimeBytes,
      detail: 'source/creation/runtime/ABI identical to the V30.2A candidate',
    },
    {
      id: 'doubleBuildReproducible',
      ok: R1_COMPILER_MATRIX.doubleBuildIdentical && frozen.doubleBuildIdentical,
      detail: 'two clean builds byte-identical, zero Solidity warnings',
    },
    { id: 'eip170', ok: withinEip170(R1_ARTIFACT.runtimeBytes), detail: `${R1_ARTIFACT.runtimeBytes} runtime bytes` },
    {
      id: 'fixedSupplyAndDecimals',
      ok: R1_DECIMALS === 18 && R1_TOTAL_SUPPLY_WEI === 1_000_000_000n * 10n ** 18n,
      detail: '1,000,000,000 FLOW, 18 decimals',
    },
    {
      id: 'recipientIsTreasurySafe',
      ok: R1_CONSTRUCTOR_ARGS[2].value.toLowerCase() === R1_TREASURY_SAFE.toLowerCase(),
      detail: R1_TREASURY_SAFE,
    },
    {
      id: 'noPrivilegedTokenPaths',
      ok: safety.every(([k, v]) => (k === 'fixedSupplyMintedOnceInConstructor' ? v === true : v === false)),
      detail: 'no owner/minter/tax/blacklist/rebase/reflection/proxy/hook path',
    },
    { id: 'deployerIsEoa', ok: R1_OBSERVATION.deployerCode === '0x', detail: 'eth_getCode == 0x' },
    {
      id: 'balanceCoversBufferedGas',
      ok: R1_OBSERVATION.balanceWei >= R1_MAX_COST_WEI,
      detail: `${R1_OBSERVATION.balanceWei} wei >= ${R1_MAX_COST_WEI} wei`,
    },
    {
      id: 'oldFlowUntouched',
      ok:
        R1_OLD_FLOW_TOKEN.lifecycle === 'DEPRECATED_PENDING_REPLACEMENT' &&
        !R1_OLD_FLOW_TOKEN.allowanceGranted &&
        !R1_OLD_FLOW_TOKEN.transferPrepared &&
        !R1_OLD_FLOW_TOKEN.fundingPrepared &&
        !R1_OLD_FLOW_TOKEN.burnPrepared &&
        !R1_OLD_FLOW_TOKEN.migrationPrepared,
      detail: 'old FLOW deprecated, no allowance/transfer/funding/burn/migration',
    },
    {
      id: 'verificationPackageReady',
      ok:
        R1_VERIFICATION_PACKAGE.readyForImmediateVerification &&
        R1_VERIFICATION_PACKAGE.viaIR === false &&
        R1_VERIFICATION_PACKAGE.standardInputSha256 === R1_ARTIFACT.standardInputSha256,
      detail: 'non-viaIR Standard JSON + ABI-encoded args ready for the explorer',
    },
    { id: 'notBroadcast', ok: true, detail: 'no signature, no broadcast, no funding in this gate' },
  ];

  return {
    gate: 'V30.2A.R1',
    contractId: 'FlowToken',
    chainId: BOT_MAINNET_CHAIN_ID,
    candidateDigest,
    approvedCandidateDigest: R1_APPROVED_CANDIDATE_DIGEST,
    checks,
    pass: checks.every((c) => c.ok),
    broadcast: false,
    approvalBindingHash: R1_APPROVAL_BINDING_HASH,
  };
}
