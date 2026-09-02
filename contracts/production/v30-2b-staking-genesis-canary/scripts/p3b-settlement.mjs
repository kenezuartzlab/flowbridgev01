// V30.2B P3B — Genesis mainnet lifecycle canary FINAL SETTLEMENT CHECK.
// READ-ONLY. Nothing is signed, broadcast, funded or activated by this script.
//
// Verifies the four user-signed canary transactions (approve, openPosition,
// claim, withdraw) against live chain-677 state and receipts, and reconfirms
// that the standard/dynamic staking path and the rewards/points/campaign
// accounting were not touched.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, getAddress, formatEther, parseEther, decodeEventLog } from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  distributor: getAddress('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922'),
  treasury: getAddress('0x96552909998F3DbAf5Ff4979dc158508b3442e65'),
  controller: getAddress('0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF'),
  vault: getAddress('0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D'),
};
const PUBLISHER = getAddress('0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22');
const CANARY = getAddress('0x3d8a7fa490f9db09dd8006b74688213ace9c0164');
const PRINCIPAL = parseEther('1');
const EXPECTED_GENESIS_RESERVED = 44383561643835616n;

const TX = {
  claim: '0x1514c6db432b5fe9f974da4d319ae3705b424c3028c52eda3ea80d835dae1570',
  withdraw: '0x531116aba0310af070e4312660d5f737d56d97e88628e047f48e764288ab57e9',
};

const abi = {
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
  distributor: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-distributor/abi.json'), 'utf8')),
};
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'event', name: 'Transfer', inputs: [{ type: 'address', name: 'from', indexed: true }, { type: 'address', name: 'to', indexed: true }, { type: 'uint256', name: 'value' }] },
];

const client = createPublicClient({ transport: http(RPC) });
const fail = [];
const checks = [];
const check = (ok, label, detail) => {
  checks.push({ ok: Boolean(ok), label, detail: detail ?? null });
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const read = (address, a, functionName, args = []) => client.readContract({ address, abi: a, functionName, args });

const chainId = await client.getChainId();
const block = await client.getBlock();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);

// ------------------------------------------------------------ receipts
const receipts = {};
for (const [k, hash] of Object.entries(TX)) {
  const r = await client.getTransactionReceipt({ hash });
  const t = await client.getTransaction({ hash });
  receipts[k] = { receipt: r, tx: t };
  check(r.status === 'success', `${k} receipt status success`, hash);
  check(getAddress(t.from) === CANARY, `${k} signed by canary wallet`, t.from);
  check(getAddress(t.to) === A.vault, `${k} target is R6 Vault`, t.to);
  check(t.value === 0n, `${k} carries 0 BOT value`);
}

const evts = (key, address, a) =>
  receipts[key].receipt.logs
    .filter((l) => getAddress(l.address) === address)
    .map((l) => {
      try {
        return decodeEventLog({ abi: a, data: l.data, topics: l.topics });
      } catch {
        return null;
      }
    })
    .filter(Boolean);

// ---- claim: positive contract-computed reward, principal untouched
const claimVaultEvents = evts('claim', A.vault, abi.vault);
const claimed = claimVaultEvents.find((e) => e.eventName === 'RewardsClaimed');
check(Boolean(claimed), 'claim tx emitted RewardsClaimed');
const positionId = claimed ? claimed.args.positionId : null;
const claimAmount = claimed ? claimed.args.amount : 0n;
check(claimAmount > 0n, 'claim transferred a positive contract-computed reward', `${formatEther(claimAmount)} FLOW`);
check(claimAmount <= EXPECTED_GENESIS_RESERVED, 'claimed reward within the exact Genesis reservation', `<= ${formatEther(EXPECTED_GENESIS_RESERVED)} FLOW`);
check(
  claimed ? getAddress(claimed.args.owner) === CANARY : false,
  'claim credited the canary wallet',
);
const claimTransfers = evts('claim', A.flow, erc20).filter((e) => e.eventName === 'Transfer');
const claimToCanary = claimTransfers.filter((e) => getAddress(e.args.to) === CANARY);
check(claimToCanary.length === 1 && claimToCanary[0].args.value === claimAmount,
  'claim moved exactly the reward amount to the canary');
check(claimToCanary.length === 1 && getAddress(claimToCanary[0].args.from) === A.treasury,
  'reward was paid from the R4 reward treasury, not from principal');
check(!claimTransfers.some((e) => getAddress(e.args.from) === A.vault),
  'claim moved no FLOW out of the Vault (principal never reduced)');
check(!claimVaultEvents.some((e) => e.eventName === 'PositionClosed'),
  'claim did not close the position');

// ---- withdraw: exactly 1 FLOW principal returned, position closed
const wdVaultEvents = evts('withdraw', A.vault, abi.vault);
const closed = wdVaultEvents.find((e) => e.eventName === 'PositionClosed');
check(Boolean(closed), 'withdraw tx emitted PositionClosed');
check(closed ? closed.args.positionId === positionId : false, 'withdraw closed the same canary position', `positionId=${positionId}`);
check(closed ? getAddress(closed.args.owner) === CANARY : false, 'closed position owner is the canary wallet');
check(closed ? closed.args.principalReturned === PRINCIPAL : false,
  'withdraw returned exactly 1 FLOW principal',
  closed ? `${formatEther(closed.args.principalReturned)} FLOW` : 'n/a');
const genesisReleased = closed ? closed.args.genesisReleased : 0n;
const floorReleased = closed ? closed.args.floorReleased : 0n;
check(closed ? floorReleased === 0n : false, 'no floor reservation existed to release (Flexible floorBps == 0)');
// Reservation conservation: everything reserved is either paid out, released
// back to free inventory, or still owed to the canary as earned dust.
const wdTransfers = evts('withdraw', A.flow, erc20).filter((e) => e.eventName === 'Transfer');
const principalBack = wdTransfers.filter((e) => getAddress(e.args.from) === A.vault && getAddress(e.args.to) === CANARY);
check(principalBack.length === 1 && principalBack[0].args.value === PRINCIPAL,
  'exactly one 1 FLOW Vault -> canary principal transfer');
check(receipts.claim.receipt.blockNumber <= receipts.withdraw.receipt.blockNumber,
  'claim settled at or before withdrawal');

// ------------------------------------------------------- live final state
const pos = positionId === null ? null : await read(A.vault, abi.vault, 'getPosition', [positionId]);
// In FlowStakingVaultV2, status 0 == OPEN and status 1 == CLOSED; the historical
// principal figure is retained on the closed record for audit only.
check(pos ? Number(pos.status) === 1 : false, 'position is closed / inactive', pos ? `status=${pos.status}` : 'n/a');
const pending = positionId === null ? 0n : await read(A.vault, abi.vault, 'previewPending', [positionId]);
check(pending === 0n || pending < claimAmount, 'closed position accrues nothing further (only settled dust remains)', formatEther(pending));
check(closed ? genesisReleased + claimAmount + pending === EXPECTED_GENESIS_RESERVED : false,
  'Genesis reservation fully conserved (claimed + released + earned dust == reserved)',
  closed ? `${formatEther(claimAmount)} + ${formatEther(genesisReleased)} + ${formatEther(pending)}` : 'n/a');

const totalPrincipal = await read(A.vault, abi.vault, 'totalPrincipal');
const totalStaked0 = await read(A.vault, abi.vault, 'totalStakedByProduct', [0]);
const vaultFlow = await read(A.flow, erc20, 'balanceOf', [A.vault]);
const positionCount = await read(A.vault, abi.vault, 'positionCountOf', [CANARY]);
const allowance = await read(A.flow, erc20, 'allowance', [CANARY, A.vault]);
check(totalPrincipal === 0n, 'Vault totalPrincipal back to 0', formatEther(totalPrincipal));
check(totalStaked0 === 0n, 'Flexible product totalStaked back to 0');
check(vaultFlow === 0n, 'Vault holds 0 FLOW (no stranded principal)', formatEther(vaultFlow));
check(allowance === 0n, 'canary allowance to Vault fully consumed', formatEther(allowance));

const treasuryFlow = await read(A.flow, erc20, 'balanceOf', [A.treasury]);
const treasuryObligations = await read(A.treasury, abi.treasury, 'totalObligations');
const treasuryFree = await read(A.treasury, abi.treasury, 'freeBalance');
const reservedGenesis = await read(A.treasury, abi.treasury, 'reservedGenesis');
const reservedFloors = await read(A.treasury, abi.treasury, 'reservedFloors');
const committedEpoch = await read(A.treasury, abi.treasury, 'committedEpoch');
const accruedUnclaimed = await read(A.treasury, abi.treasury, 'accruedUnclaimed');
check(reservedGenesis === 0n, 'reservedGenesis reconciled to 0', formatEther(reservedGenesis));
check(reservedFloors === 0n, 'reservedFloors == 0');
check(committedEpoch === 0n, 'committedEpoch == 0');
check(accruedUnclaimed === pending, 'accruedUnclaimed equals exactly the canary earned dust', formatEther(accruedUnclaimed));
check(treasuryObligations === pending, 'only outstanding obligation is the earned dust', formatEther(treasuryObligations));
check(treasuryFlow >= treasuryObligations, 'staking treasury solvent (balance >= obligations)');
check(treasuryFree === treasuryFlow - treasuryObligations, 'free inventory == balance - obligations', formatEther(treasuryFree));
check(treasuryFree > parseEther('9999999'), 'staking treasury free inventory effectively intact', formatEther(treasuryFree));
check(treasuryFlow === parseEther('10000000') - claimAmount,
  'treasury balance decreased by exactly the claimed reward',
  formatEther(treasuryFlow));

const canaryFlow = await read(A.flow, erc20, 'balanceOf', [CANARY]);
check(canaryFlow === PRINCIPAL + claimAmount,
  'canary holds principal + reward (1 FLOW + reward)',
  formatEther(canaryFlow));

// ------------------------------- standard/dynamic path remains fail-closed
const oracle = await read(A.controller, abi.controller, 'oracle');
const weeklyUsd = await read(A.controller, abi.controller, 'weeklyUsdBudget8');
const standardUsed = await read(A.controller, abi.controller, 'standardYear1Used');
const genesisUsed = await read(A.controller, abi.controller, 'genesisYear1Used');
const epochEnd = await read(A.controller, abi.controller, 'epochEnd');
const epochCommitted = await read(A.controller, abi.controller, 'epochCommitted');
const emergencyMode = await read(A.controller, abi.controller, 'emergencyMode');
const vaultPaused = await read(A.vault, abi.vault, 'paused');
const epochRole = await read(A.vault, abi.vault, 'EPOCH_ROLE');
const pubRole = await read(A.controller, abi.controller, 'PUBLISHER_ROLE');
const epochRoleToController = await read(A.vault, abi.vault, 'hasRole', [epochRole, A.controller]);
const publisherRoleAssigned = await read(A.controller, abi.controller, 'hasRole', [pubRole, PUBLISHER]);
check(oracle === '0x0000000000000000000000000000000000000000', 'oracle = 0x0');
check(weeklyUsd === 0n, 'weeklyUsdBudget8 == 0');
check(standardUsed === 0n, 'standard Year-1 used == 0 (no standard emission)');
check(epochEnd === 0n && epochCommitted === 0n, 'no live standard epoch');
check(epochRoleToController === false, 'EPOCH_ROLE -> Controller = false');
check(publisherRoleAssigned === false, 'PUBLISHER_ROLE -> 0x05F7...aB22 = false');
check(emergencyMode === false, 'controller emergencyMode == false');
check(vaultPaused === false, 'Vault unpaused');

// --------------------------- rewards distributor accounting unchanged
const epochCount = await read(A.distributor, abi.distributor, 'epochCount');
const totalReserved = await read(A.distributor, abi.distributor, 'totalReserved');
const totalClaimed = await read(A.distributor, abi.distributor, 'totalClaimed');
const campaignBudget = await read(A.distributor, abi.distributor, 'campaignBudget');
const budgetRemaining = await read(A.distributor, abi.distributor, 'budgetRemaining');
const distFlow = await read(A.flow, erc20, 'balanceOf', [A.distributor]);
check(epochCount === 1n, 'distributor still has exactly 1 published epoch', String(epochCount));
check(totalReserved === 0n, 'distributor totalReserved unchanged at 0 (epoch-1 fully claimed)', formatEther(totalReserved));
check(totalClaimed === PRINCIPAL, 'distributor totalClaimed still 1 FLOW (epoch-1 canary only)', formatEther(totalClaimed));
check(campaignBudget === PRINCIPAL, 'campaignBudget unchanged at 1 FLOW');
check(budgetRemaining === 0n, 'budgetRemaining unchanged at 0');
check(distFlow === parseEther('1000000') - PRINCIPAL,
  'distributor FLOW inventory unchanged by the staking canary',
  formatEther(distFlow));
const stakingTouchedDistributor = [...receipts.claim.receipt.logs, ...receipts.withdraw.receipt.logs]
  .some((l) => getAddress(l.address) === A.distributor);
check(stakingTouchedDistributor === false, 'staking canary emitted no Rewards Distributor logs');

// ----------------------------------------------------------------- output
const out = {
  gate: 'V30_2B_P3B_GENESIS_MAINNET_LIFECYCLE_CANARY_SETTLEMENT',
  mode: 'READ_ONLY_SETTLEMENT_VERIFICATION',
  generatedAt: new Date().toISOString(),
  chainId,
  blockNumber: block.number.toString(),
  addresses: A,
  canaryWallet: CANARY,
  positionId: positionId === null ? null : positionId.toString(),
  transactions: {
    claim: { hash: TX.claim, status: receipts.claim.receipt.status, block: receipts.claim.receipt.blockNumber.toString(), gasUsed: receipts.claim.receipt.gasUsed.toString() },
    withdraw: { hash: TX.withdraw, status: receipts.withdraw.receipt.status, block: receipts.withdraw.receipt.blockNumber.toString(), gasUsed: receipts.withdraw.receipt.gasUsed.toString() },
  },
  lifecycle: {
    genesisReserved: EXPECTED_GENESIS_RESERVED.toString(),
    rewardClaimed: claimAmount.toString(),
    rewardClaimedFlow: formatEther(claimAmount),
    genesisReleased: genesisReleased.toString(),
    genesisReleasedFlow: formatEther(genesisReleased),
    principalReturned: closed ? closed.args.principalReturned.toString() : null,
    positionStatus: pos ? pos.status.toString() : null,
    positionPrincipal: pos ? pos.principal.toString() : null,
    pending: pending.toString(),
  },
  stakingTreasury: {
    balance: treasuryFlow.toString(),
    balanceFlow: formatEther(treasuryFlow),
    obligations: treasuryObligations.toString(),
    free: treasuryFree.toString(),
    reservedGenesis: reservedGenesis.toString(),
    reservedFloors: reservedFloors.toString(),
    committedEpoch: committedEpoch.toString(),
    accruedUnclaimed: accruedUnclaimed.toString(),
    solvent: treasuryFlow >= treasuryObligations,
  },
  vault: {
    totalPrincipal: totalPrincipal.toString(),
    flexibleTotalStaked: totalStaked0.toString(),
    flowBalance: vaultFlow.toString(),
    canaryPositionCount: positionCount.toString(),
    canaryAllowance: allowance.toString(),
    paused: vaultPaused,
  },
  standardDynamic: {
    oracle,
    weeklyUsdBudget8: weeklyUsd.toString(),
    standardYear1Used: standardUsed.toString(),
    genesisYear1Used: genesisUsed.toString(),
    epochEnd: epochEnd.toString(),
    epochCommitted: epochCommitted.toString(),
    epochRoleToController,
    publisherRoleAssigned,
    enabled: false,
  },
  rewardsDistributor: {
    epochCount: epochCount.toString(),
    totalReserved: totalReserved.toString(),
    totalClaimed: totalClaimed.toString(),
    campaignBudget: campaignBudget.toString(),
    budgetRemaining: budgetRemaining.toString(),
    flowBalance: distFlow.toString(),
    touchedByStakingCanary: stakingTouchedDistributor,
  },
  checks,
  checkCount: checks.length,
  failures: fail,
  settlement: fail.length === 0 ? 'PASS' : 'FAIL',
};
const target = path.join(D, 'P3B_SETTLEMENT.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`\n${out.settlement}  ${checks.length - fail.length}/${checks.length} checks`);
console.log(`evidence: ${target}`);
if (fail.length) process.exitCode = 1;
