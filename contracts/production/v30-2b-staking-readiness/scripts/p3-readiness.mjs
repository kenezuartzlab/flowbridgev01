// V30.2B P3 — Staking activation readiness. READ-ONLY / PREPARATION ONLY.
//
// Reconfirms the R4/R5/R6 staking stack on BOT Mainnet 677, reconciles
// inventory and obligations, re-checks year-1 ceilings, the 50,000 FLOW / 7-day
// epoch cap, oracle absence, the five products, safety roles and exit safety.
// Never signs. Never broadcasts. Never funds. Never assigns a publisher.
// Never writes an oracle. Never activates staking.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, getAddress, formatEther, parseEther } from 'viem';

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
  treasurySafe: getAddress('0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4'),
  governance: getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507'),
  operations: getAddress('0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF'),
  deployer: getAddress('0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD'),
};
const abi = {
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const client = createPublicClient({ transport: http(RPC) });
const fail = [];
const blockers = [];
const check = (ok, label, detail) => {
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const read = (address, a, functionName, args = []) => client.readContract({ address, abi: a, functionName, args });
const safe = async (fn, fallback = null) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const chainId = await client.getChainId();
const blockNumber = await client.getBlockNumber();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);

// --------------------------------------------------------------- canonical code
for (const [k, v] of Object.entries(A)) {
  const code = (await client.getCode({ address: v })) ?? '0x';
  check(code.length > 2, `${k} has deployed code`, `${v} ${code.length / 2 - 1} bytes`);
}

// ------------------------------------------------------------------- bindings
const bind = {
  treasuryToken: getAddress(await read(A.treasury, abi.treasury, 'token')),
  vaultToken: getAddress(await read(A.vault, abi.vault, 'token')),
  vaultController: getAddress(await read(A.vault, abi.vault, 'controller')),
  vaultTreasury: getAddress(await read(A.vault, abi.vault, 'treasury')),
  controllerVault: getAddress(await read(A.controller, abi.controller, 'vault')),
};
check(bind.treasuryToken === A.flow, 'Treasury.token == canonical FLOW');
check(bind.vaultToken === A.flow, 'Vault.token == canonical FLOW');
check(bind.vaultController === A.controller, 'Vault.controller == R5 Controller');
check(bind.vaultTreasury === A.treasury, 'Vault.treasury == R4 Treasury');
check(bind.controllerVault === A.vault, 'Controller.vault == R6 Vault');

// ------------------------------------------------------- inventory/obligations
const inv = {
  treasuryFlow: await read(A.flow, erc20, 'balanceOf', [A.treasury]),
  treasuryFree: await read(A.treasury, abi.treasury, 'freeBalance'),
  treasuryObligations: await read(A.treasury, abi.treasury, 'totalObligations'),
  reservedGenesis: await read(A.treasury, abi.treasury, 'reservedGenesis'),
  reservedFloors: await read(A.treasury, abi.treasury, 'reservedFloors'),
  committedEpoch: await read(A.treasury, abi.treasury, 'committedEpoch'),
  accruedUnclaimed: await read(A.treasury, abi.treasury, 'accruedUnclaimed'),
  vaultFlow: await read(A.flow, erc20, 'balanceOf', [A.vault]),
  vaultPrincipal: await read(A.vault, abi.vault, 'totalPrincipal'),
  vaultNextPositionId: await read(A.vault, abi.vault, 'nextPositionId'),
  treasurySafeFlow: await read(A.flow, erc20, 'balanceOf', [SAFES.treasurySafe]),
};
const TEN_M = parseEther('10000000');
check(inv.treasuryFlow === TEN_M, 'Treasury inventory == 10,000,000 FLOW', formatEther(inv.treasuryFlow));
check(inv.treasuryObligations === 0n, 'no outstanding treasury obligations', formatEther(inv.treasuryObligations));
check(inv.accruedUnclaimed === 0n, 'no accrued unclaimed rewards');
check(inv.committedEpoch === 0n, 'no epoch commitment outstanding');
check(inv.treasuryFree === inv.treasuryFlow - inv.treasuryObligations, 'free balance reconciles with inventory − obligations', formatEther(inv.treasuryFree));
check(inv.vaultPrincipal === 0n, 'Vault principal == 0 before activation', formatEther(inv.vaultPrincipal));
check(inv.vaultFlow === 0n, 'Vault holds no FLOW before activation', formatEther(inv.vaultFlow));

// ---------------------------------------------------------------- caps/ceilings
const caps = {
  maxFlowPerEpoch: await read(A.controller, abi.controller, 'maxFlowPerEpoch'),
  weeklyUsdBudget8: await read(A.controller, abi.controller, 'weeklyUsdBudget8'),
  oracle: getAddress(await read(A.controller, abi.controller, 'oracle')),
  epochCommitted: await read(A.controller, abi.controller, 'epochCommitted'),
  epochEnd: await read(A.controller, abi.controller, 'epochEnd'),
  genesisYear1Used: await read(A.controller, abi.controller, 'genesisYear1Used'),
  standardYear1Used: await read(A.controller, abi.controller, 'standardYear1Used'),
  emergencyMode: await read(A.controller, abi.controller, 'emergencyMode'),
  genesisYear1Cap: await safe(() => read(A.controller, abi.controller, 'GENESIS_YEAR1_CAP')),
  standardYear1Cap: await safe(() => read(A.controller, abi.controller, 'STANDARD_YEAR1_CAP')),
  epochDuration: await safe(() => read(A.controller, abi.controller, 'EPOCH_DURATION')),
};
check(caps.maxFlowPerEpoch === parseEther('50000'), 'maxFlowPerEpoch == 50,000 FLOW', formatEther(caps.maxFlowPerEpoch));
if (caps.epochDuration != null) check(Number(caps.epochDuration) === 604800, 'epoch duration == 7 days', String(caps.epochDuration));
if (caps.genesisYear1Cap != null) check(caps.genesisYear1Cap <= parseEther('1000000'), 'Genesis year-1 ceiling <= 1,000,000 FLOW', formatEther(caps.genesisYear1Cap));
if (caps.standardYear1Cap != null) check(caps.standardYear1Cap <= parseEther('2000000'), 'Standard year-1 ceiling <= 2,000,000 FLOW', formatEther(caps.standardYear1Cap));
check(caps.genesisYear1Used === 0n && caps.standardYear1Used === 0n, 'no year-1 emission consumed yet');
check(caps.epochCommitted === 0n, 'no staking epoch committed');

// ------------------------------------------------------------- oracle/dynamic
const oracleUnset = caps.oracle === '0x0000000000000000000000000000000000000000';
check(oracleUnset, 'oracle remains UNSET (PENDING_POOL)', caps.oracle);
check(caps.weeklyUsdBudget8 === 0n, 'weeklyUsdBudget8 == 0 — dynamic staking disabled', String(caps.weeklyUsdBudget8));
if (oracleUnset) blockers.push('ORACLE_UNSET_PENDING_POOL: no FLOW/USD liquidity reference exists on chain 677, so the dynamic (USD-budgeted) staking path must stay disabled and fail closed. No oracle may be invented or substituted.');

// -------------------------------------------------------------------- products
const products = [];
for (const p of [0, 1, 2, 3, 4]) {
  products.push({
    product: p,
    totalStaked: (await read(A.vault, abi.vault, 'totalStakedByProduct', [p])).toString(),
    flowPerSecond: (await read(A.vault, abi.vault, 'currentFlowPerSecond', [p])).toString(),
  });
}
check(products.every((p) => p.totalStaked === '0'), 'all five products carry zero stake');
check(products.every((p) => p.flowPerSecond === '0'), 'all five product emission rates are 0 (no live APR)');

// ---------------------------------------------------------------- safety roles
const roles = {
  treasuryVault: await read(A.treasury, abi.treasury, 'VAULT_ROLE'),
  treasuryController: await read(A.treasury, abi.treasury, 'CONTROLLER_ROLE'),
  treasuryAdmin: await read(A.treasury, abi.treasury, 'DEFAULT_ADMIN_ROLE'),
  ctrlGovernor: await read(A.controller, abi.controller, 'GOVERNOR_ROLE'),
  ctrlPublisher: await read(A.controller, abi.controller, 'PUBLISHER_ROLE'),
  ctrlAdmin: await read(A.controller, abi.controller, 'DEFAULT_ADMIN_ROLE'),
  vaultAdmin: await read(A.vault, abi.vault, 'DEFAULT_ADMIN_ROLE'),
  vaultPauser: await read(A.vault, abi.vault, 'PAUSER_ROLE'),
  vaultEpoch: await read(A.vault, abi.vault, 'EPOCH_ROLE'),
};
const has = (c, a, r, who) => read(c, a, 'hasRole', [r, who]);
check(await has(A.treasury, abi.treasury, roles.treasuryVault, A.vault), 'Treasury VAULT_ROLE held by Vault');
check(await has(A.treasury, abi.treasury, roles.treasuryController, A.controller), 'Treasury CONTROLLER_ROLE held by Controller');
check(await has(A.treasury, abi.treasury, roles.treasuryAdmin, SAFES.governance), 'Treasury admin == Governance Safe');
check(await has(A.controller, abi.controller, roles.ctrlGovernor, SAFES.governance), 'Controller GOVERNOR_ROLE == Governance Safe');
check(await has(A.controller, abi.controller, roles.ctrlAdmin, SAFES.governance), 'Controller admin == Governance Safe');
check(await has(A.vault, abi.vault, roles.vaultAdmin, SAFES.governance), 'Vault admin == Governance Safe');
check(await has(A.vault, abi.vault, roles.vaultPauser, SAFES.governance), 'Vault PAUSER_ROLE == Governance Safe');
check(await has(A.vault, abi.vault, roles.vaultPauser, SAFES.operations), 'Vault PAUSER_ROLE also with Operations Safe');
check(await has(A.vault, abi.vault, roles.vaultEpoch, A.controller), 'Vault EPOCH_ROLE held by Controller');

const publisherHolders = [];
for (const [name, who] of Object.entries({ ...SAFES, vault: A.vault, controller: A.controller })) {
  if (await has(A.controller, abi.controller, roles.ctrlPublisher, who)) publisherHolders.push(name);
}
check(publisherHolders.length === 0, 'Controller PUBLISHER_ROLE remains unassigned', publisherHolders.join(',') || 'none');
if (publisherHolders.length === 0) blockers.push('STAKING_PUBLISHER_UNASSIGNED: no address holds Controller PUBLISHER_ROLE, so no staking epoch can be published. Assignment is an authorized governance write and is NOT performed by this gate.');

const deployerAuthority = [];
for (const [label, c, a, r] of [
  ['treasury.admin', A.treasury, abi.treasury, roles.treasuryAdmin],
  ['controller.admin', A.controller, abi.controller, roles.ctrlAdmin],
  ['controller.governor', A.controller, abi.controller, roles.ctrlGovernor],
  ['controller.publisher', A.controller, abi.controller, roles.ctrlPublisher],
  ['vault.admin', A.vault, abi.vault, roles.vaultAdmin],
  ['vault.pauser', A.vault, abi.vault, roles.vaultPauser],
]) {
  if (await has(c, a, r, SAFES.deployer)) deployerAuthority.push(label);
}
check(deployerAuthority.length === 0, 'deployer EOA has no staking authority', deployerAuthority.join(',') || 'none');

// ------------------------------------------------------------------ exit safety
const paused = { vault: await read(A.vault, abi.vault, 'paused'), emergencyMode: caps.emergencyMode };
check(!paused.vault, 'Vault not paused', String(paused.vault));
check(paused.emergencyMode === false, 'Controller emergencyMode false');

const activationReady = fail.length === 0 && blockers.length === 0;
const evidence = {
  gate: 'V30.2B_P3_STAKING_ACTIVATION_READINESS',
  mode: 'READ_ONLY_PREPARATION',
  generatedAt: new Date().toISOString(),
  chainId,
  blockNumber: blockNumber.toString(),
  addresses: A,
  bindings: bind,
  inventory: Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v.toString()])),
  caps: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])),
  products,
  publisherHolders,
  deployerAuthority,
  pauseState: paused,
  writes: { signed: 0, broadcast: 0, funded: 0, oracleWrites: 0, publisherAssignments: 0, epochPublications: 0 },
  result: activationReady ? 'STAKING_ACTIVATION_READY' : 'STAKING_ACTIVATION_BLOCKED',
  stateFailures: fail,
  blockingItems: blockers,
  nextAuthorizedTransactionPlan: activationReady
    ? null
    : {
        note: 'NOT EXECUTED IN THIS GATE. Minimal fixed-rate / Genesis-only activation path, if separately authorized.',
        steps: [
          'Governance Safe: grantRole(PUBLISHER_ROLE, <approved publisher>) on Controller 0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF',
          'Publisher: commit a fixed-rate Genesis epoch <= 50,000 FLOW for 7 days, within the 1,000,000 FLOW Genesis year-1 ceiling',
          'Leave oracle unset and weeklyUsdBudget8 == 0 so the dynamic USD-budgeted path stays disabled',
        ],
        prerequisitesProven: false,
      },
};
fs.writeFileSync(path.join(D, 'P3_STAKING_READINESS.json'), JSON.stringify(evidence, null, 2));
console.log(`\n${evidence.result}`);
if (fail.length) console.log(`STATE FAILURES:\n- ${fail.join('\n- ')}`);
if (blockers.length) console.log(`BLOCKING ITEMS:\n- ${blockers.join('\n- ')}`);
process.exit(fail.length ? 1 : 0);
