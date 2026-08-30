// V30.2B R3 — FlowBridgeActivityRegistry reproducibility build.
// Exact frozen matrix: solc 0.8.20+commit.a1b79de6, optimizer enabled runs 200,
// viaIR: false, EVM shanghai, metadata bytecodeHash ipfs + appendCBOR,
// OpenZeppelin 5.x sources vendored verbatim from the reviewed pack.
// Read-only: never signs or broadcasts.
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const D = __dirname.replace(/\/scripts$/, '');
const SRC = path.join(D, 'sources');
const UNITS = [
  'FlowBridgeActivityRegistry.sol',
  '@openzeppelin/contracts/access/AccessControl.sol',
  '@openzeppelin/contracts/access/IAccessControl.sol',
  '@openzeppelin/contracts/utils/Pausable.sol',
  '@openzeppelin/contracts/utils/Context.sol',
  '@openzeppelin/contracts/utils/introspection/ERC165.sol',
  '@openzeppelin/contracts/utils/introspection/IERC165.sol',
];

const input = {
  language: 'Solidity',
  sources: Object.fromEntries(
    UNITS.map((u) => [u, { content: fs.readFileSync(path.join(SRC, u), 'utf8') }]),
  ),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: false,
    evmVersion: 'shanghai',
    metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] },
    },
  },
};

function compile() {
  const p = require.resolve('/dev-server/node_modules/solc-0.8.20');
  delete require.cache[p];
  const solc = require(p);
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) {
    console.error(errs.map((e) => e.formattedMessage).join('\n'));
    process.exit(1);
  }
  const warns = (out.errors || []).filter((e) => e.severity !== 'error');
  return {
    a: out.contracts['FlowBridgeActivityRegistry.sol'].FlowBridgeActivityRegistry,
    v: solc.version(),
    warnings: warns.length,
  };
}

const h = (s) => createHash('sha256').update(s).digest('hex');
const hb = (x) => h(Buffer.from(x.replace(/^0x/, ''), 'hex'));

const one = compile();
const two = compile();
const A = one.a;
const B = two.a;

const res = {
  solc: one.v,
  evmVersion: 'shanghai',
  optimizer: { enabled: true, runs: 200 },
  viaIR: false,
  metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
  sourceUnits: UNITS.length,
  sourceSha256: h(fs.readFileSync(path.join(SRC, 'FlowBridgeActivityRegistry.sol'))),
  creationSha256: hb(A.evm.bytecode.object),
  runtimeSha256: hb(A.evm.deployedBytecode.object),
  abiSha256: h(JSON.stringify(A.abi)),
  creationBytes: A.evm.bytecode.object.length / 2,
  runtimeBytes: A.evm.deployedBytecode.object.length / 2,
  solidityWarnings: one.warnings,
  doubleBuildIdentical:
    A.evm.bytecode.object === B.evm.bytecode.object &&
    A.evm.deployedBytecode.object === B.evm.deployedBytecode.object &&
    JSON.stringify(A.abi) === JSON.stringify(B.abi),
  standardInputSha256: h(JSON.stringify(input)),
};

fs.writeFileSync(path.join(D, 'standard-input.json'), JSON.stringify(input));
fs.writeFileSync(path.join(D, 'abi.json'), JSON.stringify(A.abi));
fs.writeFileSync(path.join(D, 'creation-bytecode.txt'), '0x' + A.evm.bytecode.object);
fs.writeFileSync(path.join(D, 'runtime-bytecode.txt'), '0x' + A.evm.deployedBytecode.object);
console.log(JSON.stringify(res, null, 2));
