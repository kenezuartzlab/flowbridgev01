// V30.2B R2 — FlowRewardsMerkleDistributor reproducibility build.
// Compiles the preserved reviewed source with solc 0.8.24, optimizer 200,
// viaIR: false, Cancun, IPFS metadata + CBOR, OpenZeppelin 5.6.1 (vendored).
// Read-only: never signs or broadcasts.
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const D = __dirname.replace(/\/scripts$/, '');
const SRC = path.join(D, 'sources');

function findImport(p) {
  const f = path.join(SRC, p);
  if (fs.existsSync(f)) return { contents: fs.readFileSync(f, 'utf8') };
  return { error: 'not found ' + p };
}

const input = {
  language: 'Solidity',
  sources: {
    'FlowRewardsMerkleDistributor.sol': {
      content: fs.readFileSync(path.join(SRC, 'FlowRewardsMerkleDistributor.sol'), 'utf8'),
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: false,
    evmVersion: 'cancun',
    metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] },
    },
  },
};

function compile() {
  delete require.cache[require.resolve('/dev-server/node_modules/solc')];
  const solc = require('/dev-server/node_modules/solc');
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) {
    console.error(errs.map((e) => e.formattedMessage).join('\n'));
    process.exit(1);
  }
  return {
    a: out.contracts['FlowRewardsMerkleDistributor.sol'].FlowRewardsMerkleDistributor,
    v: solc.version(),
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
  sourceSha256: h(fs.readFileSync(path.join(SRC, 'FlowRewardsMerkleDistributor.sol'))),
  creationSha256: hb(A.evm.bytecode.object),
  runtimeSha256: hb(A.evm.deployedBytecode.object),
  abiSha256: h(JSON.stringify(A.abi)),
  creationBytes: A.evm.bytecode.object.length / 2,
  runtimeBytes: A.evm.deployedBytecode.object.length / 2,
  doubleBuildIdentical:
    A.evm.bytecode.object === B.evm.bytecode.object &&
    A.evm.deployedBytecode.object === B.evm.deployedBytecode.object &&
    JSON.stringify(A.abi) === JSON.stringify(B.abi),
  standardInputSha256: h(JSON.stringify(input)),
};

fs.writeFileSync(path.join(D, 'standard-input.json'), JSON.stringify(input));
fs.writeFileSync(path.join(D, 'abi.json'), JSON.stringify(A.abi));
fs.writeFileSync(path.join(D, 'creation-bytecode.txt'), '0x' + A.evm.bytecode.object);
console.log(JSON.stringify(res, null, 2));
