// Builds the PRIVATE V1.14 packet with V1.15 review workflow (artifacts + SHA256SUMS). Never publishes or shares anything.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { keccak256 } from 'viem';
import { compile, SOURCE } from '../contracts/candidates/bnb-swap-adapter-v1-13/scripts/compile.mjs';
const SRC = 'contracts/candidates/bnb-swap-adapter-v1-13/' + SOURCE;
const OUT = 'contracts/audit/bnb-v114-community-readiness';
const EXPECT = '5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425';
const EXPECT_ABI = 'd4453c306a097b9141ef62403bcefa3c436a7fd90dcc888805e75d94e5b9b856';
const EXPECT_RUNTIME_FILE = 'f9919c16f1ac98b1c0195150b7373006113d33b1c83385aafca7b8d77ade8f9e';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const srcHash = sha(fs.readFileSync(SRC));
if (srcHash !== EXPECT) throw new Error('V1.13 source hash drift: ' + srcHash);
const c = compile()[SOURCE].FlowBridgeBnbSwapAdapterV1_13;
const man = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/MANIFEST.json', 'utf8'));
const creation = '0x' + c.evm.bytecode.object, runtime = '0x' + c.evm.deployedBytecode.object;
const abiText = JSON.stringify(c.abi, null, 2) + '\n';
if (keccak256(creation) !== man.creationBytecodeKeccak || keccak256(runtime) !== man.unlinkedRuntimeKeccak) throw new Error('bytecode does not reproduce MANIFEST');
if (JSON.stringify(c.abi) !== JSON.stringify(man.abi)) throw new Error('ABI drift');
if (sha(abiText) !== EXPECT_ABI || sha(runtime + '\n') !== EXPECT_RUNTIME_FILE) throw new Error('review artifact SHA256 drift');
fs.writeFileSync(`${OUT}/artifacts/abi.json`, abiText);
fs.writeFileSync(`${OUT}/artifacts/creation.bytecode.hex`, creation + '\n');
fs.writeFileSync(`${OUT}/artifacts/runtime.unlinked.hex`, runtime + '\n');
fs.writeFileSync(`${OUT}/artifacts/FREEZE.json`, JSON.stringify({
  status: 'LOCAL CANDIDATE — NOT DEPLOYED, NOT AUDITED, NO HUMAN SIGN-OFF', source: SRC, sourceSha256: srcHash,
  abiSha256: EXPECT_ABI, runtimeUnlinkedSha256: EXPECT_RUNTIME_FILE,
  compiler: man.compiler, optimizerRuns: 200, evmVersion: 'cancun', creationKeccak: man.creationBytecodeKeccak, runtimeKeccak: man.unlinkedRuntimeKeccak,
  immutableReferences: c.evm.deployedBytecode.immutableReferences,
  reviewWorkflow: 'V1.16 — private substantive signed human responses only', reviewStatus: 'ZERO_REVIEWERS',
  responseExpiryDays: 90, revisionRule: 'Any Solidity, ABI or runtime change requires a new candidate and resets all responses',
  ownerInput: 'OWNER_DIRECT_EOA_CHOICE_RECORDED', governanceException: 'OWNER_EOA_EXCEPTION_PROPOSED', riskAcknowledgment: 'PENDING',
  feeBpsSelected: 5, feeStatus: 'FEE_RATE_SELECTED_PAYABLE_CONFIGURATION_NOT_AUTHORIZED',
}, null, 2) + '\n');
const extra = [
  'src/lib/bnb/launchReadiness.ts', 'src/lib/bnb/launchReadiness.test.ts',
  'src/lib/bnb/addressVerification.ts', 'src/lib/bnb/addressVerification.test.ts', 'scripts/bnb-owner-address-verify.ts',
  'src/lib/bnb/communityPeerReview.ts', 'src/lib/bnb/communityPeerReview.test.ts',
  'src/lib/bnb/walletDryRun.ts', 'src/lib/bnb/walletDryRun.test.ts',
  'src/lib/bnb/executionReviewPolicy.ts', 'src/lib/bnb/executionReviewPolicy.test.ts',
  'scripts/bnb-v114-packet.mjs', 'scripts/bnb-v115-bundle-audit.mjs', 'scripts/bnb-v115-wallet-browser-check.py',
  'scripts/compact-ad-fixed-check.py',
  'contracts/audit/bnb-v113-community/review.v113.evm.test.ts',
  'contracts/audit/bnb-v113-community/direct-eoa.v116.evm.test.ts',
  'docs/security/BNB_V1_16_DIRECT_EOA_GOVERNANCE_READINESS_20261126.md',
  'src/lib/bnb/feePolicy.ts', 'src/lib/bnb/feePolicy.test.ts',
  'contracts/audit/bnb-v117-fee-selection/fee5.v117.evm.test.ts',
  'docs/security/BNB_V1_17_OWNER_FEE_SELECTION_20261126.md',
];
const include = [SRC, 'contracts/candidates/bnb-swap-adapter-v1-13/MANIFEST.json', ...extra,
  ...fs.readdirSync('docs/security/bnb-bot-v4-parity').map((f) => 'docs/security/bnb-bot-v4-parity/' + f),
  ...fs.readdirSync('contracts/candidates/bnb-swap-adapter-v1-13/test').map((f) => 'contracts/candidates/bnb-swap-adapter-v1-13/test/' + f),
  ...fs.readdirSync(OUT, { recursive: true }).map((f) => `${OUT}/${f}`).filter((p) => fs.statSync(p).isFile() && !p.endsWith('SHA256SUMS'))].sort();
fs.writeFileSync(`${OUT}/SHA256SUMS`, include.map((p) => `${sha(fs.readFileSync(p))}  ${p}`).join('\n') + '\n');
console.log(JSON.stringify({ srcHash, abiSha256: EXPECT_ABI, runtimeFileSha256: EXPECT_RUNTIME_FILE, files: include.length, creation: man.creationBytecodeKeccak, runtime: man.unlinkedRuntimeKeccak }));
