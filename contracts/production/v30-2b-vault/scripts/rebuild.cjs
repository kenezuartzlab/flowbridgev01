// V30.2B R6 — FlowStakingVaultV2 reproducibility build. READ-ONLY (no chain access).
//
// Build rule from the R6 gate: attempt the EXACT frozen source with viaIR=false
// FIRST. The Solidity source is never edited and no optimizer/EVM/metadata
// setting is changed to make non-viaIR succeed. If (and only if) non-viaIR fails
// with the stack-depth condition, the frozen viaIR=true bundle is compiled
// read-only twice to prove reproducibility.
//
// Frozen matrix source of truth: contracts/production/V30_2A_REDEPLOY_PREFLIGHT.json
// replacements[R6] — solc 0.8.24+commit.e11b9ed9, optimizer enabled runs 200,
// EVM cancun, metadata ipfs + appendCBOR, OpenZeppelin 5.6.1 (14 source units).
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const D = __dirname.replace(/\/scripts$/, '');
const FROZEN = path.join(D, 'frozen-standard-input.json');
const frozenBytes = fs.readFileSync(FROZEN, 'utf8');
const frozen = JSON.parse(frozenBytes);

const h = (s) => createHash('sha256').update(s).digest('hex');
const hb = (x) => h(Buffer.from(x.replace(/^0x/, ''), 'hex'));

function compile(inputJson) {
  delete require.cache[require.resolve('/dev-server/node_modules/solc')];
  const solc = require('/dev-server/node_modules/solc');
  const out = JSON.parse(solc.compile(inputJson));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  return { out, errors, warnings: (out.errors || []).filter((e) => e.severity !== 'error'), v: solc.version() };
}

// ---------------------------------------------------------- 1) non-viaIR first
const nonViaIrInput = JSON.stringify({
  ...frozen,
  settings: { ...frozen.settings, viaIR: false },
});
const attempt = compile(nonViaIrInput);
const nonViaIr = {
  viaIR: false,
  sourceEdited: false,
  settingsChangedBeyondViaIr: false,
  result: attempt.errors.length ? 'COMPILE_FAILED' : 'COMPILE_OK',
  errors: attempt.errors.map((e) => ({
    type: e.type,
    message: (e.formattedMessage || e.message).trim(),
  })),
};

// ------------------------------------------- 2) frozen viaIR bundle (verbatim)
const one = compile(frozenBytes);
if (one.errors.length) {
  console.error(one.errors.map((e) => e.formattedMessage).join('\n'));
  process.exit(1);
}
const two = compile(frozenBytes);
const A = one.out.contracts['FlowStakingVaultV2.sol'].FlowStakingVaultV2;
const B = two.out.contracts['FlowStakingVaultV2.sol'].FlowStakingVaultV2;

const runtimeBytes = A.evm.deployedBytecode.object.length / 2;
const res = {
  gate: 'V30.2B_R6_REBUILD',
  mode: 'READ_ONLY_NO_SIGNING_NO_BROADCAST',
  solc: one.v,
  buildMatrix: {
    solc: '0.8.24+commit.e11b9ed9',
    optimizer: frozen.settings.optimizer,
    viaIR: frozen.settings.viaIR,
    evmVersion: frozen.settings.evmVersion,
    metadata: frozen.settings.metadata,
    sourceUnits: Object.keys(frozen.sources).length,
    settingsSource: 'contracts/production/V30_2A_REDEPLOY_PREFLIGHT.json replacements[R6]',
  },
  nonViaIrAttempt: nonViaIr,
  solidityWarnings: one.warnings.length,
  sourceSha256: h(frozen.sources['FlowStakingVaultV2.sol'].content),
  standardInputSha256: h(frozenBytes),
  creationSha256: hb(A.evm.bytecode.object),
  runtimeSha256: hb(A.evm.deployedBytecode.object),
  normalizedAbiSha256: h(JSON.stringify(A.abi)),
  creationBytes: A.evm.bytecode.object.length / 2,
  runtimeBytes,
  eip170: { limit: 24576, withinLimit: runtimeBytes <= 24576, headroomBytes: 24576 - runtimeBytes },
  doubleBuildIdentical:
    A.evm.bytecode.object === B.evm.bytecode.object &&
    A.evm.deployedBytecode.object === B.evm.deployedBytecode.object &&
    JSON.stringify(A.abi) === JSON.stringify(B.abi),
};

fs.writeFileSync(path.join(D, 'abi.json'), JSON.stringify(A.abi));
fs.writeFileSync(path.join(D, 'creation-bytecode.txt'), '0x' + A.evm.bytecode.object);
fs.writeFileSync(path.join(D, 'runtime-bytecode.txt'), '0x' + A.evm.deployedBytecode.object);
fs.writeFileSync(path.join(D, 'verification-standard-input.json'), frozenBytes);
console.log(JSON.stringify(res, null, 2));
