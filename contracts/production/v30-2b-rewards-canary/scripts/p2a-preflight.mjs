// V30.2B P2A — Genesis Core Swap Canary: decision freeze + reward preflight.
// READ-ONLY. Never signs, never broadcasts, never funds, never publishes a root.
//
// 1. Freezes the eligibility cutoff block from the live finalized head.
// 2. Amends the canonical decision manifest with the owner-approved 1 FLOW
//    canary (history preserved) and reports both new hashes.
// 3. Evaluates the REAL chain-677 CORE_SWAP dataset fail-closed, re-verifying
//    every candidate transaction against the live chain.
// 4. Prepares (never submits) the Governance campaign-budget transaction and
//    simulates it from the Governance Safe.
// 5. Reports Root Publisher gas readiness.
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  keccak256,
  encodeAbiParameters,
  parseEther,
  formatEther,
  getAddress,
} from 'viem';
import {
  amendManifestWithCanary,
  buildCanaryDecision,
  evaluateCanaryEligibility,
  validateCanaryAmendment,
  ONE_FLOW_WEI,
} from '../../../../src/lib/deploy/v302bP2aCanaryDecision.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIR = HERE.replace(/\/scripts$/, '');
const PROD = path.join(DIR, '..');
const REPO = path.join(PROD, '../..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';

const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  distributor: getAddress('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922'),
  governance: getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507'),
  publisher: getAddress('0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94'),
  operations: getAddress('0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF'),
  treasury: getAddress('0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4'),
  routerV3: getAddress('0x986962de6F00D0eC571b1a34Fa70AEeB445b5445'),
};

const distributorAbi = JSON.parse(
  fs.readFileSync(path.join(PROD, 'v30-2b-distributor/abi.json'), 'utf8'),
);
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const client = createPublicClient({ transport: http(RPC) });
const checks = [];
const blockers = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail: String(detail) });
  if (!ok) blockers.push(`${name}: ${detail}`);
};

const read = (fn, args = []) =>
  client.readContract({ address: A.distributor, abi: distributorAbi, functionName: fn, args });

// ----------------------------------------------------------- 1. frozen cutoff
const chainId = await client.getChainId();
check('chain is BOT Mainnet 677', chainId === 677, chainId);
const cutoffBlock = Number(await client.getBlockNumber());
const cutoff = await client.getBlock({ blockNumber: BigInt(cutoffBlock) });

// ------------------------------------------------- 2. decision manifest freeze
const manifestPath = path.join(REPO, 'contracts/MAINNET_RELEASE_DECISIONS.json');
const stored = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const baseManifest = stored.manifest;
const priorManifestHash = stored.manifestHash;

const decision = buildCanaryDecision({
  eligibilityCutoffBlock: cutoffBlock,
  candidateDigest: String(baseManifest.candidateDigest),
  approvedByEmail: 'owner@flowbridge.space',
  approvedAt: new Date().toISOString(),
});
const amended = amendManifestWithCanary(baseManifest, priorManifestHash, decision);
const validation = validateCanaryAmendment(baseManifest, amended.manifest);
check('decision amendment schema validation', validation.ok, validation.findings.join('; ') || 'clean');
check('new manifest hash differs from the frozen V30.1D.4 hash', amended.manifestHash !== priorManifestHash, amended.manifestHash);
// Deterministic reproduction from a second independent build of the same input.
const reproduced = amendManifestWithCanary(baseManifest, priorManifestHash, decision);
check('manifest hash reproduces deterministically', reproduced.manifestHash === amended.manifestHash, reproduced.manifestHash);

// ------------------------------------------------------- 3. live pre-state
const pre = {
  campaignBudget: await read('campaignBudget'),
  budgetRemaining: await read('budgetRemaining'),
  totalReserved: await read('totalReserved'),
  totalClaimed: await read('totalClaimed'),
  epochCount: await read('epochCount'),
  minPublishDelay: await read('minPublishDelay'),
  paused: await read('paused'),
  token: await read('token'),
  recoveryRecipient: await read('recoveryRecipient'),
};
const distributorBalance = await client.readContract({
  address: A.flow, abi: erc20, functionName: 'balanceOf', args: [A.distributor],
});
const roleIds = {
  admin: await read('DEFAULT_ADMIN_ROLE'),
  budgetManager: await read('BUDGET_MANAGER_ROLE'),
  publisher: await read('PUBLISHER_ROLE'),
  pauser: await read('PAUSER_ROLE'),
};
const hasRole = (role, who) => read('hasRole', [role, who]);

check('distributor funded with 1,000,000 FLOW', distributorBalance === parseEther('1000000'), formatEther(distributorBalance));
check('campaignBudget is 0', pre.campaignBudget === 0n, pre.campaignBudget);
check('totalReserved is 0', pre.totalReserved === 0n, pre.totalReserved);
check('totalClaimed is 0', pre.totalClaimed === 0n, pre.totalClaimed);
check('epochCount is 0 (no root, no epoch)', pre.epochCount === 0n, pre.epochCount);
check('minPublishDelay is 86400', pre.minPublishDelay === 86400n, pre.minPublishDelay);
check('distributor not paused', pre.paused === false, pre.paused);
check('distributor token is canonical FLOW', getAddress(pre.token) === A.flow, pre.token);
check('recovery recipient is Treasury Safe', getAddress(pre.recoveryRecipient) === A.treasury, pre.recoveryRecipient);
check('Governance holds DEFAULT_ADMIN_ROLE', await hasRole(roleIds.admin, A.governance), A.governance);
check('Governance holds BUDGET_MANAGER_ROLE', await hasRole(roleIds.budgetManager, A.governance), A.governance);
check('approved Root Publisher holds PUBLISHER_ROLE', await hasRole(roleIds.publisher, A.publisher), A.publisher);
check('Operations holds PAUSER_ROLE', await hasRole(roleIds.pauser, A.operations), A.operations);
check('Root Publisher is not a budget manager', !(await hasRole(roleIds.budgetManager, A.publisher)), 'separated');

// ------------------------------------------- 4. real dataset (fail-closed)
const snapshot = JSON.parse(fs.readFileSync(path.join(DIR, 'dataset-snapshot.json'), 'utf8'));
check('dataset snapshot is chain 677 CORE_SWAP only', snapshot.rows.every((r) => r.chainId === 677 && r.reason === 'CORE_SWAP'), `${snapshot.rows.length} rows`);

// Re-verify every candidate against the live chain and resolve real receipt facts.
const candidates = [];
for (const row of snapshot.rows) {
  const c = {
    ledgerId: row.ledgerId,
    chainId: row.chainId,
    wallet: row.wallet,
    txHash: row.txHash,
    sourceLogIndex: row.sourceLogIndex,
    verifiedActivityId: row.verifiedActivityId,
    activityKey: row.activityKey,
    reason: row.reason,
    verifiedUsd: row.verifiedUsd,
    blockNumber: null,
    transactionIndex: null,
  };
  try {
    const rc = await client.getTransactionReceipt({ hash: row.txHash });
    c.blockNumber = Number(rc.blockNumber);
    c.transactionIndex = rc.transactionIndex;
    c.onchain = {
      status: rc.status,
      from: rc.from.toLowerCase(),
      to: rc.to ? rc.to.toLowerCase() : null,
      canonicalRouterLogs: rc.logs
        .filter((l) => getAddress(l.address) === A.routerV3)
        .map((l) => l.logIndex),
    };
  } catch (e) {
    c.onchain = { error: String(e).slice(0, 160) };
  }
  candidates.push(c);
}

const eligibility = evaluateCanaryEligibility(candidates, cutoffBlock);
check(
  'a qualifying canonical CORE_SWAP with complete economic identity exists',
  eligibility.status === 'PASS',
  eligibility.blockers.join('; ') || 'winner selected',
);

// Leaf / root / proof only ever built from a real qualified winner.
let rootPackage = null;
if (eligibility.winner) {
  const leafOnchain = await read('leafHash', [0n, 0n, getAddress(eligibility.winner.wallet), ONE_FLOW_WEI]);
  const leafOffline = keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
      [0n, 0n, getAddress(eligibility.winner.wallet), ONE_FLOW_WEI],
    ),
  );
  const claimStart = BigInt(Number(cutoff.timestamp) + 86_400);
  const claimEnd = claimStart + 30n * 86_400n;
  const calldata = encodeFunctionData({
    abi: distributorAbi,
    functionName: 'publishEpoch',
    args: [leafOnchain, ONE_FLOW_WEI, claimStart, claimEnd],
  });
  rootPackage = {
    epochId: 0,
    account: eligibility.winner.wallet,
    amountWei: ONE_FLOW_WEI.toString(),
    leafOnchain,
    leafOfflineMatchesContract: leafOnchain === leafOffline,
    root: leafOnchain,
    proof: [],
    claimStart: claimStart.toString(),
    claimEnd: claimEnd.toString(),
    calldata,
    calldataKeccak: keccak256(calldata),
    expectedTotalReservedAfter: ONE_FLOW_WEI.toString(),
  };
}

// -------------------------------- 5. Governance campaign-budget transaction
const setter = distributorAbi.find((f) => f.type === 'function' && f.name === 'setCampaignBudget');
check('campaign-budget setter derived from the verified ABI', !!setter, setter ? 'setCampaignBudget(uint256)' : 'missing');
const budgetCalldata = encodeFunctionData({
  abi: distributorAbi,
  functionName: 'setCampaignBudget',
  args: [ONE_FLOW_WEI],
});
const governanceNonce = await client.getTransactionCount({ address: A.governance });
let budgetSim = { ok: false, detail: 'not simulated' };
let budgetGas = null;
try {
  await client.simulateContract({
    address: A.distributor,
    abi: distributorAbi,
    functionName: 'setCampaignBudget',
    args: [ONE_FLOW_WEI],
    account: A.governance,
  });
  budgetGas = await client.estimateContractGas({
    address: A.distributor,
    abi: distributorAbi,
    functionName: 'setCampaignBudget',
    args: [ONE_FLOW_WEI],
    account: A.governance,
  });
  budgetSim = { ok: true, detail: 'simulated successfully from the Governance Safe' };
} catch (e) {
  budgetSim = { ok: false, detail: String(e).slice(0, 200) };
}
check('campaign-budget action simulates from the Governance Safe', budgetSim.ok, budgetSim.detail);

let deployerRejected = false;
try {
  await client.simulateContract({
    address: A.distributor,
    abi: distributorAbi,
    functionName: 'setCampaignBudget',
    args: [ONE_FLOW_WEI],
    account: getAddress('0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD'),
  });
} catch {
  deployerRejected = true;
}
check('non-Governance caller is rejected by the setter', deployerRejected, 'unauthorized reverts');

// ---------------------------------------- 6. Root Publisher gas readiness
const gasPrice = await client.getGasPrice();
const publisherNonce = await client.getTransactionCount({ address: A.publisher });
const publisherBalance = await client.getBalance({ address: A.publisher });
let publishGas = null;
if (rootPackage) {
  try {
    publishGas = await client.estimateContractGas({
      address: A.distributor,
      abi: distributorAbi,
      functionName: 'publishEpoch',
      args: [rootPackage.root, ONE_FLOW_WEI, BigInt(rootPackage.claimStart), BigInt(rootPackage.claimEnd)],
      account: A.publisher,
    });
  } catch (e) {
    publishGas = { error: String(e).slice(0, 200) };
  }
}
const bufferedGas = typeof publishGas === 'bigint' ? (publishGas * 120n) / 100n : null;
const fundingWei = bufferedGas ? bufferedGas * gasPrice : null;

// ---------------------------------------------------------------- invariants
check('rewards claims remain disabled (no epoch published)', pre.epochCount === 0n, 'claims impossible');
check('no root exists before the later publication transaction', pre.epochCount === 0n, 'epochCount 0');
check('no dataset row originates from chain 968 or 1024', snapshot.rows.every((r) => r.chainId !== 968 && r.chainId !== 1024), 'clean');
check('no points or PTS conversion introduced', decision.value.conversions && !Object.values(decision.value.conversions).some(Boolean), 'all conversion rules false');

const verdict = blockers.length === 0 ? 'PASS' : 'BLOCKED';
const report = {
  gate: 'V30.2B P2A — Genesis Core Swap Canary decision freeze + reward preflight',
  mode: 'READ_ONLY',
  generatedAt: new Date().toISOString(),
  chain: { chainId, rpcHost: new URL(RPC).host },
  eligibilityCutoffBlock: cutoffBlock,
  cutoffBlockTimestamp: Number(cutoff.timestamp),
  decision: {
    priorDecisionVersion: baseManifest.decisionVersion,
    priorManifestHash,
    newDecisionVersion: amended.manifest.decisionVersion,
    decisionId: decision.id,
    decisionHash: decision.decisionHash,
    newManifestHash: amended.manifestHash,
    value: decision.value,
    amendment: amended.manifest.amendments[amended.manifest.amendments.length - 1],
    schemaValidation: validation,
  },
  distributorPreState: {
    balanceFlow: formatEther(distributorBalance),
    campaignBudget: pre.campaignBudget.toString(),
    budgetRemaining: pre.budgetRemaining.toString(),
    totalReserved: pre.totalReserved.toString(),
    totalClaimed: pre.totalClaimed.toString(),
    epochCount: pre.epochCount.toString(),
    minPublishDelay: pre.minPublishDelay.toString(),
    paused: pre.paused,
  },
  dataset: {
    query: snapshot.query,
    capturedAt: snapshot.capturedAt,
    rows: candidates.map((c) => ({
      wallet: c.wallet,
      txHash: c.txHash,
      storedActivityKey: c.activityKey,
      storedSourceLogIndex: c.sourceLogIndex,
      verifiedActivityId: c.verifiedActivityId,
      verifiedUsd: c.verifiedUsd,
      blockNumber: c.blockNumber,
      transactionIndex: c.transactionIndex,
      onchain: c.onchain,
    })),
    eligibility,
  },
  rootPackage,
  governanceBudgetTransaction: {
    target: A.distributor,
    function: 'setCampaignBudget(uint256)',
    selector: budgetCalldata.slice(0, 10),
    decodedArgs: { newBudgetWei: ONE_FLOW_WEI.toString(), newBudgetFlow: 1 },
    calldata: budgetCalldata,
    calldataKeccak: keccak256(budgetCalldata),
    governanceSafe: A.governance,
    liveGovernanceNonce: governanceNonce,
    simulation: budgetSim,
    gasEstimate: budgetGas ? budgetGas.toString() : null,
    expectedPostState: {
      campaignBudget: ONE_FLOW_WEI.toString(),
      budgetRemaining: ONE_FLOW_WEI.toString(),
      totalReserved: '0',
      epochCount: '0',
      root: 'none',
      claims: 'none',
      distributorTokenBalance: 'unchanged (1,000,000 FLOW)',
    },
    signed: false,
    broadcast: false,
  },
  rootPublisherReadiness: {
    address: A.publisher,
    liveNonce: publisherNonce,
    balanceBot: formatEther(publisherBalance),
    liveGasPriceWei: gasPrice.toString(),
    publishEpochGasEstimate: typeof publishGas === 'bigint' ? publishGas.toString() : publishGas,
    bufferedGas: bufferedGas ? bufferedGas.toString() : null,
    recommendedFundingBot: fundingWei ? formatEther(fundingWei) : null,
    proposedFundingSource: 'Treasury Safe 0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4 — requires separate owner approval',
    funded: false,
  },
  stateChanges: { signatures: 0, broadcasts: 0, flowTransfers: 0, roots: 0, epochs: 0, manifestPublished: false },
  checks,
  blockers,
  verdict,
};

fs.writeFileSync(path.join(DIR, 'P2A_PREFLIGHT.json'), `${JSON.stringify(report, null, 2)}\n`);
if (process.env.P2A_WRITE_MANIFEST === '1' && verdict !== 'BLOCKED_MANIFEST') {
  fs.writeFileSync(
    path.join(DIR, 'P2A_DECISION_MANIFEST.json'),
    `${JSON.stringify({ manifestHash: amended.manifestHash, manifest: amended.manifest }, null, 2)}\n`,
  );
}
console.log(JSON.stringify({ verdict, blockers, checks: checks.length, failed: checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
console.log(`report → ${path.join(DIR, 'P2A_PREFLIGHT.json')}`);
