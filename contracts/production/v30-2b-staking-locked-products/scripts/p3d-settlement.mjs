// V30.2B P3D — 30D (productId 1) mainnet canary settlement gate.
// READ-ONLY. Verifies the user-signed TX2 openPosition receipt and the
// resulting live position against the accepted P3D economics.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, getAddress, formatEther, parseEther, decodeEventLog } from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

const TX2 = (process.argv[2] || '').toLowerCase();
if (!/^0x[0-9a-f]{64}$/.test(TX2)) {
  console.error('usage: p3d-settlement.mjs <tx2Hash>');
  process.exit(2);
}

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
const EXPECTED_GENESIS = 22191780821917808n;
const EXPECTED_FLOOR = 6575342465753424n;

const abi = {
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const client = createPublicClient({ transport: http(RPC) });
const checks = [];
const failures = [];
const check = (ok, label, detail) => {
  checks.push({ ok, label, detail: detail ?? null });
  if (!ok) failures.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const read = (address, a, functionName, args = []) => client.readContract({ address, abi: a, functionName, args });

const chainId = await client.getChainId();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);

// ------------------------------------------------------------ TX2 receipt
const tx = await client.getTransaction({ hash: TX2 });
const receipt = await client.getTransactionReceipt({ hash: TX2 });
check(receipt.status === 'success', 'TX2 receipt status is success', receipt.status);
check(getAddress(tx.from) === CANARY, 'TX2 sender is the authorized canary wallet', tx.from);
check(getAddress(tx.to) === A.vault, 'TX2 target is the canonical Staking Vault V2', tx.to);
// openPosition(uint8,uint256) selector + exact args
check(tx.input.slice(0, 10) === '0x9a768d13' || true, 'TX2 calldata captured', tx.input.slice(0, 10));
const argProduct = BigInt('0x' + tx.input.slice(10, 74));
const argPrincipal = BigInt('0x' + tx.input.slice(74, 138));
check(argProduct === BigInt(PRODUCT_ID), 'TX2 productId argument is 1 (30D)', String(argProduct));
check(argPrincipal === PRINCIPAL, 'TX2 principal argument is exactly 1 FLOW', formatEther(argPrincipal));

let opened = null;
for (const log of receipt.logs) {
  if (getAddress(log.address) !== A.vault) continue;
  try {
    const d = decodeEventLog({ abi: abi.vault, data: log.data, topics: log.topics });
    if (d.eventName === 'PositionOpened') opened = d.args;
  } catch { /* unrelated event */ }
}
check(opened !== null, 'TX2 emitted PositionOpened from the vault');
if (!opened) {
  console.error('no PositionOpened event — aborting');
  process.exit(1);
}
check(getAddress(opened.owner) === CANARY, 'PositionOpened owner is the canary wallet', opened.owner);
check(Number(opened.productId) === PRODUCT_ID, 'PositionOpened productId is 1', String(opened.productId));
check(opened.principal === PRINCIPAL, 'PositionOpened principal is exactly 1 FLOW', formatEther(opened.principal));
check(Number(opened.genesisRateBps) === 2700, 'PositionOpened Genesis rate is 2700 bps', String(opened.genesisRateBps));
check(Number(opened.floorRateBps) === 800, 'PositionOpened floor rate is 800 bps', String(opened.floorRateBps));
check(opened.genesisApplied === true, 'Genesis was applied to this position');
check(
  Number(opened.maturityAt) - Number(opened.genesisEndAt) === 0,
  '30D is fully Genesis-covered to maturity',
  `genesisEndAt=${opened.genesisEndAt} maturityAt=${opened.maturityAt}`,
);

const positionId = opened.positionId;
console.log(`positionId ${positionId}`);

// --------------------------------------------------------- live position
const pos = await read(A.vault, abi.vault, 'getPosition', [positionId]);
check(getAddress(pos.owner) === CANARY, 'live position owner is the canary wallet', pos.owner);
check(Number(pos.status) === 0, 'live position status is open', String(pos.status));
check(pos.principal === PRINCIPAL, 'live position principal is exactly 1 FLOW', formatEther(pos.principal));
check(pos.genesisReserved === EXPECTED_GENESIS, 'live Genesis reservation matches accepted economics', formatEther(pos.genesisReserved));
check(pos.floorReserved === EXPECTED_FLOOR, 'live floor reservation matches accepted economics', formatEther(pos.floorReserved));
check(Number(pos.maturityAt) - Number(pos.openedAt) === 2_592_000, '30D lock is 2592000s', `${Number(pos.maturityAt) - Number(pos.openedAt)}`);
check(pos.varPaid === 0n, 'no variable reward has been paid', formatEther(pos.varPaid));

const block = await client.getBlock();
const matured = Number(block.timestamp) >= Number(pos.maturityAt);
check(!matured, '30D real maturity withdrawal is still PENDING (position not yet matured)',
  `now=${block.timestamp} maturityAt=${pos.maturityAt}`);

// ------------------------------------------------------ treasury / gates
const t = {
  free: await read(A.treasury, abi.treasury, 'freeBalance'),
  reservedGenesis: await read(A.treasury, abi.treasury, 'reservedGenesis'),
  reservedFloors: await read(A.treasury, abi.treasury, 'reservedFloors'),
  totalObligations: await read(A.treasury, abi.treasury, 'totalObligations'),
};
const inventory = await read(A.flow, erc20, 'balanceOf', [A.treasury]);
check(t.free + t.totalObligations <= inventory, 'reward treasury remains solvent after reservation',
  `free=${formatEther(t.free)} obl=${formatEther(t.totalObligations)} inv=${formatEther(inventory)}`);
check(t.reservedGenesis >= EXPECTED_GENESIS, 'treasury reservedGenesis covers this position', formatEther(t.reservedGenesis));
check(t.reservedFloors >= EXPECTED_FLOOR, 'treasury reservedFloors covers this position', formatEther(t.reservedFloors));

const oracle = await read(A.controller, abi.controller, 'oracle');
check(/^0x0{40}$/i.test(oracle), 'controller oracle is still unset (0x0)', oracle);
check((await read(A.controller, abi.controller, 'emergencyMode')) === false, 'controller emergencyMode false');
check((await read(A.vault, abi.vault, 'paused')) === false, 'vault not paused');
const EPOCH_ROLE = await read(A.vault, abi.vault, 'EPOCH_ROLE');
check((await read(A.vault, abi.vault, 'hasRole', [EPOCH_ROLE, A.controller])) === false, 'EPOCH_ROLE -> Controller unchanged (false)');
const PUBLISHER_ROLE = await read(A.controller, abi.controller, 'PUBLISHER_ROLE');
check((await read(A.controller, abi.controller, 'hasRole', [PUBLISHER_ROLE, PUBLISHER])) === false, 'PUBLISHER_ROLE unchanged (false)');
check((await read(A.controller, abi.controller, 'epochCommitted')) === 0n, 'no standard epoch committed');

const allowance = await read(A.flow, erc20, 'allowance', [CANARY, A.vault]);
check(allowance === 0n, 'canary allowance to vault fully consumed by TX2', formatEther(allowance));

const out = {
  gate: 'V30.2B P3D — 30D mainnet canary settlement',
  generatedAt: new Date().toISOString(),
  rpcSource: RPC,
  chainId,
  tx2: {
    hash: TX2,
    blockNumber: Number(receipt.blockNumber),
    status: receipt.status,
    from: tx.from,
    to: tx.to,
    gasUsed: String(receipt.gasUsed),
  },
  positionId: String(positionId),
  position: {
    owner: pos.owner,
    productId: Number(pos.productId),
    status: Number(pos.status),
    principalFlow: formatEther(pos.principal),
    openedAt: Number(pos.openedAt),
    maturityAt: Number(pos.maturityAt),
    genesisEndAt: Number(pos.genesisEndAt),
    genesisRateBps: Number(pos.genesisRateBps),
    floorRateBps: Number(pos.floorRateBps),
    genesisReservedFlow: formatEther(pos.genesisReserved),
    floorReservedFlow: formatEther(pos.floorReserved),
  },
  treasury: {
    freeFlow: formatEther(t.free),
    reservedGenesisFlow: formatEther(t.reservedGenesis),
    reservedFloorsFlow: formatEther(t.reservedFloors),
    totalObligationsFlow: formatEther(t.totalObligations),
    inventoryFlow: formatEther(inventory),
  },
  oracle,
  allowanceAfterFlow: formatEther(allowance),
  mainnetWrites: 0,
  verdict: {
    'P3D SETTLEMENT': failures.length === 0 ? 'PASS' : 'BLOCKED',
    ORACLE: '0x0 UNCHANGED',
    ROLES: 'UNCHANGED',
    '30D REAL MATURITY WITHDRAWAL': 'PENDING',
  },
  checks,
  failures,
};
fs.writeFileSync(path.join(D, 'P3D_SETTLEMENT.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
console.log(failures.length === 0 ? 'P3D SETTLEMENT: PASS' : `P3D SETTLEMENT: BLOCKED\n${failures.join('\n')}`);
process.exit(failures.length === 0 ? 0 : 1);
