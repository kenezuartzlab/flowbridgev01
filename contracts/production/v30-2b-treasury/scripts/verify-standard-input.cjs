// Confirms the frozen 14-source Standard-JSON verification package compiles
// byte-identically to the rebuild output. Read-only.
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const D = __dirname.replace(/\/scripts$/, '');
const file = path.join(D, 'verification-standard-input.json');
const raw = fs.readFileSync(file);
const solc = require('/dev-server/node_modules/solc');
const out = JSON.parse(solc.compile(raw.toString('utf8')));
const errs = (out.errors || []).filter((e) => e.severity === 'error');
if (errs.length) {
  console.error(errs.map((e) => e.formattedMessage).join('\n'));
  process.exit(1);
}
const a = out.contracts['FlowStakingRewardTreasury.sol'].FlowStakingRewardTreasury;
const h = (s) => createHash('sha256').update(s).digest('hex');
const hb = (x) => h(Buffer.from(x.replace(/^0x/, ''), 'hex'));
console.log(
  JSON.stringify(
    {
      solc: solc.version(),
      standardInputSha256: h(raw),
      sourceUnits: Object.keys(JSON.parse(raw.toString('utf8')).sources).length,
      creationSha256: hb(a.evm.bytecode.object),
      runtimeSha256: hb(a.evm.deployedBytecode.object),
      abiSha256: h(JSON.stringify(a.abi)),
      solidityWarnings: (out.errors || []).length,
    },
    null,
    2,
  ),
);
