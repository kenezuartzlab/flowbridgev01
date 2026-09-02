// V30.2B P3C — Locked Genesis products (30D/90D/180D/365D) mainnet preflight.
// READ-ONLY. Nothing is signed, broadcast, funded, granted or activated here.
//
// Derives every locked-product obligation from the verified deployed R4/R5/R6
// ABIs at a fresh block, reproduces the deployed integer arithmetic
// independently, requires exact equality with quoteOpen(), and simulates the
// exact user-signed openPosition() call from the canary wallet context.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, getAddress, formatEther, parseEther, encodeFunctionData } from 'viem';

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

// ---------------------------------------------------------------- gates
const oracle = await read(A.controller, abi.controller, 'oracle');
check(/^0x0{40}$/i.test(oracle), 'controller oracle is unset (0x0)', oracle);
const emergency = await read(A.controller, abi.controller, 'emergencyMode');
check(emergency === false, 'controller emergencyMode false');
const paused = await read(A.vault, abi.vault, 'paused');
check(paused === false, 'vault not paused');
const epochEnd = await read(A.controller, abi.controller, 'epochEnd');
const epochCommitted = await read(A.controller, abi.controller, 'epochCommitted');
check(epochCommitted === 0n, 'no standard epoch committed on controller', String(epochCommitted));
check(epochEnd <= block.timestamp, 'no live standard epoch window', String(epochEnd));
const vaultEpochCommitted = await read(A.vault, abi.vault, 'currentEpochCommitted');
check(vaultEpochCommitted === 0n, 'vault currentEpochCommitted is zero');

const EPOCH_ROLE = await read(A.vault, abi.vault, 'EPOCH_ROLE');
const epochRoleCtrl = await read(A.vault, abi.vault, 'hasRole', [EPOCH_ROLE, A.controller]);
check(epochRoleCtrl === false, 'EPOCH_ROLE -> Controller is false');
const PUBLISHER_ROLE = await read(A.controller, abi.controller, 'PUBLISHER_ROLE');
const pubRole = await read(A.controller, abi.controller, 'hasRole', [PUBLISHER_ROLE, PUBLISHER]);
check(pubRole === false, 'PUBLISHER_ROLE -> staking publisher is false');

// ---------------------------------------------------------------- capacity
const t = {
  free: await read(A.treasury, abi.treasury, 'freeBalance'),
  reservedGenesis: await read(A.treasury, abi.treasury, 'reservedGenesis'),
  reservedFloors: await read(A.treasury, abi.treasury, 'reservedFloors'),
  committedEpoch: await read(A.treasury, abi.treasury, 'committedEpoch'),
  accruedUnclaimed: await read(A.treasury, abi.treasury, 'accruedUnclaimed'),
  totalObligations: await read(A.treasury, abi.treasury, 'totalObligations'),
};
const caps = {
  genesisCap: await read(A.controller, abi.controller, 'GENESIS_YEAR1_CAP'),
  genesisUsed: await read(A.controller, abi.controller, 'genesisYear1Used'),
  standardCap: await read(A.controller, abi.controller, 'STANDARD_YEAR1_CAP'),
  standardUsed: await read(A.controller, abi.controller, 'standardYear1Used'),
  totalCap: await read(A.controller, abi.controller, 'TOTAL_YEAR1_CAP'),
};
const genesisRemaining = caps.genesisCap - caps.genesisUsed;
const standardRemaining = caps.standardCap - caps.standardUsed;
console.log(`treasury free=${formatEther(t.free)} obligations=${formatEther(t.totalObligations)}`);
console.log(`genesis remaining=${formatEther(genesisRemaining)} standard remaining=${formatEther(standardRemaining)}`);
check(t.free > 0n, 'reward treasury has free inventory', formatEther(t.free));

const vaultTotalPrincipal = await read(A.vault, abi.vault, 'totalPrincipal');
check(vaultTotalPrincipal === 0n, 'vault totalPrincipal is zero (no open liability)', String(vaultTotalPrincipal));
const quotaRemaining = await read(A.vault, abi.vault, 'genesisQuotaRemainingSeconds', [CANARY]);
const GENESIS_MAX_SECONDS = await read(A.vault, abi.vault, 'GENESIS_MAX_SECONDS');
const YEAR = await read(A.vault, abi.vault, 'YEAR');
const BPS = await read(A.vault, abi.vault, 'BPS');
console.log(`canary genesis quota remaining ${quotaRemaining}s of ${GENESIS_MAX_SECONDS}s`);

const bal = await read(A.flow, erc20, 'balanceOf', [CANARY]);
const allowance = await read(A.flow, erc20, 'allowance', [CANARY, A.vault]);
console.log(`canary FLOW balance=${formatEther(bal)} allowance->vault=${formatEther(allowance)}`);

// ---------------------------------------------------------------- products
const NAMES = { 0: 'Flexible', 1: '30 Days', 2: '90 Days', 3: '180 Days', 4: '365 Days' };
const products = {};
for (const pid of [0, 1, 2, 3, 4]) {
  const [active, lockSeconds, genesisAprBps, floorBps, targetBps, hardCapBps, minPrincipal] =
    await read(A.controller, abi.controller, 'products', [BigInt(pid)]);
  products[pid] = { active, lockSeconds: Number(lockSeconds), genesisAprBps, floorBps, targetBps, hardCapBps, minPrincipal };
  console.log(
    `product ${pid} ${NAMES[pid]}: active=${active} lock=${lockSeconds}s gApr=${genesisAprBps}bps floor=${floorBps}bps target=${targetBps} cap=${hardCapBps} min=${formatEther(minPrincipal)}`,
  );
}

// Flexible (P3B) posture must be unchanged.
check(products[0].active === true, 'P3B Flexible product still active');
check(products[0].lockSeconds === 0, 'P3B Flexible lockSeconds still 0');
check(products[0].floorBps === 0, 'P3B Flexible has no floor obligation');

const results = {};
for (const pid of [1, 2, 3, 4]) {
  const p = products[pid];
  const name = NAMES[pid];
  const blockers = [];
  const principal = p.minPrincipal;

  if (!p.active) blockers.push('product inactive on controller');
  if (principal === 0n) blockers.push('minPrincipal is zero');

  // Independent reproduction of deployed integer arithmetic.
  const lock = BigInt(p.lockSeconds);
  const floorObligation = lock > 0n ? (principal * BigInt(p.floorBps) * lock) / (BPS * YEAR) : 0n;
  let window = lock === 0n ? GENESIS_MAX_SECONDS : lock;
  if (window > GENESIS_MAX_SECONDS) window = GENESIS_MAX_SECONDS;
  const grant = window < quotaRemaining ? window : quotaRemaining;
  const genesisObligation = grant === 0n ? 0n : (principal * BigInt(p.genesisAprBps) * grant) / (BPS * YEAR);
  const maturityAt = block.timestamp + lock;

  // Contract-side quote must match exactly.
  let quote = null;
  try {
    quote = await read(A.vault, abi.vault, 'quoteOpen', [pid, CANARY, principal]);
  } catch (e) {
    blockers.push(`quoteOpen reverted: ${e.shortMessage ?? e.message}`);
  }
  if (quote) {
    const [qGbps, qGsecs, qGobl, qFbps, qFobl] = quote;
    const exact =
      BigInt(qGobl) === genesisObligation &&
      BigInt(qFobl) === floorObligation &&
      BigInt(qGsecs) === grant &&
      Number(qFbps) === p.floorBps;
    check(exact, `${name}: independent math equals deployed quoteOpen`,
      `genesis ${formatEther(qGobl)} floor ${formatEther(qFobl)} secs ${qGsecs}`);
    if (!exact) blockers.push('quoteOpen mismatch with independently reproduced arithmetic');
  }

  // Locked products MUST reserve the full floor obligation at entry, from the
  // standard Year-1 budget and from funded treasury inventory.
  if (floorObligation === 0n) blockers.push('floor obligation rounds to zero -> openPosition reverts FloorNotReservable');
  if (floorObligation > standardRemaining) blockers.push('floor obligation exceeds remaining STANDARD Year-1 capacity');
  if (floorObligation + genesisObligation > t.free) blockers.push('total entry reservation exceeds funded treasury free balance');
  if (genesisObligation > genesisRemaining) blockers.push('genesis obligation exceeds remaining GENESIS Year-1 capacity');

  // Genesis coverage vs maturity.
  const genesisCoversTerm = grant >= lock;
  if (!genesisCoversTerm) {
    // Post-Genesis remainder of the locked term. It must be contractually
    // defined AND fully reserved at entry with no oracle/epoch dependency.
    const postGenesisSeconds = lock - grant;
    const floorCoversPostGenesis = p.floorBps > 0 && floorObligation > 0n;
    if (!floorCoversPostGenesis) {
      blockers.push(`post-Genesis ${postGenesisSeconds}s of the locked term has no reserved floor obligation`);
    }
    // Variable tier is oracle/epoch-driven and MUST NOT be required.
    // It is additive-only in the deployed vault (varPerTokenStored stays 0
    // while no epoch exists), so it is not a funding dependency — but the
    // fast-track rules keep 180D/365D BLOCKED for public execution until a
    // product-specific live lifecycle is proven to maturity.
    blockers.push('locked term extends beyond the 90-day Genesis window — requires its own proven post-Genesis lifecycle before public execution');
  }

  // Simulation from the canary wallet with current mainnet state.
  let simulation = 'NOT_ATTEMPTED';
  let simError = null;
  if (!blockers.some((b) => b.includes('inactive'))) {
    try {
      await client.call({
        account: CANARY,
        to: A.vault,
        data: encodeFunctionData({ abi: abi.vault, functionName: 'openPosition', args: [pid, principal] }),
      });
      simulation = 'OK';
    } catch (e) {
      const msg = `${e.shortMessage ?? ''} ${e.details ?? ''} ${e.message ?? ''}`;
      simError = (e.shortMessage ?? e.message ?? '').slice(0, 220);
      if (/allowance|InsufficientAllowance|transfer amount exceeds allowance/i.test(msg)) {
        simulation = 'ALLOWANCE_ONLY';
      } else if (/balance/i.test(msg) && /exceeds/i.test(msg)) {
        simulation = 'INSUFFICIENT_BALANCE';
      } else {
        simulation = 'REVERT';
      }
    }
  }
  if (simulation === 'REVERT') blockers.push(`openPosition simulation reverted: ${simError}`);
  if (simulation === 'INSUFFICIENT_BALANCE') blockers.push('canary wallet FLOW balance below minimum principal');
  if (principal > bal) blockers.push('canary wallet FLOW balance below minimum principal');

  const decision = blockers.length === 0 && (simulation === 'OK' || simulation === 'ALLOWANCE_ONLY')
    ? 'CANARY_READY'
    : 'BLOCKED';

  results[pid] = {
    productId: pid,
    name,
    active: p.active,
    lockSeconds: p.lockSeconds,
    genesisAprBps: p.genesisAprBps,
    floorBps: p.floorBps,
    minPrincipal: formatEther(principal),
    genesisSecondsGranted: Number(grant),
    genesisCoversFullTerm: genesisCoversTerm,
    genesisObligationFlow: formatEther(genesisObligation),
    floorObligationFlow: formatEther(floorObligation),
    totalEntryReservationFlow: formatEther(genesisObligation + floorObligation),
    maturityAtIfOpenedNow: Number(maturityAt),
    maturityIsoIfOpenedNow: new Date(Number(maturityAt) * 1000).toISOString(),
    earliestWithdrawalIso: new Date(Number(maturityAt) * 1000).toISOString(),
    simulation,
    simulationError: simError,
    decision,
    blockers,
  };
  console.log(`\n${name} (productId ${pid}) -> ${decision}`);
  console.log(`  min principal        ${formatEther(principal)} FLOW`);
  console.log(`  genesis grant        ${grant}s (${(Number(grant) / 86400).toFixed(2)}d) @ ${p.genesisAprBps}bps`);
  console.log(`  genesis reservation  ${formatEther(genesisObligation)} FLOW`);
  console.log(`  floor reservation    ${formatEther(floorObligation)} FLOW @ ${p.floorBps}bps`);
  console.log(`  maturity if now      ${new Date(Number(maturityAt) * 1000).toISOString()}`);
  console.log(`  simulation           ${simulation}${simError ? ` :: ${simError}` : ''}`);
  for (const b of blockers) console.log(`  BLOCKER  ${b}`);
}

// ------------------------------------------------------- untouched accounting
const distributor = getAddress('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922');
const distCode = (await client.getCode({ address: distributor })) ?? '0x';
check(distCode.length > 2, 'rewards distributor untouched and live', distributor);

const p3cPass = fail.length === 0;
const out = {
  gate: 'V30.2B P3C — Locked Genesis Products Fast-Track Preflight',
  readOnly: true,
  broadcast: false,
  chainId,
  block: Number(block.number),
  blockTimestamp: Number(block.timestamp),
  canary: CANARY,
  addresses: A,
  gates: {
    oracle,
    emergencyMode: emergency,
    vaultPaused: paused,
    epochRoleController: epochRoleCtrl,
    publisherRole: pubRole,
    standardEpochCommitted: String(epochCommitted),
    dynamicStaking: 'DISABLED',
  },
  capacity: {
    treasuryFreeFlow: formatEther(t.free),
    reservedGenesisFlow: formatEther(t.reservedGenesis),
    reservedFloorsFlow: formatEther(t.reservedFloors),
    committedEpochFlow: formatEther(t.committedEpoch),
    accruedUnclaimedFlow: formatEther(t.accruedUnclaimed),
    genesisYear1RemainingFlow: formatEther(genesisRemaining),
    standardYear1RemainingFlow: formatEther(standardRemaining),
    vaultTotalPrincipal: String(vaultTotalPrincipal),
    canaryGenesisQuotaSeconds: Number(quotaRemaining),
    canaryFlowBalance: formatEther(bal),
    canaryAllowanceToVault: formatEther(allowance),
  },
  products: results,
  checks,
  verdict: {
    P3C: p3cPass ? 'PASS' : 'BLOCKED',
    '30D': results[1].decision,
    '90D': results[2].decision,
    '180D': results[3].decision,
    '365D': results[4].decision,
  },
};
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(path.join(D, 'P3C_PREFLIGHT.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nP3C: ${out.verdict.P3C}`);
for (const k of ['30D', '90D', '180D', '365D']) console.log(`${k}: ${out.verdict[k]}`);
if (fail.length) console.log(`\nfailed checks:\n- ${fail.join('\n- ')}`);
