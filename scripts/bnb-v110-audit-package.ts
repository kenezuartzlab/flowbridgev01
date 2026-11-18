/** Build a reproducible V1.6 external-auditor handoff without modifying the frozen candidate. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { keccak256 } from 'viem';
import { CUSTOM_BNB_ARCHITECTURE, CUSTOM_LAUNCH_GATES } from '../contracts/audit/bnb-v110/customArchitecture';
import { BNB_ASSETS } from '../src/lib/bnb/quoteAdapter';
import { POOL_GATE } from '../src/lib/rwa/quoteReadiness';
// @ts-expect-error local compiler module
import { compile, standardInput } from '../contracts/candidates/bnb-swap-adapter-v1-6/scripts/compile.mjs';

const DIR = 'contracts/candidates/bnb-swap-adapter-v1-6';
const SOURCE = 'FlowBridgeBnbSwapAdapterV1_6.sol';
const OUTPUT = 'docs/security/BNB_SWAP_V1_10_AUDITOR_HANDOFF_20261118.json';
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const FILES = [SOURCE, 'MANIFEST.json', 'README.md', 'scripts/compile.mjs', 'test/Mocks.sol', 'test/adapter.evm.test.ts'];

export function buildAuditHandoff() {
  const source = readFileSync(`${DIR}/${SOURCE}`, 'utf8');
  const manifest = JSON.parse(readFileSync(`${DIR}/MANIFEST.json`, 'utf8'));
  const artifact = compile()[SOURCE].FlowBridgeBnbSwapAdapterV1_6;
  const checks = {
    sourceSha256: sha256(source), sourceKeccak: keccak256(Buffer.from(source)),
    creationBytecodeKeccak: keccak256(`0x${artifact.evm.bytecode.object}`),
    unlinkedRuntimeKeccak: keccak256(`0x${artifact.evm.deployedBytecode.object}`),
    runtimeBytes: artifact.evm.deployedBytecode.object.length / 2,
  };
  if (checks.sourceSha256 !== CUSTOM_BNB_ARCHITECTURE.candidateSourceSha256 || checks.sourceKeccak !== manifest.sourceKeccak || checks.creationBytecodeKeccak !== manifest.creationBytecodeKeccak || checks.unlinkedRuntimeKeccak !== manifest.unlinkedRuntimeKeccak || checks.runtimeBytes !== manifest.runtimeBytes || JSON.stringify(artifact.abi) !== JSON.stringify(manifest.abi)) throw new Error('Frozen candidate reproduction mismatch');
  const appReferences = execFileSync('bash', ['-c', `rg -l "FlowBridgeBnbSwapAdapterV1|bnb-swap-adapter-v1" src contracts/production || true`], { encoding: 'utf8' }).split('\n').filter((file) => file && !file.endsWith('adapterCandidateFence.test.ts') && !file.endsWith('AGENTS.md'));
  if (appReferences.length) throw new Error(`Candidate escaped local fence: ${appReferences.join(',')}`);
  const slither = JSON.parse(readFileSync('docs/security/BNB_SWAP_V1_10_SLITHER_20261118.json', 'utf8'));
  const highTraces = slither.results.detectors.filter((row: any) => row.impact === 'High').map((row: any, index: number) => ({ id: `S${index + 1}`, detector: row.check, impact: row.impact, confidence: row.confidence, description: row.description, status: 'OPEN_PENDING_INDEPENDENT_AUDIT' }));
  if (highTraces.length !== 6 || highTraces.some((row: any) => row.detector !== 'reentrancy-balance')) throw new Error('Expected six open reentrancy-balance traces');
  const fork = JSON.parse(readFileSync('docs/security/BNB_SWAP_V1_10_FORK_REHEARSAL_20261118.json', 'utf8'));
  const core = {
    schema: 'flowbridge-bnb-custom-audit-handoff-v1', release: 'HOLD', architecture: CUSTOM_BNB_ARCHITECTURE,
    candidate: {
      directory: DIR, sourceFile: SOURCE, compiler: manifest.compiler, optimizerRuns: 200, evmVersion: 'cancun', checks,
      expectedChainId: 56,
      constructorTargets: { WBNB: BNB_ASSETS.WBNB.address, USDT: BNB_ASSETS.USDT.address, ROUTER: POOL_GATE.router, allowedPoolFees: [500, 2500], feeRecipient: 'UNAPPROVED_CONSTRUCTOR_INPUT', feeBps: 'UNAPPROVED_5_OR_10_PROPOSAL_ONLY' },
      standardJsonInput: standardInput(),
      artifact: { abi: artifact.abi, creationBytecode: `0x${artifact.evm.bytecode.object}`, unlinkedRuntimeBytecode: `0x${artifact.evm.deployedBytecode.object}`, immutableReferences: artifact.evm.deployedBytecode.immutableReferences },
      sourceClosure: { [SOURCE]: source },
      fileSha256: Object.fromEntries(FILES.map((file) => [`${DIR}/${file}`, sha256(readFileSync(`${DIR}/${file}`))])),
    },
    independence: { independentProfessionalAudit: 'NOT_DONE', automatedSelfReviewOnly: true, productionApproved: false },
    staticAnalysis: { tool: 'Slither 0.11.5 via nixpkgs', compiler: 'solc 0.8.38', generatedArtifact: 'docs/security/BNB_SWAP_V1_10_SLITHER_20261118.json', detectorCount: slither.results.detectors.length, highTraces },
    localFork: { status: fork.status, block: fork.fork.block, realBytecode: fork.realBytecode, summary: fork.summary, checks: fork.checks, caveat: 'Local fork receipts are not mainnet transactions or proof of future execution.' },
    designLimits: {
      pool: 'One immutable POOL_FEE per deployment; no dynamic-best routing. Two-instance or new dual-tier candidate requires explicit owner scope and audit.',
      pause: 'No on-chain pause or privileged role. A UI kill switch cannot prevent direct calls. Guardian pause requires a new separately frozen and audited candidate.',
      donations: 'No sweep. Donated USDT/WBNB and forced native BNB are permanently unrecoverable and excluded from per-call settlement.',
      mev: 'User minNetOut is net of fee; router amountOutMinimum is 1 because adapter performs final net check. Owner slippage/TTL/MEV policy remains unapproved.',
      tokens: 'Exact balance deltas reject fee-on-transfer and unexpected output. USDT issuer powers remain external risks. XAUt is BLOCKED.',
      native: 'Adapter wraps input BNB itself and unwraps only net output. USDT-to-BNB fee remains WBNB. Router native residue/refund paths are never used.',
      approvals: 'Exact per-swap approval; post-router allowance must be zero or the transaction reverts.',
    },
    launchGates: CUSTOM_LAUNCH_GATES,
    riskRegister: [
      { id: 'AUDIT-001', severity: 'HIGH', state: 'OPEN', risk: 'No independent professional audit; six Slither HIGH traces require auditor disposition.' },
      { id: 'DESIGN-001', severity: 'HIGH', state: 'OPEN', risk: 'Single immutable pool tier cannot ensure best verified 500/2500 net output per trade.' },
      { id: 'OPS-001', severity: 'HIGH', state: 'OPEN', risk: 'No on-chain pause; UI disablement cannot stop direct contract interaction.' },
      { id: 'FEE-001', severity: 'HIGH', state: 'OPEN', risk: 'BNB fee rate and treasury recipient are unapproved; 5/10 bps are test proposals only.' },
      { id: 'MEV-001', severity: 'HIGH', state: 'OPEN', risk: 'Slippage, TTL, order limits and MEV policy lack owner approval and physical-wallet review.' },
      { id: 'TOKEN-001', severity: 'MEDIUM', state: 'OPEN', risk: 'USDT issuer/owner powers and legal terms are external to immutable adapter code.' },
      { id: 'RWA-001', severity: 'HIGH', state: 'BLOCKED', risk: 'XAUt upgrade/issuer/RWA restrictions; no generic token bypass exists.' },
      { id: 'RPC-001', severity: 'MEDIUM', state: 'OPEN', risk: 'Official observations use the same operator, not an independent quorum.' },
      { id: 'DEP-001', severity: 'HIGH', state: 'OPEN', risk: 'Fresh production dependency scan: 12 rows (4 high, 8 moderate); remediation not in this scope.' },
      { id: 'WALLET-001', severity: 'HIGH', state: 'OPEN', risk: 'Physical mobile-wallet signing/rejection and separately authorized rehearsal are incomplete.' },
      { id: 'ECON-001', severity: 'MEDIUM', state: 'OPEN', risk: 'Gas and pool conditions vary; local receipt +63,293 gas and earlier +94,275 estimate are not guarantees.' },
      { id: 'DUST-001', severity: 'LOW', state: 'ACCEPTED_FOR_REVIEW', risk: 'Integer fee rounds down to zero for dust; minimum order policy is unapproved.' },
      { id: 'DONATION-001', severity: 'LOW', state: 'ACCEPTED_DESIGN_LIMIT', risk: 'Donations and forced native are permanently stranded; no recovery exists.' },
      { id: 'DEPLOY-001', severity: 'HIGH', state: 'OPEN', risk: 'No mainnet deployment, source verification, multisig check or capped canary authorization.' },
    ],
    reproduction: [
      'node contracts/candidates/bnb-swap-adapter-v1-6/scripts/compile.mjs (writes candidate manifest; auditors should compare Git diff and restore only their own generated output)',
      'bunx vitest run contracts/candidates/bnb-swap-adapter-v1-6 contracts/audit/bnb-v110 src/lib/bnb/adapterCandidateFence.test.ts',
      'nix shell nixpkgs#foundry -c bun scripts/bnb-v110-fork-rehearsal.ts',
      'nix shell nixpkgs#slither-analyzer nixpkgs#solc-select -c slither contracts/candidates/bnb-swap-adapter-v1-6/FlowBridgeBnbSwapAdapterV1_6.sol --solc-args "--optimize --optimize-runs 200 --evm-version cancun"',
    ],
  };
  return { generatedAt: new Date().toISOString(), coreSha256: sha256(JSON.stringify(core)), ...core };
}

if (process.argv[1]?.endsWith('bnb-v110-audit-package.ts')) {
  const packet = buildAuditHandoff();
  writeFileSync(OUTPUT, JSON.stringify(packet, null, 2) + '\n');
  console.log(JSON.stringify({ output: OUTPUT, coreSha256: packet.coreSha256, sourceSha256: packet.candidate.checks.sourceSha256, highTraces: packet.staticAnalysis.highTraces.length, fork: packet.localFork.status, independentAudit: packet.independence.independentProfessionalAudit }));
}
