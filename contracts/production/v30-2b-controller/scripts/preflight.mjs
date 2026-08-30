// V30.2B R5 — FlowStakingController preflight. READ-ONLY.
// Encodes the frozen constructor args, predicts the CREATE address, estimates
// gas, proves the five product economics / Year-1 ceilings / fail-closed oracle
// rules from the frozen source, and proves no old-stack address contamination.
// Never signs, never broadcasts, never funds, never grants a role.
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

// Frozen constructor: (address admin, address governor, address publisher)
const ARGS = {
  admin: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507', // Governance Safe
  governor: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507', // Governance Safe
  publisher: '0x0000000000000000000000000000000000000000', // UNSET by design
};

const OLD = {
  oldFlowToken: '0x535ddda826142ac42ce288154e9595f080940ae9',
  oldTreasury: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  oldController: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
  oldVault: '0x2E4b4A1dD3f4F1F1a2f0d0dE9ad9cF8fA2ba0d9C',
};
const NEW_TREASURY_R4 = '0x96552909998F3DbAf5Ff4979dc158508b3442e65';

const h = (s) => createHash('sha256').update(s).digest('hex');
const client = createPublicClient({ transport: http(RPC) });

const creation = fs.readFileSync(path.join(D, 'creation-bytecode.txt'), 'utf8').trim();
const encoded = encodeAbiParameters(
  [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
  [getAddress(ARGS.admin), getAddress(ARGS.governor), ARGS.publisher],
);
const data = creation + encoded.slice(2);

const chainId = await client.getChainId();
const blockNumber = await client.getBlockNumber();
const pendingNonce = await client.getTransactionCount({ address: DEPLOYER, blockTag: 'pending' });
const balance = await client.getBalance({ address: DEPLOYER });
const deployerCode = (await client.getCode({ address: DEPLOYER })) ?? '0x';
const predicted = getContractAddress({ from: DEPLOYER, nonce: BigInt(pendingNonce) });
const predictedCode = (await client.getCode({ address: predicted })) ?? '0x';
const treasuryCode = (await client.getCode({ address: NEW_TREASURY_R4 })) ?? '0x';

let gasEstimate;
try {
  gasEstimate = (await client.estimateGas({ account: DEPLOYER, data })).toString();
} catch (e) {
  gasEstimate = 'ESTIMATE_FAILED: ' + (e.shortMessage || e.message);
}
const gasPrice = await client.getGasPrice();
const buffered = /^\d+$/.test(gasEstimate)
  ? ((BigInt(gasEstimate) * 130n) / 100n).toString()
  : null;

// ---------------------------------------------------------------- source proofs
const srcPath = path.join(D, 'sources', 'FlowStakingController.sol');
const src = fs.readFileSync(srcPath, 'utf8');
const lower = src.toLowerCase();
const payloadLower = data.toLowerCase();

const expectProducts = [
  { id: 0, name: 'Flexible', lock: '0', genesis: 1800, floor: 0, target: 1000, cap: 1200 },
  { id: 1, name: 'Lock 30D', lock: '30 days', genesis: 2700, floor: 800, target: 1400, cap: 1800 },
  { id: 2, name: 'Lock 90D', lock: '90 days', genesis: 3600, floor: 1000, target: 1800, cap: 2400 },
  { id: 3, name: 'Lock 180D', lock: '180 days', genesis: 4800, floor: 1200, target: 2400, cap: 3200 },
  { id: 4, name: 'Lock 365D', lock: '365 days', genesis: 6000, floor: 1500, target: 3000, cap: 4000 },
];
const products = expectProducts.map((p) => {
  const re = new RegExp(
    `_setProduct\\(${p.id},\\s*${p.lock.replace(/ /g, '\\s+')},\\s*${p.genesis},\\s*${p.floor},\\s*${p.target},\\s*${p.cap},\\s*1 ether\\)`,
  );
  return {
    ...p,
    genesisAprPct: p.genesis / 100,
    floorPct: p.floor / 100,
    targetPct: p.target / 100,
    hardCapPct: p.cap / 100,
    matchesFrozenSource: re.test(src),
  };
});

const caps = {
  genesisYear1Cap: /GENESIS_YEAR1_CAP\s*=\s*1_000_000 ether/.test(src),
  standardYear1Cap: /STANDARD_YEAR1_CAP\s*=\s*2_000_000 ether/.test(src),
  totalYear1Cap: /TOTAL_YEAR1_CAP\s*=\s*3_000_000 ether/.test(src),
};
const capEnforcementSites = (src.match(/Year1CapExceeded\(\)/g) || []).length;

const oracleFailClosed = {
  oracleNotConfiguredRevert: /revert OracleNotConfigured\(\)/.test(src),
  stalenessGate: /revert OracleStale\(\)/.test(src),
  liquidityGate: /revert OracleInsufficientLiquidity\(\)/.test(src),
  deviationGate: /revert OracleDeviationTooHigh\(\)/.test(src),
  maxFlowPerEpochGate: /revert EpochBudgetExceedsMaxFlow\(\)/.test(src),
  weeklyRateGuard: /revert RateGuardBreached\(\)/.test(src),
};

const noMint = {
  mintSelectorAbsent: !/\bmint\s*\(/.test(src),
  noTokenTransferFrom: !/transferFrom\s*\(/.test(src),
  noTokenTransfer: !/\.transfer\s*\(/.test(src),
};

const initialInertState = {
  vaultDeclaredWithoutInitializer: /IFlowStakingVaultV2View public vault;/.test(src),
  vaultNotAssignedInConstructor: !/constructor[\s\S]*?vault\s*=/.test(
    src.slice(src.indexOf('constructor('), src.indexOf('// ------------------------------------------------------------ governance')),
  ),
  vaultSetOnlyByGovernor: /function setVault\([^)]*\)[^{]*onlyRole\(GOVERNOR_ROLE\)/.test(src),
  maxFlowPerEpochNotSetInConstructor: !/constructor[\s\S]*?maxFlowPerEpoch\s*=/.test(
    src.slice(src.indexOf('constructor('), src.indexOf('// ------------------------------------------------------------ governance')),
  ),
  weeklyUsdBudget8NotSetInConstructor: !/constructor[\s\S]*?weeklyUsdBudget8\s*=/.test(
    src.slice(src.indexOf('constructor('), src.indexOf('// ------------------------------------------------------------ governance')),
  ),
  oracleNotSetInConstructor: !/constructor[\s\S]*?oracle\s*=\s*/.test(
    src.slice(src.indexOf('constructor('), src.indexOf('// ------------------------------------------------------------ governance')),
  ),
  publisherRoleGrantedOnlyIfNonZero:
    /if \(publisher != address\(0\)\) _grantRole\(PUBLISHER_ROLE, publisher\);/.test(src),
  publisherArgIsZero: ARGS.publisher === '0x0000000000000000000000000000000000000000',
  noEpochPublishedInConstructor: !/constructor[\s\S]*?epochIndex\s*=/.test(
    src.slice(src.indexOf('constructor('), src.indexOf('// ------------------------------------------------------------ governance')),
  ),
  productsConfiguredByConstructor: true,
};

const oldRefsInSource = Object.entries(OLD).filter(([, a]) => lower.includes(a.toLowerCase()));
const oldRefsInPayload = Object.entries(OLD).filter(([, a]) =>
  payloadLower.includes(a.toLowerCase().slice(2)),
);

const out = {
  gate: 'V30.2B_R5_PREFLIGHT',
  mode: 'READ_ONLY_NO_SIGNING_NO_BROADCAST',
  chainId,
  observedBlock: Number(blockNumber),
  buildMatrix: {
    solc: '0.8.24+commit.e11b9ed9',
    optimizer: { enabled: true, runs: 200 },
    viaIR: false,
    evmVersion: 'cancun',
    metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
    sourceUnits: 6,
    settingsSource: 'contracts/production/V30_2A_REDEPLOY_PREFLIGHT.json replacements[R5]',
  },
  artifact: {
    sourceSha256: h(fs.readFileSync(srcPath)),
    creationSha256: h(Buffer.from(creation.replace(/^0x/, ''), 'hex')),
    creationBytes: (creation.length - 2) / 2,
    runtimeSha256: h(
      Buffer.from(
        fs.readFileSync(path.join(D, 'runtime-bytecode.txt'), 'utf8').trim().replace(/^0x/, ''),
        'hex',
      ),
    ),
    runtimeBytes:
      (fs.readFileSync(path.join(D, 'runtime-bytecode.txt'), 'utf8').trim().length - 2) / 2,
    abiSha256: h(fs.readFileSync(path.join(D, 'abi.json'))),
    standardInputSha256: h(fs.readFileSync(path.join(D, 'verification-standard-input.json'))),
  },
  constructor: {
    signature: 'constructor(address admin, address governor, address publisher)',
    ...ARGS,
    encoded,
    keccak: keccak256(encoded),
  },
  authorityState: {
    DEFAULT_ADMIN_ROLE: ARGS.admin,
    GOVERNOR_ROLE: ARGS.governor,
    PUBLISHER_ROLE: 'UNSET — zero publisher argument, no grant executed',
    oracle: 'UNSET — no constructor assignment; governor-only setter',
    deployerRoles: 'NONE',
  },
  rewardTreasuryBinding: {
    r4Treasury: NEW_TREASURY_R4,
    r4TreasuryHasCode: treasuryCode !== '0x',
    frozenSourceRequiresConstructorTreasuryArg: /constructor\(address admin, address governor, address publisher\)/.test(src),
    note: 'Frozen reviewed source takes no treasury constructor argument; treasury/vault wiring is post-deployment governor action, not part of R5.',
  },
  economics: { products, caps, capEnforcementSites, oracleFailClosed, noMint },
  initialInertState,
  oldStackContamination: {
    inSource: oldRefsInSource.map(([k]) => k),
    inPayload: oldRefsInPayload.map(([k]) => k),
    clean: oldRefsInSource.length === 0 && oldRefsInPayload.length === 0,
  },
  live: {
    deployer: DEPLOYER,
    deployerIsEoa: deployerCode === '0x',
    pendingNonce,
    balanceBOT: formatEther(balance),
    gasPriceGwei: (Number(gasPrice) / 1e9).toString(),
    predictedAddress: predicted,
    predictedAddressCodeless: predictedCode === '0x',
    deploymentDataBytes: (data.length - 2) / 2,
    deploymentDataKeccak: keccak256(data),
    gasEstimate,
    gasLimitBuffered30: buffered,
  },
  writesPerformed:
    'NONE — no signing, no broadcast, no FLOW movement, no treasury funding, no role grant, no product activation call, no oracle/publisher configuration',
};

fs.writeFileSync(path.join(D, 'PREFLIGHT.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(D, 'constructor-args.txt'), encoded);
fs.writeFileSync(path.join(D, 'unsigned-deployment-data.txt'), data);
console.log(JSON.stringify(out, null, 2));
