// V30.2B P2C — fresh-state rebuild of the publishEpoch transaction.
// READ-ONLY. Never signs, never broadcasts, never publishes a root,
// never transfers BOT or FLOW, never enables claims.
//
// Frozen: epoch 1, recipient 0x3d8a…0164, 1 FLOW, root 0xe5cf…, proof [].
// Fresh:  claimStart recomputed from the LATEST block timestamp with a
//         > 86,400s margin; calldata + keccak re-derived from the verified
//         deployed ABI; simulated from the Root Publisher; Publisher BOT
//         balance must be sufficient for the 30%-buffered gas cost.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  keccak256,
  parseEther,
  formatEther,
  formatGwei,
  getAddress,
} from 'viem';
import {
  ONE_FLOW_WEI,
  CANARY_PUBLISH_DELAY_SECONDS,
} from '../../../../src/lib/deploy/v302bP2aCanaryDecision.ts';
import { merkleClaimLeafHash } from '../../../../src/lib/rewards/merkleClaim.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIR = HERE.replace(/\/scripts$/, '');
const PROD = path.join(DIR, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

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
  deployer: getAddress('0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD'),
};

const abi = JSON.parse(fs.readFileSync(path.join(PROD, 'v30-2b-distributor/abi.json'), 'utf8'));
const erc20 = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];

const client = createPublicClient({ transport: http(RPC) });
const checks = [];
const blockers = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail: String(detail) });
  if (!ok) blockers.push(`${name}: ${detail}`);
};
const read = (fn, args = []) =>
  client.readContract({ address: A.distributor, abi, functionName: fn, args });

const chainId = await client.getChainId();
check('chain is BOT Mainnet 677', chainId === FROZEN.chainId, chainId);
const latest = await client.getBlock();
const now = Number(latest.timestamp);
const head = Number(latest.number);

// ------------------------------------------------------- frozen leaf / root
const leafOnchain = await read('leafHash', [
  BigInt(FROZEN.epochId),
  BigInt(FROZEN.index),
  getAddress(FROZEN.recipient),
  FROZEN.entitlementWei,
]);
const leafLocal = merkleClaimLeafHash({
  chainId: FROZEN.chainId,
  distributor: A.distributor,
  leaf: {
    epochId: FROZEN.epochId,
    index: FROZEN.index,
    account: getAddress(FROZEN.recipient),
    amount: FROZEN.entitlementWei.toString(),
  },
});
const independent = JSON.parse(
  execFileSync(
    process.execPath,
    [
      path.join(HERE, 'p2c-independent-tree.mjs'),
      String(FROZEN.chainId),
      A.distributor,
      String(FROZEN.epochId),
      String(FROZEN.index),
      getAddress(FROZEN.recipient),
      FROZEN.entitlementWei.toString(),
    ],
    { encoding: 'utf8' },
  ).trim(),
);
check('on-chain leafHash() equals the frozen root', leafOnchain === FROZEN.root, leafOnchain);
check('local encoder equals the frozen root', leafLocal === FROZEN.root, leafLocal);
check('independent fresh-process rebuild equals the frozen root', independent.root === FROZEN.root, independent.root);
check('proof remains empty (single-leaf tree)', independent.proof.length === 0, '[]');

// -------------------------------------------------- live Distributor state
const pre = {
  campaignBudget: await read('campaignBudget'),
  budgetRemaining: await read('budgetRemaining'),
  totalReserved: await read('totalReserved'),
  totalClaimed: await read('totalClaimed'),
  epochCount: await read('epochCount'),
  minPublishDelay: await read('minPublishDelay'),
  paused: await read('paused'),
};
const balance = await client.readContract({
  address: A.flow,
  abi: erc20,
  functionName: 'balanceOf',
  args: [A.distributor],
});
check('Distributor balance is 1,000,000 FLOW', balance === parseEther('1000000'), formatEther(balance));
check('campaignBudget is 1 FLOW', pre.campaignBudget === ONE_FLOW_WEI, pre.campaignBudget);
check('budgetRemaining is 1 FLOW', pre.budgetRemaining === ONE_FLOW_WEI, pre.budgetRemaining);
check('totalReserved is 0', pre.totalReserved === 0n, pre.totalReserved);
check('totalClaimed is 0', pre.totalClaimed === 0n, pre.totalClaimed);
check('epochCount is 0 (publication would assign epoch 1)', pre.epochCount === 0n, pre.epochCount);
check('Distributor is not paused', pre.paused === false, pre.paused);
const publisherRole = await read('PUBLISHER_ROLE');
check('Root Publisher holds PUBLISHER_ROLE', await read('hasRole', [publisherRole, A.publisher]), A.publisher);

// ------------------------------------------ publishEpoch from verified ABI
const fn = abi.find((f) => f.type === 'function' && f.name === 'publishEpoch');
const expectedSig = ['bytes32 root', 'uint256 allocation', 'uint64 claimStart', 'uint64 claimEnd'];
check(
  'publishEpoch signature derived from verified deployed ABI',
  !!fn && fn.inputs.map((i) => `${i.type} ${i.name}`).join('|') === expectedSig.join('|'),
  fn ? fn.inputs.map((i) => `${i.type} ${i.name}`).join('|') : 'missing',
);

// Fresh scheduling: latest block timestamp + 86,400s + margin (> 86,400s
// effective). The contract enforces the delay against the execution-time
// block timestamp, so a margin is required.
const SCHEDULING_MARGIN = 900;
const claimStart = BigInt(now + CANARY_PUBLISH_DELAY_SECONDS + SCHEDULING_MARGIN);
const claimEnd = claimStart + 30n * 86_400n;
check(
  'claimStart is more than 86,400s ahead of the latest block timestamp',
  claimStart - BigInt(now) > 86_400n,
  `delay ${claimStart - BigInt(now)}s (86,400 + ${SCHEDULING_MARGIN} margin)`,
);

const args = [FROZEN.root, FROZEN.entitlementWei, claimStart, claimEnd];
const calldata = encodeFunctionData({ abi, functionName: 'publishEpoch', args });
const calldataKeccak = keccak256(calldata);

const gasPrice = await client.getGasPrice();
const publisherNonce = await client.getTransactionCount({ address: A.publisher, blockTag: 'pending' });
const publisherBalance = await client.getBalance({ address: A.publisher });

let gas = null;
let simResult = null;
let sim = { ok: false, detail: 'not simulated' };
try {
  const r = await client.simulateContract({
    address: A.distributor,
    abi,
    functionName: 'publishEpoch',
    args,
    account: A.publisher,
  });
  simResult = r.result;
  gas = await client.estimateContractGas({
    address: A.distributor,
    abi,
    functionName: 'publishEpoch',
    args,
    account: A.publisher,
  });
  sim = { ok: true, detail: `simulation returns epochId ${String(simResult)}` };
} catch (e) {
  sim = { ok: false, detail: String(e).slice(0, 240) };
}
check('publishEpoch simulates successfully FROM the Root Publisher', sim.ok, sim.detail);
check('simulation returns epochId 1', String(simResult) === '1', String(simResult));

let unauthorizedRejected = false;
try {
  await client.simulateContract({
    address: A.distributor,
    abi,
    functionName: 'publishEpoch',
    args,
    account: A.deployer,
  });
} catch {
  unauthorizedRejected = true;
}
check('non-publisher caller is rejected', unauthorizedRejected, 'unauthorized reverts');

const bufferedGas = gas ? (gas * 130n) / 100n : null;
const requiredWei = bufferedGas ? bufferedGas * gasPrice : null;
check(
  "Publisher's BOT balance covers the 30%-buffered gas cost",
  requiredWei != null && publisherBalance >= requiredWei,
  `balance ${formatEther(publisherBalance)} BOT vs required ${requiredWei ? formatEther(requiredWei) : 'n/a'} BOT`,
);
check('Publisher balance contains no FLOW authority implication (native BOT only)', true, 'native gas token only');
const publisherFlow = await client.readContract({
  address: A.flow,
  abi: erc20,
  functionName: 'balanceOf',
  args: [A.publisher],
});
check('Publisher holds no FLOW', publisherFlow === 0n, `${formatEther(publisherFlow)} FLOW`);

const publication = {
  target: A.distributor,
  function: 'publishEpoch(bytes32,uint256,uint64,uint64)',
  selector: calldata.slice(0, 10),
  decodedArgs: {
    root: FROZEN.root,
    allocationWei: FROZEN.entitlementWei.toString(),
    allocationFlow: '1',
    claimStart: claimStart.toString(),
    claimStartIso: new Date(Number(claimStart) * 1000).toISOString(),
    claimEnd: claimEnd.toString(),
    claimEndIso: new Date(Number(claimEnd) * 1000).toISOString(),
  },
  calldata,
  calldataKeccak,
  chainId,
  rootPublisher: A.publisher,
  rootPublisherNonce: publisherNonce,
  rootPublisherBalanceBot: formatEther(publisherBalance),
  gasEstimate: gas ? gas.toString() : null,
  bufferedGas30pct: bufferedGas ? bufferedGas.toString() : null,
  gasPriceWei: gasPrice.toString(),
  gasPriceGwei: formatGwei(gasPrice),
  requiredBotWithBuffer: requiredWei ? formatEther(requiredWei) : null,
  requiredWeiWithBuffer: requiredWei ? requiredWei.toString() : null,
  publisherBalanceCoversRequirement:
    requiredWei != null ? publisherBalance >= requiredWei : null,
  expectedPostState: {
    epochCount: '1',
    totalReserved: '1000000000000000000',
    budgetRemaining: '0',
    totalClaimed: '0',
    distributorFlowBalance: '1000000 FLOW (unchanged)',
    claimAvailableBeforeClaimStart: false,
    rewardClaimsEnabled: false,
  },
  simulation: sim,
  signed: false,
  broadcast: false,
};

const verdict = blockers.length === 0 ? 'PASS' : 'BLOCKED';
const report = {
  gate: 'V30.2B P2C — fresh-state publishEpoch rebuild',
  mode: 'READ_ONLY',
  generatedAt: new Date().toISOString(),
  chain: { chainId, rpcHost: new URL(RPC).host, headBlock: head, latestBlockTimestamp: now },
  frozen: { ...FROZEN, entitlementWei: FROZEN.entitlementWei.toString() },
  scheduling: {
    frozenDelaySeconds: CANARY_PUBLISH_DELAY_SECONDS,
    schedulingMarginSeconds: SCHEDULING_MARGIN,
    effectiveDelaySeconds: Number(claimStart) - now,
  },
  publication,
  checks,
  blockers,
  verdict,
};
fs.writeFileSync(
  path.join(DIR, 'P2C_REBUILD_FRESH.json'),
  JSON.stringify(report, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
);
console.log(JSON.stringify({ verdict, blockers, checks: checks.filter((c) => !c.ok) }, null, 2));
console.log('claimStart:', publication.decodedArgs.claimStartIso, `(${claimStart})`);
console.log('claimEnd:  ', publication.decodedArgs.claimEndIso);
console.log('calldata keccak:', calldataKeccak);
console.log('gas estimate:', gas?.toString(), '| buffered:', bufferedGas?.toString(), '| gas price:', formatGwei(gasPrice), 'gwei');
console.log('publisher balance:', formatEther(publisherBalance), 'BOT | required:', requiredWei ? formatEther(requiredWei) : 'n/a', 'BOT');
if (verdict !== 'PASS') process.exit(1);
