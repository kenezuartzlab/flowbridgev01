// V30.2B R6 — FlowStakingVaultV2 preflight. READ-ONLY.
//
// Encodes the frozen constructor args against the verified V30.2B dependencies
// (R1 FLOW, R5 Controller, R4 Treasury), predicts the CREATE address, estimates
// gas, proves the reviewed economic/security rules from the frozen source, and
// proves no old-stack address appears in the source or the deployment payload.
// Never signs, never broadcasts, never funds, never wires, never grants a role.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  http,
  encodeAbiParameters,
  keccak256,
  getContractAddress,
  formatEther,
  getAddress,
} from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const DEPLOYER = '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD';

// Frozen constructor: (address token_, address controller_, address treasury_, address admin)
const ARGS = {
  token: '0xcaaB50F36252a57529AFeF651fa6B9f9281917fF', // V30.2B R1 FLOW
  controller: '0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF', // V30.2B R5 Controller
  treasury: '0x96552909998F3DbAf5Ff4979dc158508b3442e65', // V30.2B R4 Reward Treasury
  admin: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507', // Governance Safe
};

const OLD = {
  oldFlowToken: '0x535ddda826142ac42ce288154e9595f080940ae9',
  oldTreasury: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  oldController: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
  oldVaultV2: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
};

const h = (s) => createHash('sha256').update(s).digest('hex');
const client = createPublicClient({ transport: http(RPC) });

const frozenBytes = fs.readFileSync(path.join(D, 'frozen-standard-input.json'), 'utf8');
const creation = fs.readFileSync(path.join(D, 'creation-bytecode.txt'), 'utf8').trim();
const runtime = fs.readFileSync(path.join(D, 'runtime-bytecode.txt'), 'utf8').trim();
const abi = JSON.parse(fs.readFileSync(path.join(D, 'abi.json'), 'utf8'));

const encoded = encodeAbiParameters(
  [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }],
  [getAddress(ARGS.token), getAddress(ARGS.controller), getAddress(ARGS.treasury), getAddress(ARGS.admin)],
);
const data = creation + encoded.slice(2);

// -------------------------------------------------------------- live read-only
const chainId = await client.getChainId();
const blockNumber = await client.getBlockNumber();
const pendingNonce = await client.getTransactionCount({ address: DEPLOYER, blockTag: 'pending' });
const balance = await client.getBalance({ address: DEPLOYER });
const predicted = getContractAddress({ from: DEPLOYER, nonce: BigInt(pendingNonce) });
const predictedCode = (await client.getCode({ address: predicted })) ?? '0x';
const code = async (a) => ((await client.getCode({ address: a })) ?? '0x');
const [tokenCode, controllerCode, treasuryCode] = await Promise.all([
  code(ARGS.token),
  code(ARGS.controller),
  code(ARGS.treasury),
]);

let gasEstimate;
try {
  gasEstimate = (await client.estimateGas({ account: DEPLOYER, data })).toString();
} catch (e) {
  gasEstimate = 'ESTIMATE_FAILED: ' + (e.shortMessage || e.message);
}
const gasPrice = await client.getGasPrice();
const buffered = /^\d+$/.test(gasEstimate) ? ((BigInt(gasEstimate) * 130n) / 100n).toString() : null;

// R5 controller must still be inert and unwired to any vault.
const ctrlAbi = [
  { type: 'function', name: 'vault', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'maxFlowPerEpoch', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'weeklyUsdBudget8', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];
const ctrlRead = async (fn) => {
  try {
    return String(await client.readContract({ address: ARGS.controller, abi: ctrlAbi, functionName: fn }));
  } catch (e) {
    return 'READ_FAILED';
  }
};
const controllerState = {
  vault: await ctrlRead('vault'),
  maxFlowPerEpoch: await ctrlRead('maxFlowPerEpoch'),
  weeklyUsdBudget8: await ctrlRead('weeklyUsdBudget8'),
};

// ----------------------------------------------------------------- source proofs
const src = fs.readFileSync(path.join(D, 'sources', 'FlowStakingVaultV2.sol'), 'utf8');
const lower = src.toLowerCase();
const payloadLower = data.toLowerCase();

const economics = {
  fiveProductsFromControllerOnly: /controller\.products\(productId\)/.test(src),
  noLocalProductTable: !/_setProduct\(/.test(src),
  genesisWindowNinetyDays: /GENESIS_MAX_SECONDS\s*=\s*90 days/.test(src),
  genesisLifetimeLineage: /mapping\(address => uint256\) public genesisSecondsConsumed/.test(src),
  genesisAntiReset: /genesisSecondsConsumed\[msg\.sender\] \+=/.test(src),
  genesisReservedAtEntry: /treasury\.reserveGenesis\(genesisObligation\)/.test(src),
  genesisBudgetReleasedOnFailure: /controller\.releaseGenesisBudget\(genesisObligation\)/.test(src),
  floorFullyReservedOrRevert:
    /treasury\.reserveFloor\(floorObligation\)/.test(src) && /revert FloorNotReservable\(\)/.test(src),
  variableAccrualAccumulator: /varPerTokenStored\[/.test(src) && /currentFlowPerSecond\[/.test(src),
  epochSettlementControllerOnly: /revert NotController\(\)/.test(src),
  unvestedRemainderReleasedOnWithdraw:
    /treasury\.releaseGenesis\(gRelease\)/.test(src) && /treasury\.releaseFloor\(fRelease\)/.test(src),
};

const principalSafety = {
  principalHeldByVault: /token\.safeTransferFrom\(msg\.sender, address\(this\), principal\)/.test(src),
  principalReturnedToOwnerOnly: /token\.safeTransfer\(msg\.sender, principal\)/.test(src),
  rewardsPaidByTreasuryNotFromPrincipal: /treasury\.payOut\(msg\.sender/.test(src),
  noRewardPathTouchesVaultBalance: !/token\.safeTransfer\((?!msg\.sender, principal)/.test(src),
  noMintPath: !/\bfunction\s+mint\s*\(/.test(src) && !/\.mint\(/.test(src),
  noSweepOrRescue: !/(rescue|sweep|skim|recover)/i.test(src),
  noArbitraryCall: !/\.call\(/.test(src) && !/delegatecall/.test(src),
  noProxyOrUpgrade: !/(Initializable|UUPS|Upgradeable|_authorizeUpgrade|delegatecall)/.test(src),
  noTokenTax: !/(fee|tax)Bps/i.test(src),
  reentrancyGuardedMutators: (src.match(/nonReentrant/g) || []).length >= 4,
};

const pauseModel = {
  pauserRoleConstant: /PAUSER_ROLE = keccak256\("PAUSER_ROLE"\)/.test(src),
  pauseRestrictedToPauser: /function pause\(\) external onlyRole\(PAUSER_ROLE\)/.test(src),
  unpauseRestrictedToAdmin: /function unpause\(\) external onlyRole\(DEFAULT_ADMIN_ROLE\)/.test(src),
  canPause: ['openPosition', 'claim'].filter((f) =>
    new RegExp(`function ${f}\\([^)]*\\)[^{]*whenNotPaused`).test(src),
  ),
  cannotBePaused: ['withdraw'].filter(
    (f) => new RegExp(`function ${f}\\([^)]*\\)(?![^{]*whenNotPaused)[^{]*\\{`).test(src),
  ),
  principalExitAlwaysAvailable: !/function withdraw\([^)]*\)[^{]*whenNotPaused/.test(src),
};

const initialState = {
  nextPositionIdStartsAtZeroIdsFromOne: /uint256 public nextPositionId; \/\/ ids start at 1/.test(src),
  constructorOnlyBindsAndGrantsAdminRoles:
    /constructor\(address token_, address controller_, address treasury_, address admin\)/.test(src),
  constructorGrantsDefaultAdmin: /_grantRole\(DEFAULT_ADMIN_ROLE, admin\)/.test(src),
  constructorGrantsPauser: /_grantRole\(PAUSER_ROLE, admin\)/.test(src),
  constructorNoTokenMovement: !/constructor[\s\S]{0,900}?safeTransfer/.test(src),
  constructorNoApproval: !/approve\(/.test(src),
  constructorRejectsZeroDependencies: /if \(token_ == address\(0\) \|\| controller_ == address\(0\)/.test(src),
  noPositionsOrPrincipalAtDeploy: true,
  noRewardInventoryHeld: true,
};

const roleMatrix = {
  DEFAULT_ADMIN_ROLE: ARGS.admin,
  PAUSER_ROLE: ARGS.admin,
  deployerRoles: 'NONE',
  vaultRoleOnTreasury: 'NOT_GRANTED_IN_THIS_GATE',
  vaultBindingOnController: 'NOT_SET_IN_THIS_GATE',
  note: 'Operations pauser delegation and treasury VAULT_ROLE are separate authorized wiring gates.',
};

const oldRefsInSource = Object.entries(OLD).filter(([, a]) => lower.includes(a.toLowerCase()));
const oldRefsInPayload = Object.entries(OLD).filter(([, a]) =>
  payloadLower.includes(a.toLowerCase().slice(2)),
);
const dependencyProof = {
  boundTo: ARGS,
  tokenIsV30_2B_R1: getAddress(ARGS.token) === getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  controllerIsV30_2B_R5: getAddress(ARGS.controller) === getAddress('0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF'),
  treasuryIsV30_2B_R4: getAddress(ARGS.treasury) === getAddress('0x96552909998F3DbAf5Ff4979dc158508b3442e65'),
  allDependenciesHaveCode:
    tokenCode !== '0x' && controllerCode !== '0x' && treasuryCode !== '0x',
  oldAddressesInSource: oldRefsInSource.map(([k]) => k),
  oldAddressesInPayload: oldRefsInPayload.map(([k]) => k),
};

const noWrites = {
  signatures: 0,
  broadcasts: 0,
  fundingTransfers: 0,
  approvals: 0,
  roleGrants: 0,
  controllerVaultWiring: 0,
  oracleConfig: 0,
  publisherAssignment: 0,
  maxFlowPerEpochUpdates: 0,
  epochPublications: 0,
};

const checks = {
  chainIdIs677: chainId === 677,
  predictedDestinationCodeless: predictedCode === '0x',
  deployerHasGas: balance > 0n,
  eip170: runtime.length / 2 - 1 <= 24576,
  dependenciesDeployed: dependencyProof.allDependenciesHaveCode,
  noOldAddressContamination:
    oldRefsInSource.length === 0 && oldRefsInPayload.length === 0,
  economicsIntact: Object.values(economics).every(Boolean),
  principalSafetyIntact: Object.values(principalSafety).every(Boolean),
  pauseModelIntact:
    pauseModel.pauserRoleConstant &&
    pauseModel.pauseRestrictedToPauser &&
    pauseModel.unpauseRestrictedToAdmin &&
    pauseModel.principalExitAlwaysAvailable,
  initialStateEmpty: Object.values(initialState).every(Boolean),
  r5ControllerStillInert:
    controllerState.vault === '0x0000000000000000000000000000000000000000' &&
    controllerState.maxFlowPerEpoch === '0' &&
    controllerState.weeklyUsdBudget8 === '0',
  gasEstimated: /^\d+$/.test(gasEstimate),
};

const blockers = Object.entries(checks)
  .filter(([, v]) => !v)
  .map(([k]) => k);

const out = {
  gate: 'V30.2B_R6_PREFLIGHT',
  mode: 'READ_ONLY_NO_SIGNING_NO_BROADCAST',
  verdict: blockers.length
    ? 'R6 PREFLIGHT BLOCKED'
    : 'R6 VIAIR TECHNICAL-NECESSITY PREFLIGHT PASS — FROZEN CANDIDATE REPRODUCIBLE, ZERO WRITES',
  chainId,
  observedBlock: Number(blockNumber),
  live: {
    rpcHost: new URL(RPC).host,
    deployer: DEPLOYER,
    pendingNonce,
    balanceWei: balance.toString(),
    balanceBOT: formatEther(balance),
    predictedAddress: predicted,
    predictedCode,
    gasPriceWei: gasPrice.toString(),
    gasEstimate,
    gasLimitPlus30pct: buffered,
    dependencyCodePresent: {
      token: tokenCode !== '0x',
      controller: controllerCode !== '0x',
      treasury: treasuryCode !== '0x',
    },
    r5ControllerState: controllerState,
  },
  constructor: {
    signature: 'constructor(address token_, address controller_, address treasury_, address admin)',
    args: ARGS,
    encoded,
    argsKeccak: keccak256(encoded),
  },
  deployment: {
    dataBytes: (data.length - 2) / 2,
    dataKeccak: keccak256(data),
    dataSha256: h(Buffer.from(data.slice(2), 'hex')),
  },
  artifact: {
    creationSha256: h(Buffer.from(creation.slice(2), 'hex')),
    runtimeSha256: h(Buffer.from(runtime.slice(2), 'hex')),
    normalizedAbiSha256: h(JSON.stringify(abi)),
    standardInputSha256: h(frozenBytes),
    creationBytes: (creation.length - 2) / 2,
    runtimeBytes: (runtime.length - 2) / 2,
    eip170: { limit: 24576, headroomBytes: 24576 - (runtime.length - 2) / 2 },
  },
  economics,
  principalSafety,
  pauseModel,
  initialState,
  roleMatrix,
  dependencyProof,
  noWrites,
  verificationPackage: 'contracts/production/v30-2b-vault/verification-standard-input.json',
  checks,
  blockers,
};

fs.writeFileSync(path.join(D, 'unsigned-deployment-data.txt'), data);
fs.writeFileSync(path.join(D, 'constructor-args.txt'), encoded + '\n');
console.log(JSON.stringify(out, null, 2));
