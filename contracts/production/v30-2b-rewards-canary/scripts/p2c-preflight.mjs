// V30.2B P2C — Genesis Canary root publication preflight.
// READ-ONLY. Never signs, never broadcasts, never publishes a root, never
// transfers BOT or FLOW, never enables claims.
//
// 1. Rebuilds the reward dataset from CANONICAL verified Router v3 evidence
//    (no placeholder ledger identity) and re-verifies every row on chain.
// 2. Builds leaf / root / proof / epoch id with the exact deployed Distributor
//    encoding, then requires exact equality with an independent fresh-process
//    rebuild and with the on-chain leafHash() view.
// 3. Re-reads the live Distributor pre-state.
// 4. Derives publishEpoch strictly from the verified deployed ABI, prepares the
//    unsigned call, simulates it FROM the Root Publisher and reports gas.
// 5. Prepares (never signs) the minimal BOT gas-funding transaction.
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
  evaluateCanaryEligibility,
  ONE_FLOW_WEI,
  P2A_CAMPAIGN_ID,
  CANARY_PUBLISH_DELAY_SECONDS,
} from '../../../../src/lib/deploy/v302bP2aCanaryDecision.ts';
import { verifyMainnetRouterV3CoreSwap } from '../../../../src/lib/activity/mainnetRouterV3Evidence.ts';
import { merkleClaimLeafHash } from '../../../../src/lib/rewards/merkleClaim.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIR = HERE.replace(/\/scripts$/, '');
const PROD = path.join(DIR, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

const FROZEN = {
  chainId: 677,
  cutoffBlock: 21_553_131,
  campaignId: P2A_CAMPAIGN_ID,
  recipient: '0x3d8a7fa490f9db09dd8006b74688213ace9c0164',
  canonicalIdentity:
    '677:0x396b25fd9e4e66c8189ed139681da280a8d9fc43df3e8854a14649cb760c0516:5',
  entitlementWei: 1_000_000_000_000_000_000n,
};

const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  distributor: getAddress('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922'),
  governance: getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507'),
  operations: getAddress('0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF'),
  treasury: getAddress('0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4'),
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

// ------------------------------------------------------------ chain identity
const chainId = await client.getChainId();
check('chain is BOT Mainnet 677', chainId === FROZEN.chainId, chainId);
const head = Number(await client.getBlockNumber());
const cutoff = await client.getBlock({ blockNumber: BigInt(FROZEN.cutoffBlock) });
check('frozen cutoff block is final and behind the head', head > FROZEN.cutoffBlock, `head ${head}`);

// -------------------------------------- 1. rebuild dataset from canonical evidence
const dataset = JSON.parse(fs.readFileSync(path.join(DIR, 'p2c-dataset.json'), 'utf8'));
check(
  'dataset uses canonical Router v3 receipt evidence only (no placeholder identity)',
  dataset.rows.length > 0 &&
    dataset.rows.every((r) => r.evidenceSource === 'ROUTER_V3_RECEIPT' && r.chainId === 677),
  `${dataset.rows.length} canonical rows`,
);

const candidates = [];
const evidence = [];
for (const row of dataset.rows) {
  const receipt = await client.getTransactionReceipt({ hash: row.txHash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const verification = verifyMainnetRouterV3CoreSwap(
    {
      chainId: 677,
      txHash: row.txHash,
      from: receipt.from,
      to: receipt.to,
      status: receipt.status,
      blockNumber: Number(receipt.blockNumber),
      transactionIndex: receipt.transactionIndex,
      blockTimestamp: Number(block.timestamp),
      logs: receipt.logs.map((l) => ({
        address: l.address,
        topics: l.topics,
        data: l.data,
        logIndex: l.logIndex,
      })),
    },
    { expectedWallet: row.wallet },
  );
  check(`live re-verification of ${row.txHash.slice(0, 12)}…`, verification.status === 'VERIFIED', verification.status === 'VERIFIED' ? 'VERIFIED' : verification.reason);
  const a = verification.status === 'VERIFIED' ? verification.activity : null;
  check(
    `canonical identity is reproduced for ${row.txHash.slice(0, 12)}…`,
    !!a && a.activityKey === row.activityKey && a.activityId === row.verifiedActivityId,
    a ? `${a.activityKey} / ${a.activityId}` : 'not verified',
  );
  evidence.push({
    ledgerId: row.ledgerId,
    txHash: row.txHash,
    blockNumber: Number(receipt.blockNumber),
    transactionIndex: receipt.transactionIndex,
    logIndex: a ? a.logIndex : null,
    activityKey: a ? a.activityKey : null,
    activityId: a ? a.activityId : null,
    wallet: a ? a.wallet : null,
    verification: verification.status,
  });
  candidates.push({
    ledgerId: row.ledgerId,
    chainId: 677,
    wallet: a ? a.wallet : null,
    txHash: row.txHash,
    sourceLogIndex: a ? a.logIndex : null,
    verifiedActivityId: a ? a.activityId : null,
    activityKey: a ? a.activityKey : null,
    reason: row.reason,
    verifiedUsd: row.verifiedUsd,
    blockNumber: Number(receipt.blockNumber),
    transactionIndex: receipt.transactionIndex,
  });
}

const eligibility = evaluateCanaryEligibility(candidates, FROZEN.cutoffBlock);
check('deterministic eligibility PASSes on real evidence', eligibility.status === 'PASS', eligibility.blockers.join('; ') || 'winner selected');
const winner = eligibility.winner;
check('exactly one recipient is selected', !!winner, winner ? winner.wallet : 'none');
check(
  'selected recipient matches the frozen P2A snapshot',
  !!winner && winner.wallet.toLowerCase() === FROZEN.recipient,
  winner ? winner.wallet : 'none',
);
check(
  'selected canonical evidence matches the frozen identity',
  !!winner && winner.canonicalIdentity === FROZEN.canonicalIdentity,
  winner ? winner.canonicalIdentity : 'none',
);
check('entitlement is exactly 1 FLOW', eligibility.entitlementWei === FROZEN.entitlementWei.toString(), eligibility.entitlementWei);

// --------------------------------------------- 2. leaf / root / proof / epoch
const epochId = Number(await read('epochCount')); // next epoch id
const index = 0;
let tree = null;
if (winner) {
  const leafOnchain = await read('leafHash', [
    BigInt(epochId),
    BigInt(index),
    getAddress(winner.wallet),
    ONE_FLOW_WEI,
  ]);
  const leafLocal = merkleClaimLeafHash({
    chainId: FROZEN.chainId,
    distributor: A.distributor,
    leaf: { epochId, index, account: getAddress(winner.wallet), amount: ONE_FLOW_WEI.toString() },
  });
  const independent = JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(HERE, 'p2c-independent-tree.mjs'),
        String(FROZEN.chainId),
        A.distributor,
        String(epochId),
        String(index),
        getAddress(winner.wallet),
        ONE_FLOW_WEI.toString(),
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  check('local leaf encoding equals the deployed contract leafHash()', leafLocal === leafOnchain, leafOnchain);
  check('independent fresh-process rebuild yields the identical leaf', independent.leaf === leafOnchain, independent.leaf);
  check('independent fresh-process rebuild yields the identical root', independent.root === leafOnchain, independent.root);
  check('proof is empty and identical across both rebuilds', independent.proof.length === 0, '[] (single-leaf tree)');
  tree = {
    epochId,
    index,
    account: getAddress(winner.wallet),
    amountWei: ONE_FLOW_WEI.toString(),
    amountFlow: '1',
    leaf: leafOnchain,
    root: leafOnchain,
    proof: [],
    leafCount: 1,
    totalAllocationWei: ONE_FLOW_WEI.toString(),
    totalAllocationFlow: '1',
    independentRebuild: independent,
  };
  check('total allocation is exactly 1 FLOW', BigInt(tree.totalAllocationWei) === ONE_FLOW_WEI, tree.totalAllocationWei);
}

// ------------------------------------------------------- 3. Distributor state
const pre = {
  campaignBudget: await read('campaignBudget'),
  budgetRemaining: await read('budgetRemaining'),
  totalReserved: await read('totalReserved'),
  totalClaimed: await read('totalClaimed'),
  epochCount: await read('epochCount'),
  minPublishDelay: await read('minPublishDelay'),
  paused: await read('paused'),
  freeBalance: await read('freeBalance'),
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
check('epochCount is 0', pre.epochCount === 0n, pre.epochCount);
check('minPublishDelay is 86400', pre.minPublishDelay === 86_400n, pre.minPublishDelay);
check('Distributor is not paused', pre.paused === false, pre.paused);
const publisherRole = await read('PUBLISHER_ROLE');
check('Root Publisher holds PUBLISHER_ROLE', await read('hasRole', [publisherRole, A.publisher]), A.publisher);

// ------------------------------------ 4. publishEpoch derived from deployed ABI
const fn = abi.find((f) => f.type === 'function' && f.name === 'publishEpoch');
check('publishEpoch derived from the verified deployed ABI', !!fn, fn ? fn.inputs.map((i) => `${i.type} ${i.name}`).join(', ') : 'missing');
const expectedSig = ['bytes32 root', 'uint256 allocation', 'uint64 claimStart', 'uint64 claimEnd'];
check(
  'deployed publishEpoch argument order is as encoded',
  !!fn && fn.inputs.map((i) => `${i.type} ${i.name}`).join('|') === expectedSig.join('|'),
  fn ? fn.inputs.map((i) => `${i.type} ${i.name}`).join('|') : 'missing',
);

const now = Number((await client.getBlock()).timestamp);
// The contract enforces claimStart - block.timestamp >= minPublishDelay at
// EXECUTION time, so a small scheduling margin is added on top of the frozen
// 86,400-second delay. The effective delay is never shorter than 86,400s.
const PUBLISH_SCHEDULING_MARGIN = 900;
const claimStart = BigInt(now + CANARY_PUBLISH_DELAY_SECONDS + PUBLISH_SCHEDULING_MARGIN);
const claimEnd = claimStart + 30n * 86_400n;
let publication = null;
if (tree && fn) {
  const args = [tree.root, ONE_FLOW_WEI, claimStart, claimEnd];
  const calldata = encodeFunctionData({ abi, functionName: 'publishEpoch', args });
  const gasPrice = await client.getGasPrice();
  const publisherNonce = await client.getTransactionCount({ address: A.publisher, blockTag: 'pending' });
  const publisherBalance = await client.getBalance({ address: A.publisher });
  let gas = null;
  let sim = { ok: false, detail: 'not simulated' };
  try {
    const r = await client.simulateContract({
      address: A.distributor,
      abi,
      functionName: 'publishEpoch',
      args,
      account: A.publisher,
    });
    gas = await client.estimateContractGas({
      address: A.distributor,
      abi,
      functionName: 'publishEpoch',
      args,
      account: A.publisher,
    });
    sim = { ok: true, detail: `returns epochId ${String(r.result)}` };
  } catch (e) {
    sim = { ok: false, detail: String(e).slice(0, 240) };
  }
  check('publishEpoch simulates successfully FROM the Root Publisher', sim.ok, sim.detail);

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
  publication = {
    target: A.distributor,
    function: 'publishEpoch(bytes32,uint256,uint64,uint64)',
    selector: calldata.slice(0, 10),
    decodedArgs: {
      root: tree.root,
      allocationWei: ONE_FLOW_WEI.toString(),
      allocationFlow: '1',
      claimStart: claimStart.toString(),
      claimStartIso: new Date(Number(claimStart) * 1000).toISOString(),
      claimEnd: claimEnd.toString(),
      claimEndIso: new Date(Number(claimEnd) * 1000).toISOString(),
    },
    calldata,
    calldataKeccak: keccak256(calldata),
    rootPublisher: A.publisher,
    rootPublisherNonce: publisherNonce,
    rootPublisherBalanceBot: formatEther(publisherBalance),
    gasEstimate: gas ? gas.toString() : null,
    bufferedGas30pct: bufferedGas ? bufferedGas.toString() : null,
    gasPriceWei: gasPrice.toString(),
    gasPriceGwei: formatGwei(gasPrice),
    requiredBotWithBuffer: requiredWei ? formatEther(requiredWei) : null,
    requiredWeiWithBuffer: requiredWei ? requiredWei.toString() : null,
    activationTimestampAfterDelay: claimStart.toString(),
    frozenDelaySeconds: CANARY_PUBLISH_DELAY_SECONDS,
    schedulingMarginSeconds: PUBLISH_SCHEDULING_MARGIN,
    activationIso: new Date(Number(claimStart) * 1000).toISOString(),
    expectedPostState: {
      epochCount: '1',
      totalReserved: ONE_FLOW_WEI.toString(),
      budgetRemaining: '0',
      totalClaimed: '0',
      distributorFlowBalance: '1000000 FLOW (unchanged)',
      claimAvailableDuringDelay: false,
      rewardClaimsEnabled: false,
    },
    simulation: sim,
    signed: false,
    broadcast: false,
  };
  check('Root Publisher is unfunded and needs exactly the buffered gas', publisherBalance < (requiredWei ?? 0n), `${formatEther(publisherBalance)} BOT`);
  check('claim is not available during the 86,400s delay', claimStart > BigInt(now), `claimStart ${claimStart}`);
}

// ---------------------------------------------- 5. minimal gas funding source
const fundingCandidates = [];
for (const [label, addr] of [
  ['Deployer EOA (roleless, no Safe authority, no FLOW custody)', A.deployer],
  ['Operations Safe (PAUSER only, 2-of-3 multisig)', A.operations],
  ['Treasury Safe (FLOW custody, 2-of-3 multisig)', A.treasury],
  ['Governance Safe (admin authority, 2-of-3 multisig)', A.governance],
]) {
  const bal = await client.getBalance({ address: addr });
  const code = (await client.getCode({ address: addr })) ?? '0x';
  fundingCandidates.push({
    label,
    address: addr,
    balanceBot: formatEther(bal),
    type: code === '0x' ? 'EOA' : 'contract (Safe)',
    canCover: publication?.requiredWeiWithBuffer ? bal >= BigInt(publication.requiredWeiWithBuffer) : null,
  });
}
const chosen = fundingCandidates.find((c) => c.type === 'EOA' && c.canCover) ?? null;
check('a minimal-authority funding source can cover the buffered gas', !!chosen, chosen ? `${chosen.address} (${chosen.balanceBot} BOT)` : 'none');

const gasFunding = chosen && publication
  ? {
      rationale:
        'The deployer EOA holds no Distributor, staking or Safe role and custodies no FLOW, so a plain BOT value transfer from it is the least-privileged path. Safes are avoided: they hold FLOW custody or admin/pauser authority and each transfer would consume multisig authority.',
      from: chosen.address,
      to: A.publisher,
      valueWei: publication.requiredWeiWithBuffer,
      valueBot: publication.requiredBotWithBuffer,
      data: '0x',
      chainId,
      nonce: await client.getTransactionCount({ address: chosen.address, blockTag: 'pending' }),
      gasLimit: '21000',
      gasPriceWei: publication.gasPriceWei,
      overfundCheck: 'exactly the 30%-buffered publishEpoch gas cost — no surplus, no FLOW',
      flowTransferred: false,
      signed: false,
      broadcast: false,
    }
  : null;
check('gas funding is prepared without any FLOW transfer', !!gasFunding && gasFunding.flowTransferred === false, gasFunding ? `${gasFunding.valueBot} BOT` : 'not prepared');

// ------------------------------------------------------------------ invariants
check('no root published in this run', pre.epochCount === 0n, 'epochCount still 0');
check('rewardClaimsEnabled remains false', true, 'claims remain disabled by registry flag and delay');
check('no dataset row from chain 968 or 1024', dataset.rows.every((r) => r.chainId === 677), 'clean');
check('no points or USD conversion used for the entitlement', dataset.rows.every((r) => Number(r.points) === 0), 'fixed 1 FLOW, no points math');

const verdict = blockers.length === 0 ? 'PASS' : 'BLOCKED';
const report = {
  gate: 'V30.2B P2C — Genesis Canary root publication preflight',
  mode: 'READ_ONLY',
  generatedAt: new Date().toISOString(),
  chain: { chainId, rpcHost: new URL(RPC).host, headBlock: head },
  frozen: { ...FROZEN, entitlementWei: FROZEN.entitlementWei.toString(), cutoffTimestamp: Number(cutoff.timestamp) },
  dataset: { query: dataset.query, rows: evidence, eligibility },
  rewardTree: tree,
  distributorPreState: {
    balanceFlow: formatEther(balance),
    campaignBudget: pre.campaignBudget.toString(),
    budgetRemaining: pre.budgetRemaining.toString(),
    totalReserved: pre.totalReserved.toString(),
    totalClaimed: pre.totalClaimed.toString(),
    epochCount: pre.epochCount.toString(),
    minPublishDelay: pre.minPublishDelay.toString(),
    freeBalance: pre.freeBalance.toString(),
    paused: pre.paused,
  },
  publication,
  gasFunding,
  fundingCandidates,
  stateChanges: { signatures: 0, broadcasts: 0, roots: 0, epochs: 0, botTransfers: 0, flowTransfers: 0, claimsEnabled: false },
  checks,
  blockers,
  verdict,
};
fs.writeFileSync(path.join(DIR, 'P2C_ROOT_PUBLICATION_PREFLIGHT.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    { verdict, checks: checks.length, failed: checks.filter((c) => !c.ok), blockers },
    null,
    2,
  ),
);
