// V30.2B P3D — 30D (productId 1) mainnet canary pre-signing gate.
// READ-ONLY. Nothing is signed or broadcast: TX1/TX2 are user-signed by the
// canary wallet through the production UI.
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
const PUBLISHER = getAddress('0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22');
const CANARY = getAddress('0x3d8a7fa490f9db09dd8006b74688213ace9c0164');
const PRINCIPAL = parseEther('1');
const PRODUCT_ID = 1;

const abi = {
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const client = createPublicClient({ transport: http(RPC) });
const checks = [];
const fail = [];
const check = (ok, label, detail) => {
  checks.push({ ok, label, detail: detail ?? null });
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const read = (address, a, functionName, args = []) => client.readContract({ address, abi: a, functionName, args });

const chainId = await client.getChainId();
const block = await client.getBlock();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);
console.log(`block ${block.number} ts ${block.timestamp}`);

// -------------------------------------------------------------- fresh gates
const oracle = await read(A.controller, abi.controller, 'oracle');
check(/^0x0{40}$/i.test(oracle), 'controller oracle is unset (0x0)', oracle);
check((await read(A.controller, abi.controller, 'emergencyMode')) === false, 'controller emergencyMode false');
check((await read(A.vault, abi.vault, 'paused')) === false, 'vault not paused');
const EPOCH_ROLE = await read(A.vault, abi.vault, 'EPOCH_ROLE');
const epochRoleCtrl = await read(A.vault, abi.vault, 'hasRole', [EPOCH_ROLE, A.controller]);
check(epochRoleCtrl === false, 'EPOCH_ROLE -> Controller is false');
const PUBLISHER_ROLE = await read(A.controller, abi.controller, 'PUBLISHER_ROLE');
check((await read(A.controller, abi.controller, 'hasRole', [PUBLISHER_ROLE, PUBLISHER])) === false,
  'PUBLISHER_ROLE -> staking publisher is false');
check((await read(A.controller, abi.controller, 'epochCommitted')) === 0n, 'no standard epoch committed');

// -------------------------------------------------------------- product 1
const [active, lockSeconds, genesisAprBps, floorBps, targetBps, hardCapBps, minPrincipal] =
  await read(A.controller, abi.controller, 'products', [BigInt(PRODUCT_ID)]);
console.log(`product 1 30D: active=${active} lock=${lockSeconds}s gApr=${genesisAprBps} floor=${floorBps} target=${targetBps} cap=${hardCapBps} min=${formatEther(minPrincipal)}`);
check(active === true, '30D product active on controller');
check(Number(lockSeconds) === 2_592_000, '30D lockSeconds is 2592000', String(lockSeconds));
check(Number(genesisAprBps) === 2700, '30D Genesis APR is 2700 bps', String(genesisAprBps));
check(PRINCIPAL >= minPrincipal, 'canary principal meets live minPrincipal', formatEther(minPrincipal));

// -------------------------------------------------------------- capacity
const t = {
  free: await read(A.treasury, abi.treasury, 'freeBalance'),
  reservedGenesis: await read(A.treasury, abi.treasury, 'reservedGenesis'),
  reservedFloors: await read(A.treasury, abi.treasury, 'reservedFloors'),
  totalObligations: await read(A.treasury, abi.treasury, 'totalObligations'),
};
const caps = {
  genesisCap: await read(A.controller, abi.controller, 'GENESIS_YEAR1_CAP'),
  genesisUsed: await read(A.controller, abi.controller, 'genesisYear1Used'),
  standardCap: await read(A.controller, abi.controller, 'STANDARD_YEAR1_CAP'),
  standardUsed: await read(A.controller, abi.controller, 'standardYear1Used'),
};
const genesisRemaining = caps.genesisCap - caps.genesisUsed;
const standardRemaining = caps.standardCap - caps.standardUsed;
const inventory = await read(A.flow, erc20, 'balanceOf', [A.treasury]);
console.log(`treasury free=${formatEther(t.free)} obligations=${formatEther(t.totalObligations)} inventory=${formatEther(inventory)}`);
console.log(`genesis remaining=${formatEther(genesisRemaining)} standard remaining=${formatEther(standardRemaining)}`);
check(t.free + t.totalObligations <= inventory, 'reward treasury solvent');

const bal = await read(A.flow, erc20, 'balanceOf', [CANARY]);
const allowance0 = await read(A.flow, erc20, 'allowance', [CANARY, A.vault]);
const quotaRemaining = await read(A.vault, abi.vault, 'genesisQuotaRemainingSeconds', [CANARY]);
const YEAR = await read(A.vault, abi.vault, 'YEAR');
const BPS = await read(A.vault, abi.vault, 'BPS');
const GENESIS_MAX_SECONDS = await read(A.vault, abi.vault, 'GENESIS_MAX_SECONDS');
console.log(`canary balance=${formatEther(bal)} allowance=${formatEther(allowance0)} quota=${quotaRemaining}s`);
check(bal >= PRINCIPAL, 'canary wallet holds at least 1 FLOW', formatEther(bal));

// -------------------------------------------------- independent arithmetic
const lock = BigInt(lockSeconds);
const floorObligation = (PRINCIPAL * BigInt(floorBps) * lock) / (BPS * YEAR);
let window = lock > GENESIS_MAX_SECONDS ? GENESIS_MAX_SECONDS : lock;
const grant = window < quotaRemaining ? window : quotaRemaining;
const genesisObligation = grant === 0n ? 0n : (PRINCIPAL * BigInt(genesisAprBps) * grant) / (BPS * YEAR);

const quote = await read(A.vault, abi.vault, 'quoteOpen', [PRODUCT_ID, CANARY, PRINCIPAL]);
const [qGbps, qGsecs, qGobl, qFbps, qFobl] = quote;
console.log(`quoteOpen: gBps=${qGbps} gSecs=${qGsecs} gObl=${formatEther(qGobl)} fBps=${qFbps} fObl=${formatEther(qFobl)}`);
check(BigInt(qGsecs) === grant, 'quote Genesis seconds equals independent value', `${qGsecs}`);
check(BigInt(qGobl) === genesisObligation, 'quote Genesis obligation equals independent value', formatEther(qGobl));
check(BigInt(qFobl) === floorObligation, 'quote floor obligation equals independent value', formatEther(qFobl));
check(Number(qGbps) === Number(genesisAprBps), 'quote Genesis rate equals product rate');
check(Number(qFbps) === Number(floorBps), 'quote floor rate equals product rate');
check(BigInt(qGsecs) >= lock, '30D fully Genesis-covered to maturity', `${qGsecs}s of ${lock}s`);

const EXPECTED_GENESIS = 22191780821917808n;
const EXPECTED_FLOOR = 6575342465753424n;
check(BigInt(qGobl) === EXPECTED_GENESIS, 'Genesis reservation matches accepted P3C economics', formatEther(qGobl));
check(BigInt(qFobl) === EXPECTED_FLOOR, 'floor reservation matches accepted P3C economics', formatEther(qFobl));

const totalReservation = BigInt(qGobl) + BigInt(qFobl);
check(BigInt(qFobl) <= standardRemaining, 'floor obligation fits remaining standard Year-1 capacity');
check(BigInt(qGobl) <= genesisRemaining, 'genesis obligation fits remaining Genesis Year-1 capacity');
check(totalReservation <= t.free, 'total entry reservation is fully funded now', formatEther(totalReservation));

// -------------------------------------------------------------- simulation
let approveOk = false;
try {
  await client.simulateContract({ address: A.flow, abi: erc20, functionName: 'approve', args: [A.vault, PRINCIPAL], account: CANARY });
  approveOk = true;
} catch (e) {
  console.log(`approve simulation error: ${e.shortMessage ?? e.message}`);
}
check(approveOk, 'TX1 approve(vault, 1 FLOW) simulates successfully from canary wallet');

let openRevert = null;
try {
  await client.simulateContract({ address: A.vault, abi: abi.vault, functionName: 'openPosition', args: [PRODUCT_ID, PRINCIPAL], account: CANARY });
} catch (e) {
  openRevert = e.shortMessage ?? e.message;
}
console.log(`TX2 pre-approval simulation: ${openRevert ?? 'SUCCEEDED'}`);
check(
  allowance0 >= PRINCIPAL ? openRevert === null : openRevert !== null,
  'TX2 pre-signing simulation state is consistent with current allowance',
  `allowance=${formatEther(allowance0)}`,
);

const maturityAt = Number(block.timestamp) + Number(lock);
const pass = fail.length === 0;
const out = {
  gate: 'V30.2B P3D — 30D mainnet canary pre-signing gate',
  generatedAt: new Date().toISOString(),
  rpcSource: RPC,
  chainId,
  block: Number(block.number),
  blockHash: block.hash,
  blockTimestamp: Number(block.timestamp),
  addresses: A,
  canary: CANARY,
  productId: PRODUCT_ID,
  principalWei: PRINCIPAL.toString(),
  liveTerms: {
    active,
    lockSeconds: Number(lockSeconds),
    genesisAprBps: Number(genesisAprBps),
    floorBps: Number(floorBps),
    targetBps: Number(targetBps),
    hardCapBps: Number(hardCapBps),
    minPrincipalWei: minPrincipal.toString(),
  },
  quote: {
    genesisRateBps: Number(qGbps),
    genesisSeconds: Number(qGsecs),
    genesisReservedWei: qGobl.toString(),
    genesisReservedFlow: formatEther(qGobl),
    floorRateBps: Number(qFbps),
    floorReservedWei: qFobl.toString(),
    floorReservedFlow: formatEther(qFobl),
    totalReservationFlow: formatEther(totalReservation),
    projectedMaturityAt: maturityAt,
  },
  wallet: {
    balanceFlow: formatEther(bal),
    allowanceToVaultFlow: formatEther(allowance0),
    genesisQuotaRemainingSeconds: Number(quotaRemaining),
  },
  treasury: {
    freeFlow: formatEther(t.free),
    reservedGenesisFlow: formatEther(t.reservedGenesis),
    reservedFloorsFlow: formatEther(t.reservedFloors),
    totalObligationsFlow: formatEther(t.totalObligations),
    inventoryFlow: formatEther(inventory),
  },
  capacity: {
    genesisRemainingFlow: formatEther(genesisRemaining),
    standardRemainingFlow: formatEther(standardRemaining),
  },
  oracle,
  roles: { epochRoleToController: epochRoleCtrl, publisherRole: false },
  mainnetWrites: 0,
  transactions: {
    TX1: { target: A.flow, fn: 'approve(address,uint256)', args: [A.vault, PRINCIPAL.toString()], signer: CANARY, status: 'USER_SIGNED_PENDING' },
    TX2: { target: A.vault, fn: 'openPosition(uint8,uint256)', args: [PRODUCT_ID, PRINCIPAL.toString()], signer: CANARY, status: 'USER_SIGNED_PENDING' },
  },
  verdict: { 'P3D PRE-SIGNING GATE': pass ? 'PASS' : 'BLOCKED', ORACLE: '0x0 UNCHANGED', ROLES: 'UNCHANGED' },
  checks,
  failures: fail,
};
fs.writeFileSync(path.join(D, 'P3D_PREFLIGHT.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nP3D PRE-SIGNING GATE: ${pass ? 'PASS' : 'BLOCKED'} (${checks.length} checks, ${fail.length} failures)`);
if (!pass) process.exitCode = 1;
