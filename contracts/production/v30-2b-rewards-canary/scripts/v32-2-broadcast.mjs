// V32.2 — epoch 2 publishEpoch broadcast (fail-closed). Sends EXACTLY the
// prepared calldata in V32_2_PUBLISH_TX_PREPARED.json from the Root Publisher.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, encodeFunctionData, keccak256, formatEther, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { merkleClaimLeafHash } from '../../../../src/lib/rewards/merkleClaim.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIR = HERE.replace(/\/scripts$/, '');
const PROD = path.join(DIR, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const P = JSON.parse(fs.readFileSync(path.join(DIR, 'V32_2_PUBLISH_TX_PREPARED.json'), 'utf8'));
const abi = JSON.parse(fs.readFileSync(path.join(PROD, 'v30-2b-distributor/abi.json'), 'utf8'));
const stop = (m) => { console.error('HARD STOP:', m); process.exit(1); };
const need = (c, m) => { if (!c) stop(m); };

const distributor = getAddress(P.to);
const publisher = getAddress(P.from);
const flow = getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF');
const chain = { id: 677, name: 'BOT Mainnet', nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const client = createPublicClient({ chain, transport: http(RPC) });
const read = (fn, args = []) => client.readContract({ address: distributor, abi, functionName: fn, args });

const pk = process.env.ROOT_PUBLISHER_KEY; need(!!pk, 'key missing');
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
need(getAddress(account.address) === publisher, 'key is not the Root Publisher');
need((await client.getChainId()) === 677, 'not chain 677');

const a = P.allocation; const amount = BigInt(a.amountWei);
const leafLocal = merkleClaimLeafHash({ chainId: 677, distributor, leaf: { epochId: a.epochId, index: a.index, account: getAddress(a.recipient), amount: a.amountWei } });
need(leafLocal === P.args.root, 'local leaf != root');
need((await read('leafHash', [BigInt(a.epochId), BigInt(a.index), getAddress(a.recipient), amount])) === P.args.root, 'on-chain leaf != root');

const args = [P.args.root, amount, BigInt(P.args.claimStart), BigInt(P.args.claimEnd)];
const calldata = encodeFunctionData({ abi, functionName: 'publishEpoch', args });
need(calldata === P.calldata, 'calldata mismatch');

need((await read('epochCount')) === 1n, 'epochCount != 1');
need((await read('paused')) === false, 'paused');
need((await read('budgetRemaining')) >= amount, 'budget');
const now = Number((await client.getBlock()).timestamp);
need(BigInt(P.args.claimStart) - BigInt(now) >= 86400n + 60n, 'publish window passed');
const sim = await client.simulateContract({ address: distributor, abi, functionName: 'publishEpoch', args, account: publisher });
need(String(sim.result) === '2', `sim epochId ${sim.result}`);
const gas = await client.estimateContractGas({ address: distributor, abi, functionName: 'publishEpoch', args, account: publisher });
const bufferedGas = (gas * 130n) / 100n;
const gasPrice = await client.getGasPrice();
const nonce = await client.getTransactionCount({ address: publisher, blockTag: 'pending' });

const wallet = createWalletClient({ account, chain, transport: http(RPC) });
const hash = await wallet.sendTransaction({ to: distributor, data: calldata, gas: bufferedGas, gasPrice, nonce });
console.log('broadcast tx', hash);
const r = await client.waitForTransactionReceipt({ hash });
need(r.status === 'success', `receipt ${r.status}`);
const erc20 = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }];
const post = {
  epochCount: (await read('epochCount')).toString(),
  totalReserved: (await read('totalReserved')).toString(),
  totalClaimed: (await read('totalClaimed')).toString(),
  budgetRemaining: (await read('budgetRemaining')).toString(),
  paused: await read('paused'),
  distributorFlowBalance: formatEther(await client.readContract({ address: flow, abi: erc20, functionName: 'balanceOf', args: [distributor] })),
};
const ev = { gate: 'V32.2 — epoch 2 publication (BROADCAST)', generatedAt: new Date().toISOString(), chainId: 677, transactionHash: hash, blockNumber: r.blockNumber.toString(), gasUsed: r.gasUsed.toString(), from: publisher, to: distributor, nonce, calldata, calldataKeccak: keccak256(calldata), args: P.args, allocation: a, postState: post };
fs.writeFileSync(path.join(DIR, 'V32_2_PUBLISH_SETTLEMENT.json'), JSON.stringify(ev, null, 2));
console.log(JSON.stringify(ev, null, 2));
