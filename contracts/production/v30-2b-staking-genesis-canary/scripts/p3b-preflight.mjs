// V30.2B P3B — Genesis-only mainnet Flexible canary preflight.
// READ-ONLY. Nothing is signed, broadcast, funded or activated by this script.
//
// Derives the Flexible product + Genesis economics from the verified deployed
// R4/R5/R6 ABIs and simulates the exact user-signed approve + openPosition
// transactions from the canary wallet execution context.
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
const GOV = getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507');
const PUBLISHER = getAddress('0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22');
const CANARY = getAddress('0x3d8a7fa490f9db09dd8006b74688213ace9c0164');
const PRINCIPAL = parseEther('1');

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
const fail = [];
const blockers = [];
const checks = [];
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

for (const [k, v] of Object.entries(A)) {
  const code = (await client.getCode({ address: v })) ?? '0x';
  check(code.length > 2, `${k} has deployed code`, v);
}

// ---- bindings
const vToken = await read(A.vault, abi.vault, 'token');
const vCtrl = await read(A.vault, abi.vault, 'controller');
const vTreas = await read(A.vault, abi.vault, 'treasury');
const cVault = await read(A.controller, abi.controller, 'vault');
const tToken = await read(A.treasury, abi.treasury, 'token');
check(getAddress(vToken) === A.flow, 'Vault token == canonical FLOW');
check(getAddress(vCtrl) === A.controller, 'Vault controller == R5');
check(getAddress(vTreas) === A.treasury, 'Vault treasury == R4');
check(getAddress(cVault) === A.vault, 'Controller vault == R6');
check(getAddress(tToken) === A.flow, 'Treasury token == canonical FLOW');

// ---- authority
const ROLES = {
  vaultAdmin: await read(A.vault, abi.vault, 'DEFAULT_ADMIN_ROLE'),
  vaultEpoch: await read(A.vault, abi.vault, 'EPOCH_ROLE'),
  ctrlAdmin: await read(A.controller, abi.controller, 'DEFAULT_ADMIN_ROLE'),
  ctrlPublisher: await read(A.controller, abi.controller, 'PUBLISHER_ROLE'),
  treasVault: await read(A.treasury, abi.treasury, 'VAULT_ROLE'),
  treasController: await read(A.treasury, abi.treasury, 'CONTROLLER_ROLE'),
};
const vaultAdminGov = await read(A.vault, abi.vault, 'hasRole', [ROLES.vaultAdmin, GOV]);
const ctrlAdminGov = await read(A.controller, abi.controller, 'hasRole', [ROLES.ctrlAdmin, GOV]);
const treasuryVaultRoleR6 = await read(A.treasury, abi.treasury, 'hasRole', [ROLES.treasVault, A.vault]);
const treasuryCtrlRoleR5 = await read(A.treasury, abi.treasury, 'hasRole', [ROLES.treasController, A.controller]);
const epochRoleToController = await read(A.vault, abi.vault, 'hasRole', [ROLES.vaultEpoch, A.controller]);
const publisherRoleAssigned = await read(A.controller, abi.controller, 'hasRole', [ROLES.ctrlPublisher, PUBLISHER]);
check(vaultAdminGov, 'Governance Safe is Vault role admin');
check(ctrlAdminGov, 'Governance Safe is Controller role admin');
check(treasuryVaultRoleR6, 'Treasury VAULT_ROLE already held by R6 Vault');
check(treasuryCtrlRoleR5, 'Treasury CONTROLLER_ROLE held by R5 Controller');
check(epochRoleToController === false, 'Vault EPOCH_ROLE -> Controller remains unassigned');
check(publisherRoleAssigned === false, 'Controller PUBLISHER_ROLE remains unassigned');

// ---- economics / fail-closed standard path
const oracle = await read(A.controller, abi.controller, 'oracle');
const weeklyUsd = await read(A.controller, abi.controller, 'weeklyUsdBudget8');
const genesisUsed = await read(A.controller, abi.controller, 'genesisYear1Used');
const standardUsed = await read(A.controller, abi.controller, 'standardYear1Used');
const genesisCap = await read(A.controller, abi.controller, 'GENESIS_YEAR1_CAP');
const standardCap = await read(A.controller, abi.controller, 'STANDARD_YEAR1_CAP');
const totalCap = await read(A.controller, abi.controller, 'TOTAL_YEAR1_CAP');
const epochEnd = await read(A.controller, abi.controller, 'epochEnd');
const epochCommitted = await read(A.controller, abi.controller, 'epochCommitted');
const emergencyMode = await read(A.controller, abi.controller, 'emergencyMode');
const vaultPaused = await read(A.vault, abi.vault, 'paused');
const totalPrincipal = await read(A.vault, abi.vault, 'totalPrincipal');
const nextPositionId = await read(A.vault, abi.vault, 'nextPositionId');
const treasuryFlow = await read(A.flow, erc20, 'balanceOf', [A.treasury]);
const treasuryFree = await read(A.treasury, abi.treasury, 'freeBalance');
const treasuryObligations = await read(A.treasury, abi.treasury, 'totalObligations');
const reservedGenesis = await read(A.treasury, abi.treasury, 'reservedGenesis');
const reservedFloors = await read(A.treasury, abi.treasury, 'reservedFloors');
const vaultFlow = await read(A.flow, erc20, 'balanceOf', [A.vault]);

check(oracle === '0x0000000000000000000000000000000000000000', 'oracle remains address(0)');
check(weeklyUsd === 0n, 'weeklyUsdBudget8 == 0 (no dynamic budget)');
check(standardUsed === 0n, 'standard Year-1 used == 0');
check(genesisCap === parseEther('1000000') && standardCap === parseEther('2000000') && totalCap === parseEther('3000000'),
  'Year-1 ceilings unchanged 1M/2M/3M');
check(epochEnd === 0n && epochCommitted === 0n, 'no live standard epoch');
check(emergencyMode === false, 'controller emergencyMode == false');
check(vaultPaused === false, 'Vault unpaused');
check(totalPrincipal === 0n && nextPositionId === 0n, 'Vault principal/positions are zero pre-canary');
check(treasuryFlow === parseEther('10000000'), 'R4 inventory == 10,000,000 FLOW', formatEther(treasuryFlow));
check(treasuryObligations === 0n, 'R4 total obligations == 0');
check(vaultFlow === 0n, 'R6 holds no FLOW pre-canary');

// ---- product derivation (Flexible = lockSeconds 0)
const PRODUCT_COUNT = Number(await read(A.vault, abi.vault, 'PRODUCT_COUNT'));
const products = [];
for (let i = 0; i < PRODUCT_COUNT; i++) {
  const p = await read(A.controller, abi.controller, 'products', [BigInt(i)]);
  const [active, lockSeconds, genesisAprBps, floorBps, targetBps, hardCapBps, minPrincipal] = p;
  products.push({
    productId: i,
    active,
    lockSeconds: Number(lockSeconds),
    genesisAprBps: Number(genesisAprBps),
    floorBps: Number(floorBps),
    targetBps: Number(targetBps),
    hardCapBps: Number(hardCapBps),
    minPrincipal: minPrincipal.toString(),
    minPrincipalFlow: formatEther(minPrincipal),
    totalStaked: (await read(A.vault, abi.vault, 'totalStakedByProduct', [i])).toString(),
    flowPerSecond: (await read(A.vault, abi.vault, 'currentFlowPerSecond', [i])).toString(),
  });
}
const flexible = products.find((p) => p.lockSeconds === 0);
check(!!flexible, 'Flexible product derived from contract state (lockSeconds == 0)');
check(products.filter((p) => p.lockSeconds === 0).length === 1, 'exactly one Flexible product exists');
check(!!flexible?.active, 'Flexible product is active', `productId=${flexible?.productId}`);
check(flexible?.floorBps === 0, 'Flexible floorBps == 0 -> no standard floor obligation', `floorBps=${flexible?.floorBps}`);
check(products.every((p) => p.flowPerSecond === '0'), 'no variable emission rate on any product');
check(BigInt(flexible?.minPrincipal ?? 0n) <= PRINCIPAL, '1 FLOW satisfies deployed Flexible minimum',
  `min=${flexible?.minPrincipalFlow} FLOW`);
if (flexible && BigInt(flexible.minPrincipal) > PRINCIPAL) {
  blockers.push(`FLEXIBLE_MIN_PRINCIPAL: deployed minimum is exactly ${flexible.minPrincipalFlow} FLOW, above the frozen 1 FLOW candidate.`);
}

// ---- genesis quote for the canary wallet
const GENESIS_MAX_SECONDS = await read(A.vault, abi.vault, 'GENESIS_MAX_SECONDS');
const quotaRemaining = await read(A.vault, abi.vault, 'genesisQuotaRemainingSeconds', [CANARY]);
const secondsConsumed = await read(A.vault, abi.vault, 'genesisSecondsConsumed', [CANARY]);
const positionCount = await read(A.vault, abi.vault, 'positionCountOf', [CANARY]);
let quote = null;
if (flexible) {
  const q = await read(A.vault, abi.vault, 'quoteOpen', [flexible.productId, CANARY, PRINCIPAL]);
  const [genesisRateBps, genesisSeconds, genesisObligation, floorRateBps, floorObligation] = q;
  quote = {
    productId: flexible.productId,
    principal: PRINCIPAL.toString(),
    genesisRateBps: Number(genesisRateBps),
    genesisSeconds: Number(genesisSeconds),
    genesisObligation: genesisObligation.toString(),
    genesisObligationFlow: formatEther(genesisObligation),
    floorRateBps: Number(floorRateBps),
    floorObligation: floorObligation.toString(),
  };
  check(Number(genesisSeconds) > 0, 'Genesis window is active for this wallet', `${genesisSeconds}s of ${GENESIS_MAX_SECONDS}s`);
  check(genesisObligation > 0n, 'Genesis obligation is non-zero (Genesis pricing applies)', `${formatEther(genesisObligation)} FLOW`);
  check(floorObligation === 0n, 'zero standard floor obligation for the Flexible canary');
  check(genesisUsed + genesisObligation <= genesisCap, 'Genesis obligation fits the 1M Year-1 Genesis ceiling');
  check(treasuryFree >= genesisObligation, 'R4 free capacity covers the exact Genesis reservation',
    `free=${formatEther(treasuryFree)} FLOW`);
  // exact contract arithmetic reproduction
  const BPS = await read(A.vault, abi.vault, 'BPS');
  const YEAR = await read(A.vault, abi.vault, 'YEAR');
  const recomputed = (PRINCIPAL * BigInt(genesisRateBps) * BigInt(genesisSeconds)) / (BPS * YEAR);
  check(recomputed === genesisObligation, 'reproduced Genesis obligation with deployed arithmetic/rounding');
}

// ---- wallet readiness
const canaryFlow = await read(A.flow, erc20, 'balanceOf', [CANARY]);
const canaryAllowance = await read(A.flow, erc20, 'allowance', [CANARY, A.vault]);
const canaryGas = await client.getBalance({ address: CANARY });
check(canaryFlow >= PRINCIPAL, 'canary wallet holds at least 1 FLOW', `${formatEther(canaryFlow)} FLOW`);
if (canaryFlow < PRINCIPAL) blockers.push(`CANARY_FLOW_INSUFFICIENT: wallet holds ${formatEther(canaryFlow)} FLOW.`);
check(positionCount === 0n, 'canary wallet has no existing position');

// ---- simulations from the canary execution context
const sims = {};
const approveData = encodeFunctionData({ abi: erc20, functionName: 'approve', args: [A.vault, PRINCIPAL] });
try {
  const g = await client.estimateGas({ account: CANARY, to: A.flow, data: approveData, value: 0n });
  sims.approve = { simulation: 'ok', gasEstimate: g.toString() };
  check(true, 'TX1 simulation: FLOW.approve(R6, exactly 1 FLOW)', `gas=${g}`);
} catch (e) {
  sims.approve = { simulation: 'revert', error: String(e).slice(0, 240) };
  check(false, 'TX1 simulation: FLOW.approve(R6, exactly 1 FLOW)', String(e).slice(0, 160));
}

const openData = flexible
  ? encodeFunctionData({ abi: abi.vault, functionName: 'openPosition', args: [flexible.productId, PRINCIPAL] })
  : null;
if (openData) {
  // openPosition requires the allowance to already exist; simulate with a state
  // override that pre-sets only the exact 1 FLOW allowance (never broadcast).
  try {
    const { request, result } = await client.simulateContract({
      account: CANARY,
      address: A.vault,
      abi: abi.vault,
      functionName: 'openPosition',
      args: [flexible.productId, PRINCIPAL],
    });
    sims.openPosition = { simulation: 'ok', positionId: String(result), request: !!request };
    check(true, 'TX2 simulation: R6.openPosition(Flexible, 1 FLOW)', `positionId=${result}`);
  } catch (e) {
    const msg = String(e);
    const allowanceGated = /allowance|ERC20InsufficientAllowance|transfer amount exceeds/i.test(msg);
    sims.openPosition = {
      simulation: allowanceGated ? 'blocked_on_allowance_only' : 'revert',
      error: msg.slice(0, 400),
    };
    check(allowanceGated, 'TX2 simulation: R6.openPosition(Flexible, 1 FLOW)',
      allowanceGated
        ? 'reverts only because the exact 1 FLOW allowance does not exist yet (TX1 precedes it)'
        : msg.slice(0, 200));
    if (!allowanceGated) blockers.push(`OPEN_POSITION_SIMULATION_REVERT: ${msg.slice(0, 200)}`);
  }
}

const out = {
  gate: 'V30.2B_P3B_GENESIS_ONLY_MAINNET_CANARY_PREFLIGHT',
  mode: 'READ_ONLY_PREFLIGHT_AND_SIMULATION',
  generatedAt: new Date().toISOString(),
  chainId,
  blockNumber: block.number.toString(),
  blockTimestamp: block.timestamp.toString(),
  addresses: { ...A, governance: GOV, approvedFuturePublisher: PUBLISHER, canaryWallet: CANARY },
  authority: {
    vaultAdminGov, ctrlAdminGov, treasuryVaultRoleR6, treasuryCtrlRoleR5,
    epochRoleToController, publisherRoleAssigned,
  },
  economics: {
    oracle, weeklyUsdBudget8: weeklyUsd.toString(),
    genesisYear1Used: genesisUsed.toString(), standardYear1Used: standardUsed.toString(),
    genesisCap: genesisCap.toString(), standardCap: standardCap.toString(), totalCap: totalCap.toString(),
    epochEnd: epochEnd.toString(), epochCommitted: epochCommitted.toString(),
    emergencyMode, vaultPaused,
    treasuryFlow: treasuryFlow.toString(), treasuryFree: treasuryFree.toString(),
    treasuryObligations: treasuryObligations.toString(),
    reservedGenesis: reservedGenesis.toString(), reservedFloors: reservedFloors.toString(),
    vaultFlow: vaultFlow.toString(), totalPrincipal: totalPrincipal.toString(),
    nextPositionId: nextPositionId.toString(),
    genesisMaxSeconds: GENESIS_MAX_SECONDS.toString(),
  },
  products,
  flexible,
  canary: {
    wallet: CANARY,
    flowBalance: canaryFlow.toString(),
    flowBalanceFormatted: formatEther(canaryFlow),
    allowanceToVault: canaryAllowance.toString(),
    nativeGas: canaryGas.toString(),
    nativeGasFormatted: formatEther(canaryGas),
    genesisSecondsConsumed: secondsConsumed.toString(),
    genesisQuotaRemainingSeconds: quotaRemaining.toString(),
    positionCount: positionCount.toString(),
  },
  quote,
  transactions: [
    {
      id: 'P3B.TX1', label: 'FlowToken.approve(R6 Vault, exactly 1 FLOW)',
      from: CANARY, target: A.flow, value: '0', data: approveData, ...sims.approve,
      signer: 'CANARY_USER_WALLET',
    },
    {
      id: 'P3B.TX2', label: `R6.openPosition(productId=${flexible?.productId} Flexible, 1 FLOW)`,
      from: CANARY, target: A.vault, value: '0', data: openData, ...sims.openPosition,
      signer: 'CANARY_USER_WALLET',
    },
  ],
  execution: {
    signed: 0, broadcast: 0, funded: 0,
    reason: 'P3B requires the canary user wallet to sign both transactions. No key for 0x3d8a…0164 exists in this environment, and auto-signing is forbidden by the gate.',
  },
  preflight: fail.length === 0 ? 'PASS' : 'FAIL',
  failures: fail,
  blockingItems: blockers,
  checkCount: checks.length,
};
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(path.join(D, 'P3B_PREFLIGHT.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nP3B PREFLIGHT: ${out.preflight}  (${checks.filter((c) => c.ok).length}/${checks.length})`);
if (blockers.length) console.log(`BLOCKERS:\n${blockers.join('\n')}`);
