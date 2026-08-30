// V30.2B W1 — Staking governance wiring preflight. READ-ONLY.
//
// Derives selectors and role hashes from the verified deployed ABIs, builds the
// five Governance Safe calls, simulates each with eth_call from the authorized
// Safe, estimates gas, and proves the preserved-state invariants.
// Never signs, never broadcasts, never funds, never grants anything.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  keccak256,
  toHex,
  parseEther,
  formatEther,
  getAddress,
} from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  treasury: getAddress('0x96552909998F3DbAf5Ff4979dc158508b3442e65'),
  controller: getAddress('0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF'),
  vault: getAddress('0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D'),
  governance: getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507'),
  operations: getAddress('0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF'),
  deployer: getAddress('0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD'),
};

const abi = {
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
];
const safeAbi = [{ type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }];

const client = createPublicClient({ transport: http(RPC) });
const fail = [];
const check = (ok, label, detail) => {
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const read = (address, a, functionName, args = []) =>
  client.readContract({ address, abi: a, functionName, args });

// ---------------------------------------------------------------- chain state
const chainId = await client.getChainId();
const blockNumber = await client.getBlockNumber();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);

for (const [k, v] of Object.entries({ flow: A.flow, treasury: A.treasury, controller: A.controller, vault: A.vault })) {
  const code = (await client.getCode({ address: v })) ?? '0x';
  check(code.length > 2, `${k} has deployed code`, `${v} ${code.length / 2 - 1} bytes`);
}

// -------------------------------------------------- role hashes from live ABIs
const roles = {
  treasuryVault: await read(A.treasury, abi.treasury, 'VAULT_ROLE'),
  treasuryController: await read(A.treasury, abi.treasury, 'CONTROLLER_ROLE'),
  treasuryAdmin: await read(A.treasury, abi.treasury, 'DEFAULT_ADMIN_ROLE'),
  vaultPauser: await read(A.vault, abi.vault, 'PAUSER_ROLE'),
  vaultAdmin: await read(A.vault, abi.vault, 'DEFAULT_ADMIN_ROLE'),
  controllerGovernor: await read(A.controller, abi.controller, 'GOVERNOR_ROLE'),
  controllerPublisher: await read(A.controller, abi.controller, 'PUBLISHER_ROLE'),
  controllerAdmin: await read(A.controller, abi.controller, 'DEFAULT_ADMIN_ROLE'),
};
check(roles.treasuryVault === keccak256(toHex('VAULT_ROLE')), 'Treasury VAULT_ROLE == keccak("VAULT_ROLE")', roles.treasuryVault);
check(roles.treasuryController === keccak256(toHex('CONTROLLER_ROLE')), 'Treasury CONTROLLER_ROLE == keccak("CONTROLLER_ROLE")', roles.treasuryController);
check(roles.vaultPauser === keccak256(toHex('PAUSER_ROLE')), 'Vault PAUSER_ROLE == keccak("PAUSER_ROLE")', roles.vaultPauser);

// ------------------------------------------------------------ current pre-state
const decimals = await read(A.flow, erc20, 'decimals');
check(Number(decimals) === 18, 'FLOW uses 18 decimals', String(decimals));

const pre = {
  controllerVault: await read(A.controller, abi.controller, 'vault'),
  maxFlowPerEpoch: await read(A.controller, abi.controller, 'maxFlowPerEpoch'),
  weeklyUsdBudget8: await read(A.controller, abi.controller, 'weeklyUsdBudget8'),
  oracle: await read(A.controller, abi.controller, 'oracle'),
  epochCommitted: await read(A.controller, abi.controller, 'epochCommitted'),
  epochEnd: await read(A.controller, abi.controller, 'epochEnd'),
  govGovernor: await read(A.controller, abi.controller, 'hasRole', [roles.controllerGovernor, A.governance]),
  govControllerAdmin: await read(A.controller, abi.controller, 'hasRole', [roles.controllerAdmin, A.governance]),
  publisherGov: await read(A.controller, abi.controller, 'hasRole', [roles.controllerPublisher, A.governance]),
  publisherOps: await read(A.controller, abi.controller, 'hasRole', [roles.controllerPublisher, A.operations]),
  publisherDeployer: await read(A.controller, abi.controller, 'hasRole', [roles.controllerPublisher, A.deployer]),
  publisherVault: await read(A.controller, abi.controller, 'hasRole', [roles.controllerPublisher, A.vault]),
  treasuryVaultToVault: await read(A.treasury, abi.treasury, 'hasRole', [roles.treasuryVault, A.vault]),
  treasuryCtrlToCtrl: await read(A.treasury, abi.treasury, 'hasRole', [roles.treasuryController, A.controller]),
  treasuryAdminGov: await read(A.treasury, abi.treasury, 'hasRole', [roles.treasuryAdmin, A.governance]),
  treasuryToken: await read(A.treasury, abi.treasury, 'token'),
  treasuryBalance: await read(A.flow, erc20, 'balanceOf', [A.treasury]),
  treasuryObligations: await read(A.treasury, abi.treasury, 'totalObligations'),
  treasuryAccrued: await read(A.treasury, abi.treasury, 'accruedUnclaimed'),
  treasuryCommittedEpoch: await read(A.treasury, abi.treasury, 'committedEpoch'),
  vaultAdminGov: await read(A.vault, abi.vault, 'hasRole', [roles.vaultAdmin, A.governance]),
  vaultPauserGov: await read(A.vault, abi.vault, 'hasRole', [roles.vaultPauser, A.governance]),
  vaultPauserOps: await read(A.vault, abi.vault, 'hasRole', [roles.vaultPauser, A.operations]),
  vaultController: await read(A.vault, abi.vault, 'controller'),
  vaultTreasury: await read(A.vault, abi.vault, 'treasury'),
  vaultToken: await read(A.vault, abi.vault, 'token'),
  vaultPrincipal: await read(A.vault, abi.vault, 'totalPrincipal'),
  vaultNextPositionId: await read(A.vault, abi.vault, 'nextPositionId'),
  vaultBalance: await read(A.flow, erc20, 'balanceOf', [A.vault]),
  governanceSafeNonce: await read(A.governance, safeAbi, 'nonce'),
};

check(pre.controllerVault === '0x0000000000000000000000000000000000000000', 'prereq: Controller.vault currently unset', pre.controllerVault);
check(pre.maxFlowPerEpoch === 0n, 'prereq: maxFlowPerEpoch == 0', String(pre.maxFlowPerEpoch));
check(pre.weeklyUsdBudget8 === 0n, 'prereq: weeklyUsdBudget8 == 0', String(pre.weeklyUsdBudget8));
check(pre.oracle === '0x0000000000000000000000000000000000000000', 'prereq: oracle unset');
check(pre.govGovernor === true, 'authority: Governance holds Controller GOVERNOR_ROLE');
check(pre.treasuryAdminGov === true, 'authority: Governance holds Treasury DEFAULT_ADMIN_ROLE');
check(pre.vaultAdminGov === true, 'authority: Governance holds Vault DEFAULT_ADMIN_ROLE');
check(pre.vaultPauserGov === true, 'preserve: Governance already holds Vault PAUSER_ROLE');
check(pre.treasuryVaultToVault === false, 'prereq: Treasury VAULT_ROLE not yet granted');
check(pre.treasuryCtrlToCtrl === false, 'prereq: Treasury CONTROLLER_ROLE not yet granted');
check(pre.vaultPauserOps === false, 'prereq: Operations has no Vault PAUSER_ROLE yet');
check(pre.treasuryToken === A.flow, 'binding: Treasury.token == FLOW');
check(pre.vaultToken === A.flow, 'binding: Vault.token == FLOW');
check(pre.vaultController === A.controller, 'binding: Vault.controller == Controller');
check(pre.vaultTreasury === A.treasury, 'binding: Vault.treasury == Treasury');
check(pre.treasuryBalance === 0n, 'preserve: Treasury FLOW balance == 0');
check(pre.treasuryObligations === 0n, 'preserve: Treasury obligations == 0');
check(pre.treasuryAccrued === 0n, 'preserve: Treasury accruedUnclaimed == 0');
check(pre.vaultPrincipal === 0n, 'preserve: Vault totalPrincipal == 0');
check(pre.vaultNextPositionId === 0n, 'preserve: Vault has no positions');
check(pre.vaultBalance === 0n, 'preserve: Vault FLOW balance == 0');
check(pre.epochCommitted === 0n && pre.epochEnd === 0n, 'preserve: no committed epoch on Controller', `epochCommitted=${pre.epochCommitted} epochEnd=${pre.epochEnd}`);
check(!pre.publisherGov && !pre.publisherOps && !pre.publisherDeployer && !pre.publisherVault, 'preserve: PUBLISHER_ROLE unassigned to all known parties');

// ------------------------------------------------------------------ the 5 calls
const CEILING = parseEther('50000'); // exact 18-decimal units of the FLOW token
check(CEILING === 50000000000000000000000n, 'ceiling encodes to 50,000e18', `${CEILING} (${formatEther(CEILING)} FLOW)`);

const calls = [
  {
    id: 'W1.1',
    label: 'Controller.setVault(Vault V2)',
    target: A.controller,
    abi: abi.controller,
    functionName: 'setVault',
    args: [A.vault],
    decoded: { vault_: A.vault },
    authority: `Governance Safe ${A.governance} (Controller GOVERNOR_ROLE)`,
    prerequisite: 'Controller.vault == address(0); Governance holds GOVERNOR_ROLE',
    expected: `Controller.vault == ${A.vault}`,
  },
  {
    id: 'W1.2',
    label: 'RewardTreasury.grantRole(VAULT_ROLE, Vault V2)',
    target: A.treasury,
    abi: abi.treasury,
    functionName: 'grantRole',
    args: [roles.treasuryVault, A.vault],
    decoded: { role: `VAULT_ROLE ${roles.treasuryVault}`, account: A.vault },
    authority: `Governance Safe ${A.governance} (Treasury DEFAULT_ADMIN_ROLE)`,
    prerequisite: 'Treasury VAULT_ROLE not held by Vault; Governance is role admin',
    expected: 'Treasury.hasRole(VAULT_ROLE, Vault V2) == true',
  },
  {
    id: 'W1.3',
    label: 'RewardTreasury.grantRole(CONTROLLER_ROLE, Controller)',
    target: A.treasury,
    abi: abi.treasury,
    functionName: 'grantRole',
    args: [roles.treasuryController, A.controller],
    decoded: { role: `CONTROLLER_ROLE ${roles.treasuryController}`, account: A.controller },
    authority: `Governance Safe ${A.governance} (Treasury DEFAULT_ADMIN_ROLE)`,
    prerequisite: 'Treasury CONTROLLER_ROLE not held by Controller; Governance is role admin',
    expected: 'Treasury.hasRole(CONTROLLER_ROLE, Controller) == true',
  },
  {
    id: 'W1.4',
    label: 'VaultV2.grantRole(PAUSER_ROLE, Operations Safe)',
    target: A.vault,
    abi: abi.vault,
    functionName: 'grantRole',
    args: [roles.vaultPauser, A.operations],
    decoded: { role: `PAUSER_ROLE ${roles.vaultPauser}`, account: A.operations },
    authority: `Governance Safe ${A.governance} (Vault DEFAULT_ADMIN_ROLE)`,
    prerequisite: 'Operations lacks PAUSER_ROLE; Governance is role admin and keeps its own PAUSER_ROLE',
    expected: 'Vault.hasRole(PAUSER_ROLE, Operations) == true; Governance pauser + admin unchanged',
  },
  {
    id: 'W1.5',
    label: 'Controller.setBudgets(weeklyUsdBudget8 = 0, maxFlowPerEpoch = 50,000e18)',
    target: A.controller,
    abi: abi.controller,
    functionName: 'setBudgets',
    args: [0n, CEILING],
    decoded: { weeklyUsdBudget8_: '0', maxFlowPerEpoch_: `${CEILING} (50000 FLOW, 18dp)` },
    authority: `Governance Safe ${A.governance} (Controller GOVERNOR_ROLE)`,
    prerequisite: 'maxFlowPerEpoch == 0 and weeklyUsdBudget8 == 0',
    expected: `maxFlowPerEpoch == ${CEILING}; weeklyUsdBudget8 stays 0; no epoch published`,
  },
];

const report = [];
for (const c of calls) {
  const data = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args });
  const selector = data.slice(0, 10);
  const calldataKeccak = keccak256(data);
  let sim = 'ok';
  let gas = null;
  try {
    await client.call({ account: A.governance, to: c.target, data });
  } catch (e) {
    sim = `REVERT: ${String(e.shortMessage || e.message).split('\n')[0]}`;
  }
  try {
    gas = await client.estimateGas({ account: A.governance, to: c.target, data });
  } catch (e) {
    gas = null;
    if (sim === 'ok') sim = `GAS_ESTIMATE_FAILED: ${String(e.shortMessage || e.message).split('\n')[0]}`;
  }
  // negative control: unauthorized caller must revert
  let unauthorized = 'unexpectedly succeeded';
  try {
    await client.call({ account: A.deployer, to: c.target, data });
  } catch {
    unauthorized = 'reverts (as required)';
  }
  check(sim === 'ok', `${c.id} eth_call from Governance Safe succeeds`, sim);
  check(unauthorized === 'reverts (as required)', `${c.id} rejects unauthorized deployer caller`, unauthorized);
  report.push({
    ...c,
    abi: undefined,
    args: c.args.map(String),
    selector,
    calldata: data,
    calldataKeccak,
    simulation: sim,
    gasEstimate: gas === null ? null : String(gas),
    unauthorizedCaller: unauthorized,
    safeExecution: {
      callingSafe: A.governance,
      safeNonceNow: String(pre.governanceSafeNonce),
      requiredSafeNonce: `${pre.governanceSafeNonce} + queue index (sequential 0..4 as ordered)`,
      threshold: '2-of-3 owner signatures required at execution time',
      value: '0',
      operation: 'CALL (0)',
    },
  });
}

// ------------------------------------------- post-sequence expectations (proof)
const postExpectations = {
  'Controller.vault': A.vault,
  'Treasury VAULT_ROLE holder': A.vault,
  'Treasury CONTROLLER_ROLE holder': A.controller,
  'Vault PAUSER_ROLE holders': [A.governance, A.operations],
  'Vault DEFAULT_ADMIN_ROLE': A.governance,
  'Controller.maxFlowPerEpoch': `${CEILING} (50,000 FLOW)`,
  'Controller.weeklyUsdBudget8': '0',
  'Controller.oracle': '0x0000000000000000000000000000000000000000',
  'Controller PUBLISHER_ROLE': 'unassigned',
  'Treasury FLOW balance / obligations': '0 / 0',
  'Vault positions / principal': '0 / 0',
  'Active staking epoch or rewards': 'none — publishEpoch/commitEpoch not called by any W1 call',
};
const touchesForbidden = calls.some((c) => ![A.controller, A.treasury, A.vault].includes(c.target));
check(!touchesForbidden, 'scope: only Controller, Treasury and Vault are targeted');
check(
  calls.every((c) => !['publishEpoch', 'commitEpoch', 'setOracle', 'deposit', 'accrueFromCommitted'].includes(c.functionName)),
  'scope: no epoch, oracle, publisher, or funding call in the set',
);

const out = {
  gate: 'V30.2B W1 — Staking Governance Wiring Preflight',
  mode: 'READ-ONLY — no signature, no broadcast, no funding',
  generatedAt: new Date().toISOString(),
  chain: { chainId, blockNumber: String(blockNumber), rpcHost: new URL(RPC).host },
  addresses: A,
  roleHashes: roles,
  currentState: Object.fromEntries(Object.entries(pre).map(([k, v]) => [k, typeof v === 'bigint' ? String(v) : v])),
  ceiling: { human: '50,000 FLOW', decimals: 18, encoded: String(CEILING) },
  calls: report,
  postSequenceExpectations: postExpectations,
  verdict: fail.length === 0 ? 'V30.2B W1 GOVERNANCE WIRING PREFLIGHT PASS' : 'FAIL',
  failures: fail,
};
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(path.join(D, 'W1_PREFLIGHT.json'), `${JSON.stringify(out, null, 2)}\n`);
fs.writeFileSync(
  path.join(P, 'V30_2B_W1_WIRING_PREFLIGHT.json'),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(`\nsha256(W1_PREFLIGHT.json)=${createHash('sha256').update(fs.readFileSync(path.join(D, 'W1_PREFLIGHT.json'))).digest('hex')}`);
console.log(`\n${out.verdict}`);
if (fail.length) {
  console.log(fail.join('\n'));
  process.exit(1);
}
