// V32.2 — epoch 2 allocation publication PREPARE (read-only, fail-closed).
//
// Builds and validates the exact publishEpoch transaction that would make the
// funded 10 FLOW canary allocation claimable on BOT Mainnet 677. It NEVER signs
// or broadcasts: it simulates with eth_call, regenerates the calldata from the
// live contract, and writes a prepared transaction for the Root Publisher to sign.
//
// The shipped allocation module (src/lib/rewards/mainnetEpochDraft.ts) is the
// single source of truth for the root, amount and claim schedule — this script
// only checks that those values still hold on chain.
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  keccak256,
  formatEther,
  getAddress,
} from 'viem';
import { merkleClaimLeafHash } from '../../../../src/lib/rewards/merkleClaim.ts';
import { MAINNET_EPOCH_DRAFTS } from '../../../../src/lib/rewards/mainnetEpochDraft.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIR = HERE.replace(/\/scripts$/, '');
const PROD = path.join(DIR, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

const DRAFT = MAINNET_EPOCH_DRAFTS[0];
const LEAF = DRAFT.entitlements[0];
const AMOUNT = BigInt(LEAF.amount);

const RESERVATIONS = [
  { ledgerId: '9dd76b75-7073-445e-b9d8-cfc4b7b67e86', points: 5, evidence: '677:0x96942495a02ef6dacf3c5c9d80a0ee84fd5d43be9a5a729be1a8de99e85e68dd' },
  { ledgerId: '306a91ff-88da-40a3-b822-21e3fe6c32a6', points: 5, evidence: '677:0xe7985c949f7a419c0ec1ad1891a7c19c23df0ecd0c82caa0abedefbc98bdaf6a' },
];

const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  distributor: getAddress(DRAFT.distributor),
  publisher: getAddress('0x971E7790FE6C8F77dc666Bb05D4aedA362653f94'),
};

const abi = JSON.parse(fs.readFileSync(path.join(PROD, 'v30-2b-distributor/abi.json'), 'utf8'));
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const chain = { id: 677, name: 'BOT Mainnet', nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const client = createPublicClient({ chain, transport: http(RPC) });
const read = (fn, args = []) => client.readContract({ address: A.distributor, abi, functionName: fn, args });

const stop = (msg) => {
  console.error('HARD STOP:', msg);
  process.exit(1);
};
const need = (cond, msg) => {
  if (!cond) stop(msg);
};

need(DRAFT.chainId === 677, 'the shipped draft is not a BOT Mainnet allocation');
need((await client.getChainId()) === 677, 'chain is not BOT Mainnet 677');
const recipient = getAddress(LEAF.account);

// ---- live pre-state -------------------------------------------------------
const pre = {
  campaignBudget: await read('campaignBudget'),
  budgetRemaining: await read('budgetRemaining'),
  totalReserved: await read('totalReserved'),
  totalClaimed: await read('totalClaimed'),
  epochCount: await read('epochCount'),
  paused: await read('paused'),
  minPublishDelay: await read('minPublishDelay'),
};
const flowBal = await client.readContract({ address: A.flow, abi: erc20, functionName: 'balanceOf', args: [A.distributor] });
const role = await read('PUBLISHER_ROLE');
const publisherIsPublisher = await read('hasRole', [role, A.publisher]);

need(pre.paused === false, 'distributor is paused');
need(pre.epochCount === BigInt(DRAFT.epochId - 1), `epochCount ${pre.epochCount} must be ${DRAFT.epochId - 1} — this root binds epochId ${DRAFT.epochId}`);
need(publisherIsPublisher, 'publisher lacks PUBLISHER_ROLE');
need(pre.budgetRemaining >= AMOUNT, `budgetRemaining ${pre.budgetRemaining} < ${AMOUNT}`);
need(flowBal >= pre.totalReserved + AMOUNT, `FLOW balance ${flowBal} cannot cover totalReserved + allocation`);

// ---- root reproduction (single leaf => root == leafHash, empty proof) ------
const rootLocal = merkleClaimLeafHash({
  chainId: DRAFT.chainId,
  distributor: A.distributor,
  leaf: { epochId: LEAF.epochId, index: LEAF.index, account: LEAF.account, amount: LEAF.amount },
});
need(rootLocal === DRAFT.root, `local encoder ${rootLocal} != shipped draft root ${DRAFT.root}`);
const rootOnchain = await read('leafHash', [BigInt(DRAFT.epochId), BigInt(LEAF.index), recipient, AMOUNT]);
need(rootOnchain === DRAFT.root, `on-chain leafHash ${rootOnchain} != shipped draft root ${DRAFT.root}`);
need(LEAF.proof.length === 0, 'single-leaf allocation must carry an empty proof');

// ---- shipped schedule ----------------------------------------------------
const latest = await client.getBlock();
const now = BigInt(latest.timestamp);
const claimStart = BigInt(DRAFT.claimStart);
const claimEnd = BigInt(DRAFT.claimEnd);
const signBefore = BigInt(DRAFT.signBefore);
need(now < signBefore, `the prepared publication window closed at ${new Date(Number(signBefore) * 1000).toISOString()}`);
need(claimStart - now > BigInt(pre.minPublishDelay), 'claimStart must stay clear of minPublishDelay');
need(claimEnd > claimStart, 'claim window must end after it opens');

// ---- calldata + read-only simulation ------------------------------------
const args = [DRAFT.root, AMOUNT, claimStart, claimEnd];
const calldata = encodeFunctionData({ abi, functionName: 'publishEpoch', args });
const calldataKeccak = keccak256(calldata);
const sim = await client.simulateContract({ address: A.distributor, abi, functionName: 'publishEpoch', args, account: A.publisher });
need(String(sim.result) === String(DRAFT.epochId), `simulation returned epochId ${String(sim.result)}`);

const gas = await client.estimateContractGas({ address: A.distributor, abi, functionName: 'publishEpoch', args, account: A.publisher });
const bufferedGas = (gas * 130n) / 100n;
const gasPrice = await client.getGasPrice();
const botBal = await client.getBalance({ address: A.publisher });
need(botBal >= bufferedGas * gasPrice, `publisher BOT balance ${formatEther(botBal)} < required ${formatEther(bufferedGas * gasPrice)}`);
const nonce = await client.getTransactionCount({ address: A.publisher, blockTag: 'pending' });

const evidence = {
  gate: 'V32.2 — funded 10 FLOW canary allocation publication (PREPARED, NOT SIGNED)',
  generatedAt: new Date().toISOString(),
  chainId: 677,
  from: A.publisher,
  to: A.distributor,
  nonce,
  function: 'publishEpoch(bytes32,uint256,uint64,uint64)',
  args: {
    root: DRAFT.root,
    allocationWei: AMOUNT.toString(),
    claimStart: claimStart.toString(),
    claimStartIso: new Date(Number(claimStart) * 1000).toISOString(),
    claimEnd: claimEnd.toString(),
    claimEndIso: new Date(Number(claimEnd) * 1000).toISOString(),
  },
  calldata,
  calldataKeccak,
  gas: gas.toString(),
  bufferedGas: bufferedGas.toString(),
  gasPriceWei: gasPrice.toString(),
  value: '0',
  signed: false,
  broadcast: false,
  sourceOfTruth: 'src/lib/rewards/mainnetEpochDraft.ts',
  preState: {
    blockNumber: latest.number.toString(),
    campaignBudget: pre.campaignBudget.toString(),
    budgetRemaining: pre.budgetRemaining.toString(),
    totalReserved: pre.totalReserved.toString(),
    totalClaimed: pre.totalClaimed.toString(),
    epochCount: pre.epochCount.toString(),
    paused: pre.paused,
    minPublishDelay: pre.minPublishDelay.toString(),
    distributorFlowBalance: formatEther(flowBal),
    publisherBotBalance: formatEther(botBal),
  },
  allocation: {
    epochId: DRAFT.epochId,
    index: LEAF.index,
    recipient,
    amountWei: AMOUNT.toString(),
    amountFlow: '10',
    proof: LEAF.proof,
    programId: DRAFT.programId,
    reservations: RESERVATIONS,
  },
  preconditions: {
    mustStillHold: [
      `epochCount must still be ${DRAFT.epochId - 1} when this is signed — the root binds epochId ${DRAFT.epochId}`,
      'distributor must not be paused',
      `budgetRemaining must stay >= ${AMOUNT}`,
      `FLOW balance must stay >= totalReserved + ${AMOUNT}`,
      `must be signed before ${new Date(Number(signBefore) * 1000).toISOString()} (claimStart - minPublishDelay) or publishEpoch reverts`,
    ],
  },
};

fs.writeFileSync(path.join(DIR, 'V32_2_PUBLISH_TX_PREPARED.json'), JSON.stringify(evidence, null, 2));
console.log('root              ', DRAFT.root);
console.log('claimStart        ', claimStart.toString(), new Date(Number(claimStart) * 1000).toISOString());
console.log('claimEnd          ', claimEnd.toString(), new Date(Number(claimEnd) * 1000).toISOString());
console.log('sign before       ', new Date(Number(signBefore) * 1000).toISOString());
console.log('calldata keccak   ', calldataKeccak);
console.log('nonce', nonce, 'gas', gas.toString(), 'buffered', bufferedGas.toString());
console.log('preState', JSON.stringify(evidence.preState, null, 2));
console.log('prepared written: V32_2_PUBLISH_TX_PREPARED.json');
