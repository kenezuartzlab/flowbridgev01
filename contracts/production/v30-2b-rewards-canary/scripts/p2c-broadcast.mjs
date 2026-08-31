// V30.2B P2C — publishEpoch broadcast (fail-closed).
// Signs and sends EXACTLY the frozen genesis canary epoch from the Root
// Publisher. Hard-stops on any precondition mismatch. Never funds, never
// enables claims, never touches FLOW balances.
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
  parseEther,
  formatEther,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { merkleClaimLeafHash } from '../../../../src/lib/rewards/merkleClaim.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIR = HERE.replace(/\/scripts$/, '');
const PROD = path.join(DIR, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const DELAY = 86_400;
const MARGIN = 900;

const FROZEN = {
  chainId: 677,
  epochId: 1,
  index: 0,
  recipient: '0x3d8a7fa490f9db09dd8006b74688213ace9c0164',
  entitlementWei: 1_000_000_000_000_000_000n,
  root: '0xe5cf2fb350d37fce3ee74757d19d671d96c69f756f15f3227bdb6d156e8e6456',
  proof: [],
};
const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  distributor: getAddress('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922'),
  publisher: getAddress('0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94'),
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

const pk = process.env.ROOT_PUBLISHER_KEY;
need(!!pk, 'ROOT_PUBLISHER_KEY is not set');
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
need(getAddress(account.address) === A.publisher, `key address ${account.address} is not the Root Publisher`);

need((await client.getChainId()) === 677, 'chain is not BOT Mainnet 677');

// frozen root reproduction
const leafOnchain = await read('leafHash', [BigInt(FROZEN.epochId), BigInt(FROZEN.index), getAddress(FROZEN.recipient), FROZEN.entitlementWei]);
need(leafOnchain === FROZEN.root, `on-chain leafHash mismatch ${leafOnchain}`);
const leafLocal = merkleClaimLeafHash({
  chainId: 677,
  distributor: A.distributor,
  leaf: { epochId: 1, index: 0, account: getAddress(FROZEN.recipient), amount: FROZEN.entitlementWei.toString() },
});
need(leafLocal === FROZEN.root, `local encoder mismatch ${leafLocal}`);
need(FROZEN.proof.length === 0, 'proof must be empty');

// live pre-state
const pre = {
  campaignBudget: await read('campaignBudget'),
  budgetRemaining: await read('budgetRemaining'),
  totalReserved: await read('totalReserved'),
  totalClaimed: await read('totalClaimed'),
  epochCount: await read('epochCount'),
  paused: await read('paused'),
};
const flowBal = await client.readContract({ address: A.flow, abi: erc20, functionName: 'balanceOf', args: [A.distributor] });
need(flowBal === parseEther('1000000'), `distributor FLOW balance ${formatEther(flowBal)}`);
need(pre.campaignBudget === FROZEN.entitlementWei, `campaignBudget ${pre.campaignBudget}`);
need(pre.budgetRemaining === FROZEN.entitlementWei, `budgetRemaining ${pre.budgetRemaining}`);
need(pre.totalReserved === 0n, `totalReserved ${pre.totalReserved}`);
need(pre.totalClaimed === 0n, `totalClaimed ${pre.totalClaimed}`);
need(pre.epochCount === 0n, `epochCount ${pre.epochCount}`);
need(pre.paused === false, 'distributor is paused');
const role = await read('PUBLISHER_ROLE');
need(await read('hasRole', [role, A.publisher]), 'publisher lacks PUBLISHER_ROLE');

// fresh scheduling
const latest = await client.getBlock();
const now = Number(latest.timestamp);
const claimStart = BigInt(now + DELAY + MARGIN);
const claimEnd = claimStart + 30n * 86_400n;
need(claimStart - BigInt(now) > 86_400n, 'claimStart delay must exceed 86,400s');

const args = [FROZEN.root, FROZEN.entitlementWei, claimStart, claimEnd];
const calldata = encodeFunctionData({ abi, functionName: 'publishEpoch', args });
const calldataKeccak = keccak256(calldata);

const sim = await client.simulateContract({ address: A.distributor, abi, functionName: 'publishEpoch', args, account: A.publisher });
need(String(sim.result) === '1', `simulation returned epochId ${String(sim.result)}`);

const gas = await client.estimateContractGas({ address: A.distributor, abi, functionName: 'publishEpoch', args, account: A.publisher });
const bufferedGas = (gas * 130n) / 100n;
const gasPrice = await client.getGasPrice();
const balance = await client.getBalance({ address: A.publisher });
need(balance >= bufferedGas * gasPrice, `publisher BOT balance ${formatEther(balance)} < required ${formatEther(bufferedGas * gasPrice)}`);
const nonce = await client.getTransactionCount({ address: A.publisher, blockTag: 'pending' });

console.log('claimStart', claimStart.toString(), new Date(Number(claimStart) * 1000).toISOString());
console.log('claimEnd  ', claimEnd.toString(), new Date(Number(claimEnd) * 1000).toISOString());
console.log('calldata keccak', calldataKeccak);
console.log('nonce', nonce, 'gas', gas.toString(), 'buffered', bufferedGas.toString());

const wallet = createWalletClient({ account, chain, transport: http(RPC) });
const hash = await wallet.sendTransaction({ to: A.distributor, data: calldata, gas: bufferedGas, gasPrice, nonce });
console.log('broadcast tx', hash);
const receipt = await client.waitForTransactionReceipt({ hash });
need(receipt.status === 'success', `receipt status ${receipt.status}`);

const post = {
  epochCount: await read('epochCount'),
  totalReserved: await read('totalReserved'),
  budgetRemaining: await read('budgetRemaining'),
  totalClaimed: await read('totalClaimed'),
  paused: await read('paused'),
};
const postFlow = await client.readContract({ address: A.flow, abi: erc20, functionName: 'balanceOf', args: [A.distributor] });
let claimsEnabled = null;
try {
  claimsEnabled = await read('rewardClaimsEnabled');
} catch {
  claimsEnabled = 'n/a';
}

const evidence = {
  gate: 'V30.2B P2C — genesis canary root publication (BROADCAST)',
  generatedAt: new Date().toISOString(),
  chainId: 677,
  transactionHash: hash,
  blockNumber: receipt.blockNumber.toString(),
  gasUsed: receipt.gasUsed.toString(),
  from: A.publisher,
  to: A.distributor,
  nonce,
  function: 'publishEpoch(bytes32,uint256,uint64,uint64)',
  args: {
    root: FROZEN.root,
    allocationWei: FROZEN.entitlementWei.toString(),
    claimStart: claimStart.toString(),
    claimStartIso: new Date(Number(claimStart) * 1000).toISOString(),
    claimEnd: claimEnd.toString(),
    claimEndIso: new Date(Number(claimEnd) * 1000).toISOString(),
  },
  calldata,
  calldataKeccak,
  postState: {
    epochCount: post.epochCount.toString(),
    totalReserved: post.totalReserved.toString(),
    budgetRemaining: post.budgetRemaining.toString(),
    totalClaimed: post.totalClaimed.toString(),
    paused: post.paused,
    distributorFlowBalance: formatEther(postFlow),
    rewardClaimsEnabled: claimsEnabled,
  },
  recipient: FROZEN.recipient,
  proof: [],
};
fs.writeFileSync(path.join(DIR, 'P2C_PUBLISH_SETTLEMENT.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence.postState, null, 2));
console.log('settlement written: P2C_PUBLISH_SETTLEMENT.json');
