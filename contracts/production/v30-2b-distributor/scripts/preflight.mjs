// V30.2B R2 preflight — read-only. Encodes constructor args, predicts the
// CREATE address, estimates gas and records live chain observations.
// Never signs, never broadcasts, never funds. Run with: bun <this file>
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  http,
  encodeAbiParameters,
  keccak256,
  getContractAddress,
  formatEther,
  getAddress,
} from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const DEPLOYER = '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD';

const ARGS = {
  token_: '0xcaaB50F36252a57529AFeF651fa6B9f9281917fF',
  admin_: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  budgetManager_: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  publisher_: '0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94',
  pauser_: '0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF',
  recoveryRecipient_: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
  minPublishDelay_: 86400n,
};

const client = createPublicClient({ transport: http(RPC) });
const creation = fs.readFileSync(path.join(D, 'creation-bytecode.txt'), 'utf8').trim();
const encoded = encodeAbiParameters(
  [
    { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' },
    { type: 'address' }, { type: 'address' }, { type: 'uint64' },
  ],
  Object.values(ARGS).map((v) => (typeof v === "string" ? getAddress(v.toLowerCase()) : v)),
);
const data = creation + encoded.slice(2);

const chainId = await client.getChainId();
const blockNumber = await client.getBlockNumber();
const pendingNonce = await client.getTransactionCount({ address: DEPLOYER, blockTag: 'pending' });
const balance = await client.getBalance({ address: DEPLOYER });
const deployerCode = (await client.getCode({ address: DEPLOYER })) ?? '0x';
const predicted = getContractAddress({ from: DEPLOYER, nonce: BigInt(pendingNonce) });
const predictedCode = (await client.getCode({ address: predicted })) ?? '0x';
const tokenCode = (await client.getCode({ address: ARGS.token_ })) ?? '0x';

const erc20 = [
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];
const read = (functionName) => client.readContract({ address: ARGS.token_, abi: erc20, functionName });

let gasEstimate = null;
try {
  gasEstimate = (await client.estimateGas({ account: DEPLOYER, data })).toString();
} catch (e) {
  gasEstimate = 'ESTIMATE_FAILED: ' + (e.shortMessage || e.message);
}
const gasPrice = await client.getGasPrice();

const out = {
  rpc: RPC,
  chainId,
  blockNumber: Number(blockNumber),
  deployer: DEPLOYER,
  deployerIsEoa: deployerCode === '0x',
  pendingNonce,
  balanceWei: balance.toString(),
  balanceBot: formatEther(balance),
  predictedCreateAddress: predicted,
  predictedAddressCodeless: predictedCode === '0x',
  constructorArgs: { ...ARGS, minPublishDelay_: ARGS.minPublishDelay_.toString() },
  constructorArgsEncoded: encoded,
  constructorArgsKeccak256: keccak256(encoded),
  deploymentDataBytes: (data.length - 2) / 2,
  deploymentDataKeccak256: keccak256(data),
  rewardToken: {
    address: ARGS.token_,
    codeBytes: (tokenCode.length - 2) / 2,
    name: await read('name'),
    symbol: await read('symbol'),
    decimals: Number(await read('decimals')),
    totalSupplyWei: (await read('totalSupply')).toString(),
  },
  gasEstimate,
  gasPriceWei: gasPrice.toString(),
};
if (/^\d+$/.test(out.gasEstimate)) {
  out.bufferedGasLimit30pct = ((BigInt(out.gasEstimate) * 130n) / 100n).toString();
}

fs.writeFileSync(path.join(D, 'unsigned-deployment-data.txt'), data);
fs.writeFileSync(path.join(D, 'constructor-args.txt'), encoded);
console.log(JSON.stringify(out, null, 2));
