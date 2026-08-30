// V30.2B R4 preflight — read-only. Encodes constructor args, predicts the
// CREATE address, estimates gas, proves reward-token binding and zero state.
// Never signs, never broadcasts, never funds. Run with: bun <this file>
import { createHash } from 'node:crypto';
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

// Frozen constructor: (address token_, address admin, address recoveryRecipient_)
const ARGS = {
  token_: '0xcaaB50F36252a57529AFeF651fa6B9f9281917fF', // verified V30.2B FLOW (R1)
  admin: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507', // Governance Safe
  recoveryRecipient_: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4', // Treasury Safe
};
const OLD = {
  oldFlowToken: '0x535ddda826142ac42ce288154e9595f080940ae9',
  oldTreasury: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  oldController: '0x2f2CB50f0F9F0C1eaB1E2e4E01AA2f1F6dE0F0B0',
};

const client = createPublicClient({ transport: http(RPC) });
const creation = fs.readFileSync(path.join(D, 'creation-bytecode.txt'), 'utf8').trim();
const encoded = encodeAbiParameters(
  [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
  Object.values(ARGS).map((v) => getAddress(v.toLowerCase())),
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
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];
const read = (functionName, args = []) =>
  client.readContract({ address: ARGS.token_, abi: erc20, functionName, args });

let gasEstimate = null;
try {
  gasEstimate = (await client.estimateGas({ account: DEPLOYER, data })).toString();
} catch (e) {
  gasEstimate = 'ESTIMATE_FAILED: ' + (e.shortMessage || e.message);
}
const gasPrice = await client.getGasPrice();

const src = fs.readFileSync(path.join(D, 'sources', 'FlowStakingRewardTreasury.sol'), 'utf8');
const lower = src.toLowerCase();
const oldRefs = Object.entries(OLD).filter(([, a]) => lower.includes(a.toLowerCase()));
const bodyLower = data.toLowerCase();
const oldRefsInPayload = Object.entries(OLD).filter(([, a]) =>
  bodyLower.includes(a.toLowerCase().slice(2)),
);

const out = {
  rpc: RPC,
  chainId,
  blockNumber: Number(blockNumber),
  deployer: DEPLOYER,
  deployerIsEoa: deployerCode === '0x',
  pendingNonce,
  balanceBot: formatEther(balance),
  predictedCreateAddress: predicted,
  predictedAddressCodeless: predictedCode === '0x',
  constructorArgs: ARGS,
  constructorArgsEncoded: encoded,
  constructorArgsKeccak256: keccak256(encoded),
  deploymentDataBytes: (data.length - 2) / 2,
  deploymentDataKeccak256: keccak256(data),
  deploymentDataSha256: createHash('sha256').update(Buffer.from(data.slice(2), 'hex')).digest('hex'),
  rewardToken: {
    address: ARGS.token_,
    codeBytes: (tokenCode.length - 2) / 2,
    name: await read('name'),
    symbol: await read('symbol'),
    decimals: Number(await read('decimals')),
    totalSupplyWei: (await read('totalSupply')).toString(),
    predictedTreasuryBalanceWei: (await read('balanceOf', [predicted])).toString(),
  },
  initialRoleMatrix: {
    DEFAULT_ADMIN_ROLE: ARGS.admin,
    VAULT_ROLE: 'UNASSIGNED',
    CONTROLLER_ROLE: 'UNASSIGNED',
    deployerRoles: 'NONE',
  },
  initialState: {
    reservedGenesis: '0 (uninitialised storage)',
    reservedFloors: '0 (uninitialised storage)',
    committedEpoch: '0 (uninitialised storage)',
    accruedUnclaimed: '0 (uninitialised storage)',
    tokenBalance: '0 (no constructor transfer)',
    plannedTenMillionTransfer: 'NOT_PERFORMED',
  },
  oldAddressReferencesInSource: oldRefs.map(([k]) => k),
  oldAddressReferencesInPayload: oldRefsInPayload.map(([k]) => k),
  gasEstimate,
  gasPriceWei: gasPrice.toString(),
};
if (/^\d+$/.test(out.gasEstimate)) {
  out.bufferedGasLimit30pct = ((BigInt(out.gasEstimate) * 130n) / 100n).toString();
}

fs.writeFileSync(path.join(D, 'unsigned-deployment-data.txt'), data);
fs.writeFileSync(path.join(D, 'constructor-args.txt'), encoded);
console.log(JSON.stringify(out, null, 2));
