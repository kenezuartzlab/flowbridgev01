# V30.2A R1 — FlowToken multi-part verification bundle

Target contract (BOT Mainnet 677): `0x123E64D074FD5d66DBd4BD62Dc4e71da7101DB63`

These are the **exact 21 source files** from the frozen R1 Standard-JSON input
(`../standard-inputs/FlowToken.standard-input.json`, sha256
`d8188e0288c79807f2ff8a209cb099e48cedce51a3ef69086e44c6a448d73590`).
Nothing was fetched from npm; the OpenZeppelin 5.6.1 files are the frozen ones.

## Reproduction proof

Recompiling this folder alone (solc `0.8.24+commit.e11b9ed9`, optimizer on / 200
runs, viaIR off, Cancun, ipfs metadata) reproduces the approved artifact:

- creation sha256 `f15c487550c01c071784a39ff1de895645cb24ab626a719d449103730c7258d5`
- runtime  sha256 `73dcb8db0657a18bd57e4021900c57a646da1c6cb9b6eda3c2e3e725db4130f9`

Both match the R1 preflight and settlement evidence.

## Blockscout form values (Solidity, Multi-part files)

| Field | Value |
| --- | --- |
| Compiler | `v0.8.24+commit.e11b9ed9` |
| Optimization enabled | Yes |
| Optimization runs | `200` |
| EVM version | `cancun` |
| License | MIT |
| Libraries | none (this build links no libraries) |
| viaIR | not applicable — build is non-viaIR |

Constructor arguments (ABI-encoded, copied verbatim from the R1 settlement
evidence — do not retype): see `constructor-args.txt`.

## Files to upload

Upload every `.sol` under `sources/`, preserving relative paths so the
`@openzeppelin/contracts/...` import names resolve:

- `sources/FlowToken.sol`
- `sources/@openzeppelin/contracts/**` (20 files)

Per-file sha256 digests and source names are listed in
`MULTIPART_MANIFEST.json`. If the upload widget flattens names and the
compilation fails on unresolved imports, that is a UI path-mapping failure, not a
source mismatch — fall back to the Standard-JSON method with the same settings.

Nothing in this folder is signed, funded, or broadcast. It is verification input
only; the old FlowToken `0x535dDDA826142AC42cE288154e9595f080940aE9` stays
quarantined and untouched.
