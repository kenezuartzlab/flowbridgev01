// V30.2B R3 — FlowBridgeActivityRegistry read-only live preflight.
// No signing, no broadcast, no attestation. Emits deployment payload evidence only.
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
} from 'viem';

const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const D = path.resolve(import.meta.dirname, '..');
const DEPLOYER = '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD';
const ROLES = {
  admin: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  attester: '0xfa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e47',
  pauser: '0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF',
};

const h = (s) => createHash('sha256').update(s).digest('hex');
const creation = fs.readFileSync(path.join(D, 'creation-bytecode.txt'), 'utf8').trim();

const args = encodeAbiParameters(
  [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
  [ROLES.admin, ROLES.attester, ROLES.pauser],
);
const data = creation + args.slice(2);

const client = createPublicClient({ transport: http(RPC) });
const chainId = await client.getChainId();
const block = await client.getBlockNumber();
const nonce = await client.getTransactionCount({ address: DEPLOYER, blockTag: 'pending' });
const balance = await client.getBalance({ address: DEPLOYER });
const gasPrice = await client.getGasPrice();
const predicted = getContractAddress({ from: DEPLOYER, nonce: BigInt(nonce) });
const code = await client.getBytecode({ address: predicted });
const gasEstimate = await client.estimateGas({ account: DEPLOYER, data });
const gasLimit = (gasEstimate * 130n) / 100n;

const out = {
  rpc: RPC,
  chainId,
  observedBlock: Number(block),
  deployer: DEPLOYER,
  pendingNonce: nonce,
  balanceBOT: formatEther(balance),
  gasPriceGwei: formatEther(gasPrice * 10n ** 9n),
  roles: ROLES,
  adminAttesterDiffer: ROLES.admin.toLowerCase() !== ROLES.attester.toLowerCase(),
  constructorArgs: args,
  constructorArgsKeccak: keccak256(args),
  deploymentDataBytes: (data.length - 2) / 2,
  deploymentDataKeccak: keccak256(data),
  deploymentDataSha256: h(Buffer.from(data.slice(2), 'hex')),
  predictedAddress: predicted,
  predictedAddressCodeless: !code || code === '0x',
  gasEstimate: gasEstimate.toString(),
  gasLimitBuffered30: gasLimit.toString(),
  valueBOT: '0',
};
fs.writeFileSync(path.join(D, 'unsigned-deployment-data.txt'), data);
fs.writeFileSync(path.join(D, 'constructor-args.txt'), args);
console.log(JSON.stringify(out, null, 2));
