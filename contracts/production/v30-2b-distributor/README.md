# V30.2B R2 — FlowRewardsMerkleDistributor candidate (frozen)

Read-only preflight artifacts. Nothing here has been signed or broadcast.

| File | Purpose |
| --- | --- |
| `sources/FlowRewardsMerkleDistributor.sol` | Reviewed production source, verbatim (source SHA-256 `cbf90ce7…0bec0d43`) |
| `sources/@openzeppelin/contracts/**` | Frozen OpenZeppelin 5.6.1 dependencies (vendored, never refetched) |
| `standard-input.json` | Exact Standard-JSON verification package (`bdfc4f68…c2cec091`) |
| `abi.json` / `creation-bytecode.txt` | Compiled ABI and creation bytecode |
| `constructor-args.txt` / `constructor-args.js` | ABI-encoded and human-readable constructor arguments |
| `unsigned-deployment-data.txt` | Creation bytecode + encoded args (keccak `0xdc112416…f17c1366`) |
| `MANIFEST.json` | Full frozen preflight evidence |
| `SHA256SUMS.txt` | Hashes of every candidate file (excluding vendored OZ tree) |
| `scripts/rebuild.cjs` | Double-compile reproducibility check (solc 0.8.24, runs 200, viaIR false, cancun) |
| `scripts/preflight.mjs` | Read-only live chain preflight (chain ID, nonce, CREATE address, gas) |

Build: solc `0.8.24+commit.e11b9ed9`, optimizer 200, `viaIR: false`, EVM cancun,
metadata bytecodeHash `ipfs` with `appendCBOR: true`. Double build is
byte-identical. Runtime is 6,629 bytes (EIP-170 compliant).

Reward token is bound exclusively to the V30.2B FlowToken
`0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`. Initial funding 0 FLOW, initial
reserved obligations 0, no epoch or root publication.

See `contracts/MAINNET_V30_2B_R2_PREFLIGHT.md` for the full report.
