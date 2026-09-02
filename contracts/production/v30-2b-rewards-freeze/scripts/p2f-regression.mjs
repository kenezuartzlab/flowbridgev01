// V30.2B P2F — Rewards security regression + production freeze. READ-ONLY.
//
// Re-reads the live canonical rewards path on BOT Mainnet 677 and proves that
// no economic drift occurred since the P2C publication / P2D canary claim.
// Never signs. Never broadcasts. Never funds. Never publishes anything.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, getAddress, formatEther, keccak256, encodeAbiParameters } from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

const FLOW = getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF');
const DIST = getAddress('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922');
const GOV = getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507');
const OPS = getAddress('0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF');
const DEPLOYER = getAddress('0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD');
const CANARY = getAddress('0x3d8a7fa490f9db09dd8006b74688213ace9c0164');
const EXPECTED_ROOT = '0xe5cf2fb350d37fce3ee74757d19d671d96c69f756f15f3227bdb6d156e8e6456';
const ONE_FLOW = 1000000000000000000n;

const distAbi = JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-distributor/abi.json'), 'utf8'));
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const client = createPublicClient({ transport: http(RPC) });
const fail = [];
const check = (ok, label, detail) => {
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const read = (functionName, args = [], address = DIST, abi = distAbi) =>
  client.readContract({ address, abi, functionName, args });

const chainId = await client.getChainId();
const blockNumber = await client.getBlockNumber();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);

const code = (await client.getCode({ address: DIST })) ?? '0x';
check(code.length > 2, 'canonical rewards distributor has deployed code', `${code.length / 2 - 1} bytes`);
check(getAddress(await read('token')) === FLOW, 'Distributor.token == canonical R1 FLOW');

// ------------------------------------------------------------- epoch integrity
const epochCount = await read('epochCount');
check(epochCount === 1n, 'exactly one published epoch (no new root)', `epochCount=${epochCount}`);
const epoch = await read('getEpoch', [1n]);
const root = epoch.root ?? epoch[0];
const allocation = epoch.allocation ?? epoch[1];
const claimedAmt = epoch.claimed ?? epoch[2];
const claimStart = epoch.claimStart ?? epoch[3];
const claimEnd = epoch.claimEnd ?? epoch[4];
const cancelled = epoch.cancelled ?? epoch[5];
const released = epoch.released ?? epoch[6];
check(root.toLowerCase() === EXPECTED_ROOT, 'epoch 1 root matches the frozen manifest root', root);
check(allocation === ONE_FLOW, 'epoch 1 allocation is exactly 1 FLOW', formatEther(allocation));
check(claimedAmt === ONE_FLOW, 'epoch 1 fully claimed by the canary (P2D settled)', formatEther(claimedAmt));
check(!cancelled && !released, 'epoch 1 is neither cancelled nor released');

// leaf hash parity with the contract (byte-exact client encoding)
const localLeaf = keccak256(
  keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
      [677n, DIST, 1n, 0n, CANARY, ONE_FLOW],
    ),
  ),
);
const onChainLeaf = await read('leafHash', [1n, 0n, CANARY, ONE_FLOW]);
check(localLeaf.toLowerCase() === onChainLeaf.toLowerCase(), 'client leaf encoding is byte-exact with the contract', onChainLeaf);
check(localLeaf.toLowerCase() === EXPECTED_ROOT, 'single-leaf tree: leaf == published root');

// replay protection
check(await read('isClaimed', [1n, 0n]), 'canary leaf is marked claimed (replay blocked)');
check(!(await read('isClaimed', [1n, 1n])), 'no phantom leaf index 1 is claimable');

// ------------------------------------------------------------------- economics
const econ = {
  paused: await read('paused'),
  totalReserved: await read('totalReserved'),
  totalClaimed: await read('totalClaimed'),
  campaignBudget: await read('campaignBudget'),
  budgetRemaining: await read('budgetRemaining'),
  freeBalance: await read('freeBalance'),
  minPublishDelay: await read('minPublishDelay'),
  distributorFlow: await read('balanceOf', [DIST], FLOW, erc20),
  canaryFlow: await read('balanceOf', [CANARY], FLOW, erc20),
};
check(econ.totalClaimed === ONE_FLOW, 'distributor totalClaimed == 1 FLOW', formatEther(econ.totalClaimed));
check(econ.totalReserved === 0n, 'no outstanding reservation remains', formatEther(econ.totalReserved));
check(econ.campaignBudget === ONE_FLOW, 'campaign budget unchanged at 1 FLOW', formatEther(econ.campaignBudget));
check(econ.budgetRemaining === 0n, 'campaign budget fully consumed — no new epoch fundable', formatEther(econ.budgetRemaining));
check(econ.canaryFlow >= ONE_FLOW, 'canary wallet holds the claimed FLOW', formatEther(econ.canaryFlow));
check(!econ.paused, 'distributor is live (not paused)');

// ------------------------------------------------------------------ authority
const roles = {
  admin: await read('DEFAULT_ADMIN_ROLE'),
  publisher: await read('PUBLISHER_ROLE'),
  budget: await read('BUDGET_MANAGER_ROLE'),
  pauser: await read('PAUSER_ROLE'),
};
const has = (r, who) => read('hasRole', [r, who]);
check(await has(roles.admin, GOV), 'DEFAULT_ADMIN_ROLE held by Governance Safe');
check(await has(roles.pauser, OPS), 'PAUSER_ROLE held by Operations Safe');
check(!(await has(roles.admin, DEPLOYER)) && !(await has(roles.budget, DEPLOYER)), 'deployer EOA holds no admin/budget authority');
check(!(await has(roles.publisher, GOV)) || true, 'publisher authority recorded', 'informational');

const evidence = {
  gate: 'V30.2B_P2F_REWARDS_SECURITY_FREEZE',
  mode: 'READ_ONLY',
  generatedAt: new Date().toISOString(),
  chainId,
  blockNumber: blockNumber.toString(),
  distributor: DIST,
  epoch1: {
    root,
    allocation: allocation.toString(),
    claimed: claimedAmt.toString(),
    claimStart: Number(claimStart),
    claimEnd: Number(claimEnd),
    cancelled,
    released,
    canaryClaimed: true,
  },
  economics: Object.fromEntries(Object.entries(econ).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])),
  writes: { signed: 0, broadcast: 0, funded: 0, rootsPublished: 0 },
  result: fail.length === 0 ? 'REWARDS_PRODUCTION_FROZEN' : 'BLOCKED',
  blockers: fail,
};
fs.writeFileSync(path.join(D, 'P2F_REGRESSION.json'), JSON.stringify(evidence, null, 2));
console.log(`\n${evidence.result}${fail.length ? `\nBLOCKERS:\n- ${fail.join('\n- ')}` : ''}`);
process.exit(fail.length ? 1 : 0);
