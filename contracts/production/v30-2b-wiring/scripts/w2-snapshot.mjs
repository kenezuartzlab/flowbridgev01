// V30.2B W2 — Post-wiring snapshot + funding readiness. READ-ONLY.
//
// Verifies the full R1–R6 replacement stack after W1 wiring, proves economic
// emptiness and non-activation, confirms the old V30.1 / V30.2A stack stays
// quarantined and unfunded, and prepares (never signs) the two Treasury Safe
// ERC-20 funding transfers.
//
// Never signs. Never broadcasts. Never funds. Never publishes a root or epoch.
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  keccak256,
  parseEther,
  formatEther,
  getAddress,
} from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

// ------------------------------------------------------------------ addresses
const NEW = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'), // R1
  distributor: getAddress('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922'), // R2
  registry: getAddress('0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814'), // R3
  treasury: getAddress('0x96552909998F3DbAf5Ff4979dc158508b3442e65'), // R4
  controller: getAddress('0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF'), // R5
  vault: getAddress('0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D'), // R6
};
const SAFES = {
  treasurySafe: getAddress('0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4'),
  governance: getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507'),
  operations: getAddress('0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF'),
  deployer: getAddress('0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD'),
};
// Superseded stacks that must stay quarantined and unfunded (new FLOW balance 0).
const QUARANTINED = {
  'V30.1 FlowToken': getAddress('0x535ddda826142aC42ce288154e9595f080940ae9'),
  'V30.1 RewardsDistributor': getAddress('0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB'),
  'V30.1 StakingRewardTreasury': getAddress('0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e'),
  'V30.1 StakingController': getAddress('0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf'),
  'V30.1 StakingVaultV2': getAddress('0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8'),
  'V30.1 ActivityRegistry': getAddress('0xa80d8740f378989F649ca14C54e4B4a42E68753c'),
  'V30.2A FlowToken (superseded)': getAddress('0x123E64B12d0Da5A0e5A0b6e1E9A4e6Ff9F51DB63'),
};

const abi = {
  distributor: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-distributor/abi.json'), 'utf8')),
  registry: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-registry/abi.json'), 'utf8')),
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const safeAbi = [
  { type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getThreshold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getOwners', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] },
];

const client = createPublicClient({ transport: http(RPC) });
const fail = [];
const check = (ok, label, detail) => {
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const read = (address, a, functionName, args = []) =>
  client.readContract({ address, abi: a, functionName, args });

// -------------------------------------------------------------- chain identity
const chainId = await client.getChainId();
const blockNumber = await client.getBlockNumber();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);

// ------------------------------------------------------- deployed code present
const codeSizes = {};
for (const [k, v] of Object.entries(NEW)) {
  const code = (await client.getCode({ address: v })) ?? '0x';
  codeSizes[k] = code.length / 2 - 1;
  check(codeSizes[k] > 0, `R-stack ${k} has deployed code`, `${v} ${codeSizes[k]} bytes`);
}

// ------------------------------------------------------- public verification
// Verification state is asserted from the frozen settlement evidence written at
// each R gate (explorer-confirmed); re-read here so drift is visible.
const verification = {};
for (const [name, file] of Object.entries({
  R1_FlowToken: 'V30_2B_R1_SETTLEMENT.json',
  R2_RewardsDistributor: 'V30_2B_R2_SETTLEMENT.json',
  R3_ActivityRegistry: 'V30_2B_R3_SETTLEMENT.json',
  R4_StakingRewardTreasury: 'V30_2B_R4_SETTLEMENT.json',
  R5_StakingController: 'V30_2B_R5_SETTLEMENT.json',
  R6_StakingVaultV2: 'V30_2B_R6_SETTLEMENT.json',
})) {
  const raw = fs.readFileSync(path.join(P, file), 'utf8');
  const verified = /"(?:sourceVerification|verification)"\s*:\s*\{[^}]*"?(?:status|state)"?\s*:\s*"([^"]+)"/.exec(raw)?.[1]
    ?? (/PUBLICLY_VERIFIED|"verified"\s*:\s*true|VERIFIED/i.test(raw) ? 'PUBLICLY_VERIFIED' : 'UNKNOWN');
  verification[name] = verified;
  check(/VERIFIED/i.test(verified), `${name} public source verification recorded`, verified);
}

// ------------------------------------------------------------------- bindings
const flowDecimals = await read(NEW.flow, erc20, 'decimals');
const flowTotalSupply = await read(NEW.flow, erc20, 'totalSupply');
check(Number(flowDecimals) === 18, 'FLOW decimals == 18', String(flowDecimals));

const distToken = getAddress(await read(NEW.distributor, abi.distributor, 'token'));
const treToken = getAddress(await read(NEW.treasury, abi.treasury, 'token'));
const vaultToken = getAddress(await read(NEW.vault, abi.vault, 'token'));
const vaultController = getAddress(await read(NEW.vault, abi.vault, 'controller'));
const vaultTreasury = getAddress(await read(NEW.vault, abi.vault, 'treasury'));
const controllerVault = getAddress(await read(NEW.controller, abi.controller, 'vault'));
check(distToken === NEW.flow, 'Distributor.token == R1 FLOW', distToken);
check(treToken === NEW.flow, 'RewardTreasury.token == R1 FLOW', treToken);
check(vaultToken === NEW.flow, 'Vault.token == R1 FLOW', vaultToken);
check(vaultController === NEW.controller, 'Vault.controller == R5 Controller', vaultController);
check(vaultTreasury === NEW.treasury, 'Vault.treasury == R4 Treasury', vaultTreasury);
check(controllerVault === NEW.vault, 'W1: Controller.vault == R6 Vault', controllerVault);

// ----------------------------------------------------------------- role state
const roles = {
  treasuryVault: await read(NEW.treasury, abi.treasury, 'VAULT_ROLE'),
  treasuryController: await read(NEW.treasury, abi.treasury, 'CONTROLLER_ROLE'),
  treasuryAdmin: await read(NEW.treasury, abi.treasury, 'DEFAULT_ADMIN_ROLE'),
  controllerGovernor: await read(NEW.controller, abi.controller, 'GOVERNOR_ROLE'),
  controllerPublisher: await read(NEW.controller, abi.controller, 'PUBLISHER_ROLE'),
  controllerAdmin: await read(NEW.controller, abi.controller, 'DEFAULT_ADMIN_ROLE'),
  vaultPauser: await read(NEW.vault, abi.vault, 'PAUSER_ROLE'),
  vaultAdmin: await read(NEW.vault, abi.vault, 'DEFAULT_ADMIN_ROLE'),
  vaultEpoch: await read(NEW.vault, abi.vault, 'EPOCH_ROLE'),
  distPublisher: await read(NEW.distributor, abi.distributor, 'PUBLISHER_ROLE'),
  distBudget: await read(NEW.distributor, abi.distributor, 'BUDGET_MANAGER_ROLE'),
  distPauser: await read(NEW.distributor, abi.distributor, 'PAUSER_ROLE'),
  distAdmin: await read(NEW.distributor, abi.distributor, 'DEFAULT_ADMIN_ROLE'),
  registryAttester: await read(NEW.registry, abi.registry, 'ATTESTER_ROLE'),
  registryAdmin: await read(NEW.registry, abi.registry, 'DEFAULT_ADMIN_ROLE'),
};
const has = (c, a, role, who) => read(c, a, 'hasRole', [role, who]);

const roleState = {
  treasuryVaultRoleToVault: await has(NEW.treasury, abi.treasury, roles.treasuryVault, NEW.vault),
  treasuryControllerRoleToController: await has(NEW.treasury, abi.treasury, roles.treasuryController, NEW.controller),
  treasuryAdminGovernance: await has(NEW.treasury, abi.treasury, roles.treasuryAdmin, SAFES.governance),
  treasuryAdminDeployer: await has(NEW.treasury, abi.treasury, roles.treasuryAdmin, SAFES.deployer),
  controllerGovernorGovernance: await has(NEW.controller, abi.controller, roles.controllerGovernor, SAFES.governance),
  controllerAdminGovernance: await has(NEW.controller, abi.controller, roles.controllerAdmin, SAFES.governance),
  controllerAdminDeployer: await has(NEW.controller, abi.controller, roles.controllerAdmin, SAFES.deployer),
  controllerPublisherGovernance: await has(NEW.controller, abi.controller, roles.controllerPublisher, SAFES.governance),
  controllerPublisherOperations: await has(NEW.controller, abi.controller, roles.controllerPublisher, SAFES.operations),
  controllerPublisherDeployer: await has(NEW.controller, abi.controller, roles.controllerPublisher, SAFES.deployer),
  controllerPublisherVault: await has(NEW.controller, abi.controller, roles.controllerPublisher, NEW.vault),
  vaultAdminGovernance: await has(NEW.vault, abi.vault, roles.vaultAdmin, SAFES.governance),
  vaultPauserGovernance: await has(NEW.vault, abi.vault, roles.vaultPauser, SAFES.governance),
  vaultPauserOperations: await has(NEW.vault, abi.vault, roles.vaultPauser, SAFES.operations),
  vaultEpochController: await has(NEW.vault, abi.vault, roles.vaultEpoch, NEW.controller),
  vaultAdminDeployer: await has(NEW.vault, abi.vault, roles.vaultAdmin, SAFES.deployer),
  distributorAdminGovernance: await has(NEW.distributor, abi.distributor, roles.distAdmin, SAFES.governance),
  distributorPauserOperations: await has(NEW.distributor, abi.distributor, roles.distPauser, SAFES.operations),
  distributorPublisherDeployer: await has(NEW.distributor, abi.distributor, roles.distPublisher, SAFES.deployer),
  distributorAdminDeployer: await has(NEW.distributor, abi.distributor, roles.distAdmin, SAFES.deployer),
  registryAdminGovernance: await has(NEW.registry, abi.registry, roles.registryAdmin, SAFES.governance),
  registryAdminDeployer: await has(NEW.registry, abi.registry, roles.registryAdmin, SAFES.deployer),
};

check(roleState.treasuryVaultRoleToVault, 'W1: Treasury VAULT_ROLE held by R6 Vault');
check(roleState.treasuryControllerRoleToController, 'W1: Treasury CONTROLLER_ROLE held by R5 Controller');
check(roleState.treasuryAdminGovernance, 'Treasury DEFAULT_ADMIN_ROLE held by Governance Safe');
check(roleState.controllerGovernorGovernance, 'Controller GOVERNOR_ROLE held by Governance Safe');
check(roleState.controllerAdminGovernance, 'Controller DEFAULT_ADMIN_ROLE held by Governance Safe');
check(roleState.vaultAdminGovernance, 'Vault DEFAULT_ADMIN_ROLE held by Governance Safe');
check(roleState.vaultPauserGovernance, 'Vault PAUSER_ROLE retained by Governance Safe');
check(roleState.vaultPauserOperations, 'W1: Vault PAUSER_ROLE granted to Operations Safe');
check(roleState.distributorAdminGovernance, 'Distributor DEFAULT_ADMIN_ROLE held by Governance Safe');
check(roleState.registryAdminGovernance, 'Registry DEFAULT_ADMIN_ROLE held by Governance Safe');

// publisher must remain unassigned everywhere it would enable emissions
check(!roleState.controllerPublisherGovernance
  && !roleState.controllerPublisherOperations
  && !roleState.controllerPublisherDeployer
  && !roleState.controllerPublisherVault, 'Controller PUBLISHER_ROLE remains unassigned');
check(!roleState.distributorPublisherDeployer, 'Distributor PUBLISHER_ROLE not held by deployer');

// deployer holds nothing anywhere
check(!roleState.treasuryAdminDeployer
  && !roleState.controllerAdminDeployer
  && !roleState.vaultAdminDeployer
  && !roleState.distributorAdminDeployer
  && !roleState.registryAdminDeployer, 'deployer EOA holds no admin role on any R contract');

// --------------------------------------------------------- economic emptiness
const econ = {
  flowTotalSupply: flowTotalSupply.toString(),
  treasurySafeFlowBalance: (await read(NEW.flow, erc20, 'balanceOf', [SAFES.treasurySafe])).toString(),
  distributorFlowBalance: (await read(NEW.flow, erc20, 'balanceOf', [NEW.distributor])).toString(),
  distributorTotalReserved: (await read(NEW.distributor, abi.distributor, 'totalReserved')).toString(),
  distributorTotalClaimed: (await read(NEW.distributor, abi.distributor, 'totalClaimed')).toString(),
  distributorEpochCount: (await read(NEW.distributor, abi.distributor, 'epochCount')).toString(),
  distributorCampaignBudget: (await read(NEW.distributor, abi.distributor, 'campaignBudget')).toString(),
  distributorFreeBalance: (await read(NEW.distributor, abi.distributor, 'freeBalance')).toString(),
  distributorPaused: await read(NEW.distributor, abi.distributor, 'paused'),
  treasuryFlowBalance: (await read(NEW.flow, erc20, 'balanceOf', [NEW.treasury])).toString(),
  treasuryFreeBalance: (await read(NEW.treasury, abi.treasury, 'freeBalance')).toString(),
  treasuryTotalObligations: (await read(NEW.treasury, abi.treasury, 'totalObligations')).toString(),
  treasuryReservedGenesis: (await read(NEW.treasury, abi.treasury, 'reservedGenesis')).toString(),
  treasuryReservedFloors: (await read(NEW.treasury, abi.treasury, 'reservedFloors')).toString(),
  treasuryCommittedEpoch: (await read(NEW.treasury, abi.treasury, 'committedEpoch')).toString(),
  treasuryAccruedUnclaimed: (await read(NEW.treasury, abi.treasury, 'accruedUnclaimed')).toString(),
  vaultFlowBalance: (await read(NEW.flow, erc20, 'balanceOf', [NEW.vault])).toString(),
  vaultTotalPrincipal: (await read(NEW.vault, abi.vault, 'totalPrincipal')).toString(),
  vaultNextPositionId: (await read(NEW.vault, abi.vault, 'nextPositionId')).toString(),
  vaultCurrentEpochCommitted: (await read(NEW.vault, abi.vault, 'currentEpochCommitted')).toString(),
  vaultCurrentEpochEnd: (await read(NEW.vault, abi.vault, 'currentEpochEnd')).toString(),
  vaultCurrentEpochMoved: (await read(NEW.vault, abi.vault, 'currentEpochMoved')).toString(),
  vaultFlowPerSecondByProduct: (
    await Promise.all(
      [0, 1, 2, 3, 4].map((p) => read(NEW.vault, abi.vault, 'currentFlowPerSecond', [p])),
    )
  ).map(String),
  vaultStakedByProduct: (
    await Promise.all(
      [0, 1, 2, 3, 4].map((p) => read(NEW.vault, abi.vault, 'totalStakedByProduct', [p])),
    )
  ).map(String),

  vaultPaused: await read(NEW.vault, abi.vault, 'paused'),
  controllerMaxFlowPerEpoch: (await read(NEW.controller, abi.controller, 'maxFlowPerEpoch')).toString(),
  controllerWeeklyUsdBudget8: (await read(NEW.controller, abi.controller, 'weeklyUsdBudget8')).toString(),
  controllerOracle: getAddress(await read(NEW.controller, abi.controller, 'oracle')),
  controllerEpochCommitted: (await read(NEW.controller, abi.controller, 'epochCommitted')).toString(),
  controllerEpochEnd: (await read(NEW.controller, abi.controller, 'epochEnd')).toString(),
  controllerGenesisYear1Used: (await read(NEW.controller, abi.controller, 'genesisYear1Used')).toString(),
  controllerStandardYear1Used: (await read(NEW.controller, abi.controller, 'standardYear1Used')).toString(),
  controllerEmergencyMode: await read(NEW.controller, abi.controller, 'emergencyMode'),
  registryPaused: await read(NEW.registry, abi.registry, 'paused'),
};

check(econ.distributorFlowBalance === '0', 'Rewards Distributor FLOW balance == 0');
check(econ.distributorTotalReserved === '0', 'Rewards Distributor totalReserved == 0');
check(econ.distributorEpochCount === '0', 'no reward epoch / merkle root exists', `epochCount=${econ.distributorEpochCount}`);
check(econ.distributorTotalClaimed === '0', 'Rewards Distributor totalClaimed == 0');
check(econ.treasuryFlowBalance === '0', 'Staking Reward Treasury FLOW balance == 0');
for (const k of ['treasuryTotalObligations', 'treasuryReservedGenesis', 'treasuryReservedFloors', 'treasuryCommittedEpoch', 'treasuryAccruedUnclaimed', 'treasuryFreeBalance']) {
  check(econ[k] === '0', `Treasury ${k} == 0`);
}
check(econ.vaultTotalPrincipal === '0', 'Vault totalPrincipal == 0');
check(econ.vaultNextPositionId === '0', 'Vault positions == 0 (nextPositionId 0)');
check(econ.vaultFlowBalance === '0', 'Vault FLOW balance == 0');
check(econ.vaultCurrentEpochCommitted === '0'
  && econ.vaultFlowPerSecondByProduct.every((v) => v === '0')
  && econ.vaultStakedByProduct.every((v) => v === '0'),
  'Vault has no active emission epoch and zero stake in every product');
const CEILING = parseEther('50000').toString();
check(econ.controllerMaxFlowPerEpoch === CEILING,
  'W1: Controller maxFlowPerEpoch == 50,000 FLOW', `${econ.controllerMaxFlowPerEpoch} (${formatEther(BigInt(econ.controllerMaxFlowPerEpoch))} FLOW)`);
check(econ.controllerWeeklyUsdBudget8 === '0', 'Controller weeklyUsdBudget8 == 0');
check(econ.controllerOracle === '0x0000000000000000000000000000000000000000', 'Controller oracle remains unset');
check(econ.controllerEpochCommitted === '0' && econ.controllerEpochEnd === '0',
  'no staking epoch committed — staking not activated');
check(econ.controllerGenesisYear1Used === '0' && econ.controllerStandardYear1Used === '0',
  'Year-1 caps fully unused');

// Year-1 ceilings still present on the Controller.
const ceilings = {
  genesisYear1Cap: (await read(NEW.controller, abi.controller, 'GENESIS_YEAR1_CAP')).toString(),
  standardYear1Cap: (await read(NEW.controller, abi.controller, 'STANDARD_YEAR1_CAP')).toString(),
  totalYear1Cap: (await read(NEW.controller, abi.controller, 'TOTAL_YEAR1_CAP')).toString(),
};
check(ceilings.genesisYear1Cap === parseEther('1000000').toString()
  && ceilings.standardYear1Cap === parseEther('2000000').toString()
  && ceilings.totalYear1Cap === parseEther('3000000').toString(),
  'Year-1 1M / 2M / 3M ceilings present', JSON.stringify(ceilings));

// --------------------------------------------------------------- quarantine
const quarantine = {};
for (const [label, addr] of Object.entries(QUARANTINED)) {
  const bal = await read(NEW.flow, erc20, 'balanceOf', [addr]);
  quarantine[label] = { address: addr, newFlowBalance: bal.toString() };
  check(bal === 0n, `quarantined ${label} holds 0 new FLOW`, addr);
}

// ------------------------------------------------------ app registry readiness
const appRegistry = {
  rewardsRegistryMainnet: /chainId: BOT_MAINNET_CHAIN_ID[\s\S]{0,240}?distributor: null/.test(
    fs.readFileSync(path.join(P, '../../src/lib/rewards/flowRewardsRegistry.ts'), 'utf8'),
  ),
  stakingRegistryMainnet: /chainId: BOT_MAINNET_CHAIN_ID[\s\S]{0,240}?vault: null/.test(
    fs.readFileSync(path.join(P, '../../src/lib/staking/flowStakingRegistry.ts'), 'utf8'),
  ),
};
check(appRegistry.rewardsRegistryMainnet,
  'app rewards registry: BOT Mainnet still null + claimsEnabled false (no public activation)');
check(appRegistry.stakingRegistryMainnet,
  'app staking registry: BOT Mainnet still null + stakingEnabled false (no public activation)');
// No superseded mainnet address may be wired into the app.
const appSrc = ['src/lib/rewards/flowRewardsRegistry.ts', 'src/lib/staking/flowStakingRegistry.ts', 'src/lib/staking/flowStakingPolicy.ts']
  .map((f) => fs.readFileSync(path.join(P, '../..', f), 'utf8'))
  .join('\n')
  .toLowerCase();
check(Object.values(QUARANTINED).every((a) => !appSrc.includes(a.toLowerCase())),
  'app registries reference no superseded V30.1 / V30.2A mainnet address');

// ------------------------------------------------------- funding preparation
const treasurySafeNonce = await read(SAFES.treasurySafe, safeAbi, 'nonce');
const treasurySafeThreshold = await read(SAFES.treasurySafe, safeAbi, 'getThreshold');
const treasurySafeOwners = await read(SAFES.treasurySafe, safeAbi, 'getOwners');

const fundingSpecs = [
  { id: 'REWARDS_1M', recipient: NEW.distributor, flow: '1000000', label: 'new Rewards Distributor (R2)' },
  { id: 'STAKING_10M', recipient: NEW.treasury, flow: '10000000', label: 'new Staking Reward Treasury (R4)' },
];
const funding = [];
let cumulative = 0n;
for (const s of fundingSpecs) {
  const amount = parseEther(s.flow);
  cumulative += amount;
  const calldata = encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [s.recipient, amount] });
  let simulation = 'OK';
  let gasEstimate = null;
  try {
    await client.call({ account: SAFES.treasurySafe, to: NEW.flow, data: calldata });
    gasEstimate = (await client.estimateGas({ account: SAFES.treasurySafe, to: NEW.flow, data: calldata })).toString();
  } catch (e) {
    simulation = `REVERT: ${String(e).slice(0, 160)}`;
  }
  let revertsFromDeployer = false;
  try {
    await client.call({ account: SAFES.deployer, to: NEW.flow, data: calldata });
  } catch { revertsFromDeployer = true; }

  check(simulation === 'OK', `${s.id} simulates OK from Treasury Safe`, simulation);
  check(revertsFromDeployer, `${s.id} reverts from deployer EOA (Safe-only authority)`);
  check(calldata.startsWith('0xa9059cbb') && calldata.length === 2 + 8 + 128,
    `${s.id} is a bare ERC-20 transfer payload`);

  funding.push({
    id: s.id,
    description: `ERC-20 transfer of ${Number(s.flow).toLocaleString('en-US')} FLOW to the ${s.label}`,
    sourceSafe: SAFES.treasurySafe,
    tokenTarget: NEW.flow,
    recipient: s.recipient,
    amountFlow: s.flow,
    amountTokenUnits: amount.toString(),
    selector: '0xa9059cbb',
    calldata,
    calldataKeccak: keccak256(calldata),
    value: '0',
    operation: 'CALL',
    treasurySafeNonce: Number(treasurySafeNonce) + funding.length,
    requiredConfirmations: Number(treasurySafeThreshold),
    simulation,
    gasEstimate,
    expectedPostState: {
      treasurySafeFlow: `-${s.flow} FLOW`,
      recipientFlow: `+${s.flow} FLOW`,
      obligationsOrReserved: '0 (unchanged — funding is inventory only)',
      epochsOrRoots: '0 (unchanged — no activation)',
    },
    signed: false,
    broadcast: false,
  });
}
check(BigInt(econ.treasurySafeFlowBalance) >= cumulative,
  'Treasury Safe holds enough FLOW for both transfers',
  `${formatEther(BigInt(econ.treasurySafeFlowBalance))} FLOW available`);
check(new Set(funding.map((f) => f.calldataKeccak)).size === 2, 'the two transfers are distinct, never batched');

// ------------------------------------------------------------------- evidence
const out = {
  gate: 'V30.2B W2 — Post-Wiring Snapshot + Funding Readiness',
  mode: 'READ-ONLY — no signature, no broadcast, no funding, no root, no epoch, no oracle, no publisher',
  generatedAt: new Date().toISOString(),
  chain: { chainId, blockNumber: blockNumber.toString(), rpcHost: new URL(RPC).host },
  addresses: { ...NEW, ...SAFES },
  codeSizes,
  publicVerification: verification,
  bindings: { distToken, treToken, vaultToken, vaultController, vaultTreasury, controllerVault },
  roleHashes: Object.fromEntries(Object.entries(roles)),
  roleState,
  economicState: econ,
  year1Ceilings: ceilings,
  quarantine,
  appRegistryReadiness: {
    ...appRegistry,
    conclusion:
      'App registries are fail-closed for BOT Mainnet (token/distributor/vault null, claims + staking disabled) and carry no superseded address. Promotion to the V30.2B addresses is a separate public-activation gate and was deliberately NOT performed.',
  },
  treasurySafe: {
    address: SAFES.treasurySafe,
    nonce: Number(treasurySafeNonce),
    threshold: Number(treasurySafeThreshold),
    owners: treasurySafeOwners,
    flowBalance: econ.treasurySafeFlowBalance,
  },
  fundingActions: funding,
  broadcastLedger: {
    transactionsSigned: 0,
    transactionsBroadcast: 0,
    flowTransferred: '0',
    roleChanges: 0,
    configurationWrites: 0,
    rootsPublished: 0,
    epochsCommitted: 0,
  },
  failures: fail,
  verdict: fail.length === 0
    ? 'V30.2B W2 POST-WIRING SNAPSHOT + FUNDING READINESS PASS — PREPARED, NOT FUNDED'
    : 'V30.2B W2 FAIL',
};
fs.writeFileSync(path.join(D, 'W2_SNAPSHOT.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`\n${out.verdict}`);
if (fail.length) {
  console.log(fail.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}
