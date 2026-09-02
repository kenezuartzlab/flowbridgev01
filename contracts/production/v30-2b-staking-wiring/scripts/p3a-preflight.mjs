// V30.2B P3A — Staking publisher wiring + Genesis epoch preflight.
// READ-ONLY. Nothing is signed, broadcast or funded by this script.
//
// 1. Fresh chain-677 preflight of the R4/R5/R6 staking stack, authority state,
//    frozen caps, oracle absence and exit safety.
// 2. Builds the two authorized governance role grants and simulates each from
//    the Governance Safe execution context.
// 3. Derives the epoch transaction from the verified deployed R5 ABI/source and
//    reports whether a fixed-rate Genesis-only epoch is expressible at all.
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient, http, getAddress, formatEther, parseEther,
  encodeFunctionData, keccak256, toHex, stringToBytes,
} from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  treasury: getAddress('0x96552909998F3DbAf5Ff4979dc158508b3442e65'),
  controller: getAddress('0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF'),
  vault: getAddress('0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D'),
};
const SAFES = {
  governance: getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507'),
  operations: getAddress('0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF'),
  deployer: getAddress('0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD'),
};
const PUBLISHER = getAddress('0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22');

const abi = {
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }];
const safeAbi = [{ type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getThreshold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }];

const client = createPublicClient({ transport: http(RPC) });
const fail = [];
const blockers = [];
const check = (ok, label, detail) => {
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const read = (address, a, functionName, args = []) => client.readContract({ address, abi: a, functionName, args });
const tryRead = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

const chainId = await client.getChainId();
const block = await client.getBlock();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);

for (const [k, v] of Object.entries(A)) {
  const code = (await client.getCode({ address: v })) ?? '0x';
  check(code.length > 2, `${k} has deployed code`, v);
}

// ------------------------------------------------------------------ role hashes
const ROLE = {
  epoch: await read(A.vault, abi.vault, 'EPOCH_ROLE'),
  pauser: await read(A.vault, abi.vault, 'PAUSER_ROLE'),
  publisher: await read(A.controller, abi.controller, 'PUBLISHER_ROLE'),
  governor: await read(A.controller, abi.controller, 'GOVERNOR_ROLE'),
  admin: '0x0000000000000000000000000000000000000000000000000000000000000000',
};
check(ROLE.epoch === keccak256(stringToBytes('EPOCH_ROLE')), 'Vault EPOCH_ROLE hash canonical', ROLE.epoch);
check(ROLE.publisher === keccak256(stringToBytes('PUBLISHER_ROLE')), 'Controller PUBLISHER_ROLE hash canonical', ROLE.publisher);

// ------------------------------------------------------------- bindings + state
const bindings = {
  vaultController: await read(A.vault, abi.vault, 'controller'),
  vaultTreasury: await read(A.vault, abi.vault, 'treasury'),
  vaultToken: await read(A.vault, abi.vault, 'token'),
  controllerVault: await read(A.controller, abi.controller, 'vault'),
};
check(getAddress(bindings.vaultController) === A.controller, 'Vault.controller == R5');
check(getAddress(bindings.vaultTreasury) === A.treasury, 'Vault.treasury == R4');
check(getAddress(bindings.vaultToken) === A.flow, 'Vault.token == canonical FLOW');
check(getAddress(bindings.controllerVault) === A.vault, 'Controller.vault == R6');

const authority = {
  vaultAdminGov: await read(A.vault, abi.vault, 'hasRole', [ROLE.admin, SAFES.governance]),
  vaultAdminDeployer: await read(A.vault, abi.vault, 'hasRole', [ROLE.admin, SAFES.deployer]),
  controllerAdminGov: await read(A.controller, abi.controller, 'hasRole', [ROLE.admin, SAFES.governance]),
  controllerGovernorGov: await read(A.controller, abi.controller, 'hasRole', [ROLE.governor, SAFES.governance]),
  controllerAdminDeployer: await read(A.controller, abi.controller, 'hasRole', [ROLE.admin, SAFES.deployer]),
};
check(authority.vaultAdminGov, 'Governance Safe is Vault role admin');
check(authority.controllerAdminGov, 'Governance Safe is Controller role admin');
check(!authority.vaultAdminDeployer && !authority.controllerAdminDeployer, 'deployer holds no staking admin authority');

// unexpected role holders
const candidates = { governance: SAFES.governance, operations: SAFES.operations, deployer: SAFES.deployer, controller: A.controller, vault: A.vault, publisher: PUBLISHER };
const epochHolders = [];
const publisherHolders = [];
for (const [k, v] of Object.entries(candidates)) {
  if (await read(A.vault, abi.vault, 'hasRole', [ROLE.epoch, v])) epochHolders.push(`${k}:${v}`);
  if (await read(A.controller, abi.controller, 'hasRole', [ROLE.publisher, v])) publisherHolders.push(`${k}:${v}`);
}
const epochRoleToController = await read(A.vault, abi.vault, 'hasRole', [ROLE.epoch, A.controller]);
const publisherRoleToApproved = await read(A.controller, abi.controller, 'hasRole', [ROLE.publisher, PUBLISHER]);
check(epochHolders.filter((h) => !h.startsWith('controller:')).length === 0, 'no unexpected Vault EPOCH_ROLE holder', epochHolders.join(', ') || 'none');
check(publisherHolders.filter((h) => !h.startsWith('publisher:')).length === 0, 'no unexpected Controller PUBLISHER_ROLE holder', publisherHolders.join(', ') || 'none');

// ---------------------------------------------------------------- economics
const econ = {
  treasuryFlow: await read(A.flow, erc20, 'balanceOf', [A.treasury]),
  vaultFlow: await read(A.flow, erc20, 'balanceOf', [A.vault]),
  vaultPrincipal: await read(A.vault, abi.vault, 'totalPrincipal'),
  nextPositionId: await read(A.vault, abi.vault, 'nextPositionId'),
  maxFlowPerEpoch: await read(A.controller, abi.controller, 'maxFlowPerEpoch'),
  weeklyUsdBudget8: await read(A.controller, abi.controller, 'weeklyUsdBudget8'),
  oracle: await read(A.controller, abi.controller, 'oracle'),
  epochEnd: await read(A.controller, abi.controller, 'epochEnd'),
  epochCommitted: await read(A.controller, abi.controller, 'epochCommitted'),
  genesisYear1Used: await read(A.controller, abi.controller, 'genesisYear1Used'),
  standardYear1Used: await read(A.controller, abi.controller, 'standardYear1Used'),
  genesisCap: await read(A.controller, abi.controller, 'GENESIS_YEAR1_CAP'),
  standardCap: await read(A.controller, abi.controller, 'STANDARD_YEAR1_CAP'),
  totalCap: await read(A.controller, abi.controller, 'TOTAL_YEAR1_CAP'),
  epochSeconds: await read(A.controller, abi.controller, 'EPOCH'),
  genesisMaxSeconds: await read(A.controller, abi.controller, 'GENESIS_MAX_SECONDS'),
  emergencyMode: await read(A.controller, abi.controller, 'emergencyMode'),
  vaultPaused: await read(A.vault, abi.vault, 'paused'),
  vaultEpochEnd: await read(A.vault, abi.vault, 'currentEpochEnd'),
  vaultEpochCommitted: await read(A.vault, abi.vault, 'currentEpochCommitted'),
  treasuryObligations: await tryRead(() => read(A.treasury, abi.treasury, 'totalObligations'), null),
};
check(econ.treasuryFlow === parseEther('10000000'), 'R4 holds exactly 10,000,000 FLOW', formatEther(econ.treasuryFlow));
check(econ.treasuryObligations === 0n, 'R4 obligations == 0', String(econ.treasuryObligations));
check(econ.vaultPrincipal === 0n && econ.nextPositionId === 0n, 'R6 principal == 0 and no positions');
check(econ.maxFlowPerEpoch === parseEther('50000'), 'maxFlowPerEpoch == 50,000 FLOW', formatEther(econ.maxFlowPerEpoch));
check(econ.epochSeconds === 604800n, 'canonical EPOCH == 7 days', `${econ.epochSeconds}s`);
check(econ.genesisCap === parseEther('1000000') && econ.standardCap === parseEther('2000000') && econ.totalCap === parseEther('3000000'), 'Year-1 ceilings 1M/2M/3M unchanged');
check(econ.genesisYear1Used === 0n && econ.standardYear1Used === 0n, 'no Year-1 budget consumed');
check(getAddress(econ.oracle) === '0x0000000000000000000000000000000000000000' && econ.weeklyUsdBudget8 === 0n, 'oracle unset and dynamic USD path inactive');
check(econ.epochEnd === 0n && econ.epochCommitted === 0n && econ.vaultEpochCommitted === 0n, 'no live staking epoch');
check(!econ.vaultPaused && !econ.emergencyMode, 'exit safety: Vault unpaused, emergencyMode false');

const products = [];
for (let i = 0; i < 5; i++) {
  products.push({
    product: i,
    totalStaked: String(await read(A.vault, abi.vault, 'totalStakedByProduct', [i])),
    flowPerSecond: String(await read(A.vault, abi.vault, 'currentFlowPerSecond', [i])),
  });
}
check(products.every((p) => p.totalStaked === '0' && p.flowPerSecond === '0'), 'all five products zero-staked with 0 emission');

// --------------------------------------------------------- wiring transactions
const safeNonce = await tryRead(() => read(SAFES.governance, safeAbi, 'nonce'), null);
const safeThreshold = await tryRead(() => read(SAFES.governance, safeAbi, 'getThreshold'), null);

const calls = [
  {
    id: 'P3A.W1', label: 'VaultV2.grantRole(EPOCH_ROLE, Controller R5)', target: A.vault,
    abi: abi.vault, functionName: 'grantRole', args: [ROLE.epoch, A.controller],
    decoded: { role: `EPOCH_ROLE ${ROLE.epoch}`, account: A.controller },
    prerequisite: 'Vault EPOCH_ROLE unheld by Controller; Governance is role admin',
    expected: 'Vault.hasRole(EPOCH_ROLE, Controller) == true',
  },
  {
    id: 'P3A.W2', label: 'Controller.grantRole(PUBLISHER_ROLE, approved staking publisher)', target: A.controller,
    abi: abi.controller, functionName: 'grantRole', args: [ROLE.publisher, PUBLISHER],
    decoded: { role: `PUBLISHER_ROLE ${ROLE.publisher}`, account: PUBLISHER },
    prerequisite: 'Controller PUBLISHER_ROLE unheld by 0x05F7…aB22; Governance is role admin',
    expected: `Controller.hasRole(PUBLISHER_ROLE, ${PUBLISHER}) == true`,
  },
];

const prepared = [];
for (const c of calls) {
  const calldata = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args });
  let simulation = 'ok';
  let gasEstimate = null;
  try {
    await client.simulateContract({ address: c.target, abi: c.abi, functionName: c.functionName, args: c.args, account: SAFES.governance });
    gasEstimate = String(await client.estimateGas({ account: SAFES.governance, to: c.target, data: calldata, value: 0n }));
  } catch (e) {
    simulation = `revert :: ${String(e.shortMessage || e.message).slice(0, 160)}`;
    fail.push(`${c.id} simulation failed from Governance Safe`);
  }
  let unauthorized = 'reverts (as required)';
  try {
    await client.simulateContract({ address: c.target, abi: c.abi, functionName: c.functionName, args: c.args, account: SAFES.deployer });
    unauthorized = 'DID NOT REVERT';
    fail.push(`${c.id} unauthorized caller was accepted`);
  } catch { /* expected */ }
  console.log(`${simulation === 'ok' ? 'PASS' : 'FAIL'}  ${c.id} ${c.label} sim=${simulation} gas=${gasEstimate}`);
  prepared.push({
    id: c.id, label: c.label, target: c.target, functionName: c.functionName,
    args: c.args.map(String), decoded: c.decoded, prerequisite: c.prerequisite, expected: c.expected,
    selector: calldata.slice(0, 10), calldata, calldataKeccak: keccak256(calldata),
    simulation, gasEstimate, unauthorizedCaller: unauthorized,
    safeExecution: {
      callingSafe: SAFES.governance,
      safeNonceNow: String(safeNonce),
      requiredSafeNonce: safeNonce == null ? null : `${safeNonce} + queue index (W1 then W2)`,
      threshold: `${safeThreshold}-of-owners signatures required at execution time`,
      value: '0', operation: 'CALL (0)',
    },
  });
}

// ------------------------------------------------- Genesis epoch derivation
// Derived strictly from the verified deployed R5 ABI/source.
const controllerFns = abi.controller.filter((f) => f.type === 'function').map((f) => `${f.name}(${f.inputs.map((i) => i.type).join(',')})`);
const epochFns = controllerFns.filter((s) => /epoch/i.test(s));
const publisherGas = await tryRead(() => client.getBalance({ address: PUBLISHER }), null);

const genesisPrep = {
  status: 'BLOCKED',
  publisher: PUBLISHER,
  publisherNativeBot: publisherGas == null ? null : formatEther(publisherGas),
  epochRelatedFunctions: epochFns,
  onlyEpochPublishFunction: 'publishEpoch(uint8[] productIds, uint256[] flowPerSecond) onlyRole(PUBLISHER_ROLE)',
  enforcedEpochDuration: `${econ.epochSeconds}s (7 days, immutable constant EPOCH)`,
  findings: [
    'The deployed R5 exposes exactly one epoch-publishing entrypoint, publishEpoch(uint8[],uint256[]). It has no fixed-rate or Genesis mode argument.',
    'publishEpoch calls quoteEpochBudget() first, which reverts OracleNotConfigured() while oracle == address(0). The epoch path is therefore fail-closed and cannot be simulated, let alone published, without an oracle.',
    'publishEpoch consumes STANDARD Year-1 budget (_consumeStandard) — not Genesis. A Genesis-only epoch is not expressible through this function, so publishing it would activate standard-rate emissions, which P3A forbids.',
    'Genesis economics in the frozen design are per-position, not per-epoch: the Vault reserves Genesis APR at openPosition() via controller.tryConsumeGenesisBudget(), which is onlyVault and needs no epoch and no publisher.',
    'Every product currently has totalStaked == 0, so any published epoch would emit to zero stakers.',
  ],
  simulation: 'not attempted for a Genesis epoch — no ABI-derived Genesis epoch transaction exists to simulate',
  signed: false,
  broadcast: false,
};
blockers.push('GENESIS_EPOCH_NOT_EXPRESSIBLE: deployed R5 has no fixed-rate Genesis epoch function; publishEpoch is the oracle-gated STANDARD-rate path and reverts OracleNotConfigured() with oracle == address(0).');
if (!epochRoleToController) blockers.push('VAULT_EPOCH_ROLE_UNASSIGNED: requires Governance Safe execution of P3A.W1 (2-of-3 signatures) — this environment holds no Safe owner key.');
if (!publisherRoleToApproved) blockers.push('STAKING_PUBLISHER_UNASSIGNED: requires Governance Safe execution of P3A.W2 (2-of-3 signatures) — this environment holds no Safe owner key.');

const out = {
  gate: 'V30.2B_P3A_STAKING_PUBLISHER_WIRING_GENESIS_PREFLIGHT',
  mode: 'READ_ONLY_PREFLIGHT_AND_PREPARATION',
  generatedAt: new Date().toISOString(),
  chainId,
  blockNumber: String(block.number),
  blockTimestamp: String(block.timestamp),
  addresses: { ...A, ...SAFES, stakingPublisher: PUBLISHER },
  roleHashes: ROLE,
  bindings,
  authority,
  roleState: {
    epochRoleHolders: epochHolders,
    publisherRoleHolders: publisherHolders,
    epochRoleToController,
    publisherRoleToApprovedPublisher: publisherRoleToApproved,
  },
  economics: Object.fromEntries(Object.entries(econ).map(([k, v]) => [k, typeof v === 'bigint' ? String(v) : v])),
  products,
  governanceSafe: { address: SAFES.governance, nonce: String(safeNonce), threshold: String(safeThreshold) },
  wiringCalls: prepared,
  wiringExecution: {
    executed: false,
    reason: 'Governance Safe is multi-signature (2-of-3). No Safe owner key exists in this environment, so the two role grants cannot be signed or broadcast here; both are prepared and simulated only.',
    signed: 0, broadcast: 0, funded: 0,
  },
  genesisEpochPreparation: genesisPrep,
  preflight: fail.length === 0 ? 'PASS' : 'BLOCKED',
  failures: fail,
  blockingItems: blockers,
};
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(path.join(D, 'P3A_PREFLIGHT.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nP3A PREFLIGHT: ${out.preflight}`);
console.log(`failures: ${fail.length}`);
for (const b of blockers) console.log(`BLOCKER  ${b}`);
