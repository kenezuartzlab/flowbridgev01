// V30.2B P3C.1 — Accelerated BOT Mainnet fork lifecycle test for the four
// locked staking products (30D / 90D / 180D / 365D).
//
// ZERO MAINNET WRITES. Every stake/claim/withdraw below happens exclusively on
// a local anvil fork of BOT Mainnet 677 using the exact deployed R4/R5/R6
// bytecode and storage. Nothing is redeployed, no oracle is configured, no role
// is granted, no contract storage slot is written directly: state changes come
// only from ordinary user transactions plus normal block-time advancement.
//
// Usage: anvil --fork-url <BOT mainnet rpc> --port 8899
//        bun contracts/production/v30-2b-staking-locked-products/scripts/p3c1-fork-lifecycle.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  getAddress,
  formatEther,
  parseEther,
  publicActions,
  walletActions,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const FORK_RPC = process.env.FORK_RPC_URL || 'http://127.0.0.1:8899';

const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  treasury: getAddress('0x96552909998F3DbAf5Ff4979dc158508b3442e65'),
  controller: getAddress('0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF'),
  vault: getAddress('0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D'),
};
// Mainnet FLOW holder, impersonated ON THE FORK ONLY to fund fork test users.
const FORK_FUNDER = getAddress('0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4');
const PUBLISHER = getAddress('0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22');
const P3B_CANARY = getAddress('0x3d8a7fa490f9db09dd8006b74688213ace9c0164');

// Fork-only deterministic test wallets (anvil mnemonic accounts 6-9).
// Never used on mainnet; never the P3B canary wallet.
const FORK_KEYS = {
  1: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  2: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  3: '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  4: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
};
const NAMES = { 1: '30D', 2: '90D', 3: '180D', 4: '365D' };

const abi = {
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const test = createTestClient({ mode: 'anvil', transport: http(FORK_RPC) })
  .extend(publicActions)
  .extend(walletActions);
const pub = createPublicClient({ transport: http(FORK_RPC) });

const checks = [];
const fail = [];
const check = (ok, label, detail) => {
  checks.push({ ok: !!ok, label, detail: detail ?? null });
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return !!ok;
};
const read = (address, a, functionName, args = []) => pub.readContract({ address, abi: a, functionName, args });
const send = async (account, address, a, functionName, args = []) => {
  const hash = await test.writeContract({ account, address, abi: a, functionName, args, chain: null });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (rcpt.status !== 'success') throw new Error(`tx reverted: ${functionName}`);
  return rcpt;
};
const warpTo = async (ts) => {
  await test.setNextBlockTimestamp({ timestamp: BigInt(ts) });
  await test.mine({ blocks: 1 });
};
const now = async () => Number((await pub.getBlock()).timestamp);

// ------------------------------------------------------------------ baseline
const chainId = await pub.getChainId();
check(chainId === 677, 'fork reports BOT Mainnet chain id 677', `chainId=${chainId}`);
const forkBlock = await pub.getBlock();
console.log(`fork block ${forkBlock.number} hash ${forkBlock.hash} ts ${forkBlock.timestamp}`);

const VAULT_BPS = await read(A.vault, abi.vault, 'BPS');
const VAULT_YEAR = await read(A.vault, abi.vault, 'YEAR');
const GENESIS_MAX = await read(A.vault, abi.vault, 'GENESIS_MAX_SECONDS');
check(GENESIS_MAX === 7776000n, 'GENESIS_MAX_SECONDS is 90 days', String(GENESIS_MAX));

const oracle0 = await read(A.controller, abi.controller, 'oracle');
check(/^0x0{40}$/i.test(oracle0), 'oracle is 0x0 at fork start', oracle0);
check((await read(A.controller, abi.controller, 'emergencyMode')) === false, 'emergencyMode false');
check((await read(A.vault, abi.vault, 'paused')) === false, 'vault not paused');
const EPOCH_ROLE = await read(A.vault, abi.vault, 'EPOCH_ROLE');
const PUBLISHER_ROLE = await read(A.controller, abi.controller, 'PUBLISHER_ROLE');
check((await read(A.vault, abi.vault, 'hasRole', [EPOCH_ROLE, A.controller])) === false, 'EPOCH_ROLE -> Controller false at fork start');
check((await read(A.controller, abi.controller, 'hasRole', [PUBLISHER_ROLE, PUBLISHER])) === false, 'PUBLISHER_ROLE unassigned at fork start');

const baseTotalPrincipal = await read(A.vault, abi.vault, 'totalPrincipal');
const baseFree = await read(A.treasury, abi.treasury, 'freeBalance');
const baseObligations = await read(A.treasury, abi.treasury, 'totalObligations');
console.log(`baseline totalPrincipal=${formatEther(baseTotalPrincipal)} free=${formatEther(baseFree)} obligations=${formatEther(baseObligations)}`);

// -------------------------------------------------------- deployed arithmetic
const floorObligation = (principal, floorBps, lockSeconds) =>
  lockSeconds === 0n ? 0n : (principal * floorBps * lockSeconds) / (VAULT_BPS * VAULT_YEAR);
const genesisWindow = (lockSeconds) => (lockSeconds === 0n ? GENESIS_MAX : lockSeconds > GENESIS_MAX ? GENESIS_MAX : lockSeconds);
const genesisObligation = (principal, aprBps, seconds) => (seconds === 0n ? 0n : (principal * aprBps * seconds) / (VAULT_BPS * VAULT_YEAR));

const PRINCIPAL = parseEther('1');
const results = {};
// One product per process against a FRESH fork (stronger isolation than
// snapshot/revert: no simulated lifecycle can contaminate another).
const ONLY = process.argv.slice(2).map(Number).filter((n) => n >= 1 && n <= 4);
const PRODUCTS = ONLY.length ? ONLY : [1, 2, 3, 4];

for (const productId of PRODUCTS) {
  const label = NAMES[productId];
  console.log(`\n================ ${label} (product ${productId}) ================`);

  const blockers = [];
  const notes = [];
  const user = privateKeyToAccount(FORK_KEYS[productId]);
  check(getAddress(user.address) !== P3B_CANARY, `${label}: fork wallet is not the P3B canary wallet`, user.address);

  // -- fork-only funding: native gas + exactly 1 FLOW from an impersonated holder
  await test.setBalance({ address: user.address, value: parseEther('10') });
  await test.setBalance({ address: FORK_FUNDER, value: parseEther('10') });
  await test.impersonateAccount({ address: FORK_FUNDER });
  await send(FORK_FUNDER, A.flow, erc20, 'transfer', [user.address, PRINCIPAL]);
  await test.stopImpersonatingAccount({ address: FORK_FUNDER });
  const userFlow0 = await read(A.flow, erc20, 'balanceOf', [user.address]);
  check(userFlow0 === PRINCIPAL, `${label}: fork user funded with exactly 1 FLOW`, formatEther(userFlow0));
  const quotaStart = await read(A.vault, abi.vault, 'genesisQuotaRemainingSeconds', [user.address]);
  check(quotaStart === GENESIS_MAX, `${label}: fresh wallet has full 90-day Genesis quota`, String(quotaStart));

  // -- product terms + quoteOpen parity
  const prod = await read(A.controller, abi.controller, 'products', [BigInt(productId)]);
  const [active, lockSeconds, genesisAprBps, floorBps, , , minPrincipal] = prod;
  check(active === true, `${label}: product active on controller`);
  check(PRINCIPAL >= minPrincipal, `${label}: 1 FLOW >= deployed minPrincipal`, formatEther(minPrincipal));
  const q = await read(A.vault, abi.vault, 'quoteOpen', [productId, user.address, PRINCIPAL]);
  const [qGenBps, qGenSecs, qGenObl, qFloorBps, qFloorObl] = q;
  const expGenSecs = genesisWindow(BigInt(lockSeconds));
  const expGenObl = genesisObligation(PRINCIPAL, BigInt(genesisAprBps), expGenSecs);
  const expFloorObl = floorObligation(PRINCIPAL, BigInt(floorBps), BigInt(lockSeconds));
  check(qGenBps === genesisAprBps, `${label}: quoteOpen genesis rate matches controller`, String(qGenBps));
  check(qFloorBps === floorBps, `${label}: quoteOpen floor rate matches controller`, String(qFloorBps));
  check(BigInt(qGenSecs) === expGenSecs, `${label}: genesis seconds parity`, `${qGenSecs} vs ${expGenSecs}`);
  check(qGenObl === expGenObl, `${label}: genesis obligation integer parity`, formatEther(qGenObl));
  check(qFloorObl === expFloorObl, `${label}: floor obligation integer parity`, formatEther(qFloorObl));

  const resGen0 = await read(A.treasury, abi.treasury, 'reservedGenesis');
  const resFloor0 = await read(A.treasury, abi.treasury, 'reservedFloors');
  const free0 = await read(A.treasury, abi.treasury, 'freeBalance');
  const genUsed0 = await read(A.controller, abi.controller, 'genesisYear1Used');
  const stdUsed0 = await read(A.controller, abi.controller, 'standardYear1Used');

  // -- open with exact allowance
  await send(user, A.flow, erc20, 'approve', [A.vault, PRINCIPAL]);
  const allow = await read(A.flow, erc20, 'allowance', [user.address, A.vault]);
  check(allow === PRINCIPAL, `${label}: exact 1 FLOW allowance (never unlimited)`, formatEther(allow));
  await send(user, A.vault, abi.vault, 'openPosition', [productId, PRINCIPAL]);
  const positionId = await read(A.vault, abi.vault, 'positionsOf', [user.address, 0n]);
  const pos = await read(A.vault, abi.vault, 'getPosition', [positionId]);
  check(getAddress(pos.owner) === getAddress(user.address), `${label}: position owner is the fork user`);
  check(pos.productId === productId, `${label}: position productId`, String(pos.productId));
  check(pos.principal === PRINCIPAL, `${label}: position principal is exactly 1 FLOW`, formatEther(pos.principal));
  check(pos.genesisReserved === qGenObl, `${label}: genesis reserved equals quote`, formatEther(pos.genesisReserved));
  check(pos.floorReserved === qFloorObl, `${label}: floor reserved equals quote`, formatEther(pos.floorReserved));
  const openedAt = Number(pos.openedAt);
  const maturityAt = Number(pos.maturityAt);
  const genesisEndAt = Number(pos.genesisEndAt);
  check(maturityAt === openedAt + Number(lockSeconds), `${label}: maturity = openedAt + lock`, String(maturityAt));
  check((await read(A.flow, erc20, 'balanceOf', [user.address])) === 0n, `${label}: user principal transferred in full`);

  const resGen1 = await read(A.treasury, abi.treasury, 'reservedGenesis');
  const resFloor1 = await read(A.treasury, abi.treasury, 'reservedFloors');
  check(resGen1 - resGen0 === qGenObl, `${label}: treasury reservedGenesis delta`, formatEther(resGen1 - resGen0));
  check(resFloor1 - resFloor0 === qFloorObl, `${label}: treasury reservedFloors delta`, formatEther(resFloor1 - resFloor0));
  check(
    (await read(A.controller, abi.controller, 'genesisYear1Used')) - genUsed0 === qGenObl,
    `${label}: controller genesis Year-1 budget consumed exactly`,
  );
  check(
    (await read(A.controller, abi.controller, 'standardYear1Used')) - stdUsed0 === qFloorObl,
    `${label}: controller standard Year-1 budget consumed exactly (floor)`,
  );
  const free1 = await read(A.treasury, abi.treasury, 'freeBalance');
  check(free0 - free1 === qGenObl + qFloorObl, `${label}: free reward balance reduced by reservations only`, formatEther(free0 - free1));
  check(
    (await read(A.treasury, abi.treasury, 'freeBalance')) + (await read(A.treasury, abi.treasury, 'totalObligations')) <=
      (await read(A.flow, erc20, 'balanceOf', [A.treasury])),
    `${label}: treasury solvent after open (obligations <= inventory)`,
  );

  // -- mid-Genesis accrual + one claim
  const midTs = openedAt + Math.floor(Math.min(Number(lockSeconds), Number(GENESIS_MAX)) / 2);
  await warpTo(midTs);
  const pending1 = await read(A.vault, abi.vault, 'previewPending', [positionId]);
  check(pending1 > 0n, `${label}: positive accrual mid-Genesis`, formatEther(pending1));
  const before = await read(A.flow, erc20, 'balanceOf', [user.address]);
  await send(user, A.vault, abi.vault, 'claim', [positionId]);
  const after = await read(A.flow, erc20, 'balanceOf', [user.address]);
  const paid = after - before;
  check(paid >= pending1, `${label}: claim paid at least the previewed amount`, formatEther(paid));
  const posAfterClaim = await read(A.vault, abi.vault, 'getPosition', [positionId]);
  check(posAfterClaim.principal === PRINCIPAL, `${label}: claim never reduces principal`);
  let totalClaimed = paid;
  // repeated claim in the same block must not double-pay
  let doubleClaimReverted = false;
  try {
    await send(user, A.vault, abi.vault, 'claim', [positionId]);
  } catch {
    doubleClaimReverted = true;
  }
  const afterDouble = await read(A.flow, erc20, 'balanceOf', [user.address]);
  totalClaimed += afterDouble - after;
  check(afterDouble - after === 0n || doubleClaimReverted, `${label}: immediate repeat claim cannot double-pay`, formatEther(afterDouble - after));

  // -- Genesis boundary behaviour for post-Genesis products
  let postGenesis = null;
  if (Number(lockSeconds) > Number(GENESIS_MAX)) {
    await warpTo(genesisEndAt + 1);
    const pendingAtBoundary = await read(A.vault, abi.vault, 'previewPending', [positionId]);
    await warpTo(genesisEndAt + 30 * 24 * 3600);
    const pendingPost = await read(A.vault, abi.vault, 'previewPending', [positionId]);
    const varPerToken = await read(A.vault, abi.vault, 'varPerTokenStored', [productId]);
    const epochCommitted = await read(A.vault, abi.vault, 'currentEpochCommitted');
    let claimOk = true;
    const bal0 = await read(A.flow, erc20, 'balanceOf', [user.address]);
    try {
      await send(user, A.vault, abi.vault, 'claim', [positionId]);
    } catch {
      claimOk = false;
    }
    const bal1 = await read(A.flow, erc20, 'balanceOf', [user.address]);
    totalClaimed += bal1 - bal0;
    postGenesis = {
      pendingAtGenesisEnd: pendingAtBoundary.toString(),
      pendingThirtyDaysPostGenesis: pendingPost.toString(),
      floorAccrualContinues: pendingPost > pendingAtBoundary,
      variableAccrualZero: varPerToken === 0n && epochCommitted === 0n,
      claimAvailablePostGenesis: claimOk,
      claimPaidPostGenesis: (bal1 - bal0).toString(),
    };
    check(varPerToken === 0n, `${label}: no variable emission with oracle 0x0`, String(varPerToken));
    check(epochCommitted === 0n, `${label}: no committed epoch after Genesis`, String(epochCommitted));
    check(pendingPost > pendingAtBoundary, `${label}: fixed floor accrual continues after Genesis`, formatEther(pendingPost - pendingAtBoundary));
    if (!claimOk) notes.push('post-Genesis claim reverted');
  }

  // -- maturity withdrawal
  await warpTo(maturityAt + 1);
  const preWithdraw = await read(A.flow, erc20, 'balanceOf', [user.address]);
  let withdrawOk = true;
  let withdrawErr = null;
  try {
    await send(user, A.vault, abi.vault, 'withdraw', [positionId]);
  } catch (e) {
    withdrawOk = false;
    withdrawErr = String(e?.shortMessage || e?.message || e).slice(0, 200);
  }
  const postWithdraw = await read(A.flow, erc20, 'balanceOf', [user.address]);
  const returned = postWithdraw - preWithdraw;
  if (!withdrawOk) blockers.push(`maturity withdrawal reverted: ${withdrawErr}`);
  check(withdrawOk, `${label}: withdraw at maturity succeeds`, withdrawErr || '');
  check(returned >= PRINCIPAL, `${label}: at least exact 1 FLOW principal returned`, formatEther(returned));
  const rewardTail = returned - PRINCIPAL;
  totalClaimed += rewardTail;
  const finalPos = await read(A.vault, abi.vault, 'getPosition', [positionId]);
  // Deployed semantics: status 0 = open, 1 = closed.
  check(finalPos.status === 1n, `${label}: position is CLOSED after withdrawal`, String(finalPos.status));
  check(
    (await read(A.vault, abi.vault, 'totalPrincipal')) === baseTotalPrincipal,
    `${label}: vault totalPrincipal back to baseline (zero stranded principal)`,
  );

  // -- final claim of any earned-but-unclaimed dust after closure
  if (finalPos.pending > 0n) {
    const dustBefore = await read(A.flow, erc20, 'balanceOf', [user.address]);
    await send(user, A.vault, abi.vault, 'claim', [positionId]);
    const dustAfter = await read(A.flow, erc20, 'balanceOf', [user.address]);
    check(dustAfter - dustBefore === finalPos.pending, `${label}: earned dust claimable after closure`, formatEther(dustAfter - dustBefore));
    totalClaimed += dustAfter - dustBefore;
  }
  const closedPos = await read(A.vault, abi.vault, 'getPosition', [positionId]);
  check(closedPos.pending === 0n, `${label}: no unclaimed reward liability remains`, formatEther(closedPos.pending));
  check(
    (await read(A.flow, erc20, 'balanceOf', [user.address])) === PRINCIPAL + totalClaimed,
    `${label}: fork user holds exactly principal + all rewards paid`,
  );

  // -- obligation reconciliation
  const resGenEnd = await read(A.treasury, abi.treasury, 'reservedGenesis');
  const resFloorEnd = await read(A.treasury, abi.treasury, 'reservedFloors');
  check(resGenEnd === resGen0, `${label}: genesis reservation fully released/consumed`, formatEther(resGenEnd - resGen0));
  check(resFloorEnd === resFloor0, `${label}: floor reservation fully released/consumed`, formatEther(resFloorEnd - resFloor0));
  const freeEnd = await read(A.treasury, abi.treasury, 'freeBalance');
  const obligEnd = await read(A.treasury, abi.treasury, 'totalObligations');
  const inventoryEnd = await read(A.flow, erc20, 'balanceOf', [A.treasury]);
  check(freeEnd + obligEnd <= inventoryEnd, `${label}: treasury solvent at closure`);
  check(obligEnd === baseObligations, `${label}: treasury obligations back to baseline`, formatEther(obligEnd - baseObligations));
  check(
    free0 - freeEnd === totalClaimed,
    `${label}: reserved obligations equal rewards paid out exactly`,
    `paidOut=${formatEther(totalClaimed)} freeDelta=${formatEther(free0 - freeEnd)}`,
  );


  // -- invariants that must hold throughout
  check(/^0x0{40}$/i.test(await read(A.controller, abi.controller, 'oracle')), `${label}: oracle still 0x0`);
  check((await read(A.vault, abi.vault, 'hasRole', [EPOCH_ROLE, A.controller])) === false, `${label}: EPOCH_ROLE still unassigned`);
  check((await read(A.controller, abi.controller, 'hasRole', [PUBLISHER_ROLE, PUBLISHER])) === false, `${label}: PUBLISHER_ROLE still unassigned`);

  const principalSafe = withdrawOk && returned >= PRINCIPAL;
  const rewardPathOk = totalClaimed > 0n && (postGenesis === null || postGenesis.claimAvailablePostGenesis);
  const decision = !principalSafe
    ? 'BLOCKED'
    : rewardPathOk
      ? 'FULL_LIFECYCLE_PASS'
      : 'PRINCIPAL_SAFE_REWARD_PATH_BLOCKED';

  results[label] = {
    productId,
    forkWallet: user.address,
    lockSeconds: Number(lockSeconds),
    genesisAprBps: Number(genesisAprBps),
    floorBps: Number(floorBps),
    minPrincipal: minPrincipal.toString(),
    quote: {
      genesisRateBps: Number(qGenBps),
      genesisSeconds: Number(qGenSecs),
      genesisObligation: qGenObl.toString(),
      floorRateBps: Number(qFloorBps),
      floorObligation: qFloorObl.toString(),
    },
    openedAt,
    genesisEndAt,
    maturityAt,
    totalRewardsPaid: totalClaimed.toString(),
    principalReturned: returned.toString(),
    postGenesis,
    notes,
    blockers,
    decision,
  };
  console.log(`${label} decision: ${decision}`);
}

// ------------------------------------------------------------------- verdict
const forkPass = fail.length === 0;
const OUT = path.join(D, 'P3C1_FORK_LIFECYCLE.json');
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const mergedProducts = { ...(prev.products || {}), ...results };
const mergedRuns = [
  ...(prev.runs || []),
  {
    products: PRODUCTS.map((p) => NAMES[p]),
    chainId,
    blockNumber: Number(forkBlock.number),
    blockHash: forkBlock.hash,
    blockTimestamp: Number(forkBlock.timestamp),
    forkPass,
    failures: fail,
    checkCount: checks.length,
  },
];
const dec = (k) => mergedProducts[k]?.decision ?? 'BLOCKED';
const allPass = mergedRuns.every((r) => r.forkPass) && ['30D', '90D', '180D', '365D'].every((k) => mergedProducts[k]);
const out = {
  gate: 'V30.2B P3C.1 — accelerated BOT Mainnet fork lifecycle test',
  generatedAt: new Date().toISOString(),
  rpcSource: process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai',
  forkRpc: FORK_RPC,
  isolation: 'one product per process against a fresh mainnet fork',
  addresses: A,
  forkFunder: FORK_FUNDER,
  mainnetWrites: 0,
  oracle: oracle0,
  runs: mergedRuns,
  products: mergedProducts,
  verdict: {
    'P3C.1 FORK': allPass ? 'PASS' : 'BLOCKED',
    '30D': dec('30D'),
    '90D': dec('90D'),
    '180D': dec('180D'),
    '365D': dec('365D'),
    ORACLE: '0x0 UNCHANGED',
    'MAINNET WRITES': 0,
  },
  checks: [...(prev.checks || []), ...checks],
  failures: [...(prev.failures || []), ...fail],
};
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

console.log(`\n${forkPass ? 'P3C.1 FORK: PASS' : 'P3C.1 FORK: BLOCKED'}`);
for (const [k, v] of Object.entries(out.verdict)) console.log(`${k}: ${v}`);
if (fail.length) {
  console.log('\nfailures:');
  for (const f of fail) console.log(`  - ${f}`);
}
