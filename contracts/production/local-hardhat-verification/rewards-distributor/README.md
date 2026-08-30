# FlowRewardsMerkleDistributor — frozen local verification project

Deployed: `0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB` (BOT Mainnet 677)
Explorer: https://scan.botchain.ai/address/0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB

## Frozen build (do not change)

| Field | Value |
| --- | --- |
| Compiler | `v0.8.24+commit.e11b9ed9` |
| Optimizer | enabled, 200 runs |
| viaIR | true |
| EVM version | `cancun` |
| OpenZeppelin | 5.6.1 (vendored in `../vendor/rewards-distributor-oz/`, 15 files, byte-identical to deployment) |
| License | MIT |
| Contract target | `FlowRewardsMerkleDistributor.sol:FlowRewardsMerkleDistributor` |
| Creation sha256 | `21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581` |
| Runtime sha256 | `a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367` (5861 bytes) |
| Constructor args | `constructor-args.js` (ABI-encoded in that file's header) |

On-chain runtime differs only in the 100 bytes of the five `token` immutable slots.

## Run locally

```bash
npm ci            # first run without a lockfile: npm install, then commit the lockfile
npx hardhat compile
npm run hashes    # must print MATCH for creation and runtime
npm run verify    # submits to https://scan.botchain.ai; no private key needed
```

Do not edit any `.sol` file, the compiler settings, or the vendored OpenZeppelin
files. The Solidity source name (`FlowRewardsMerkleDistributor.sol`, at the project root) is part
of the metadata hash — moving it into a subfolder changes the bytecode and
verification will fail.

## Browser fallback

If the explorer edge blocks the automated submission (Cloudflare HTTP 403 has
happened repeatedly for this contract), upload `standard-input.json` on the
explorer's *Solidity (Standard JSON input)* form with the table values above and
the constructor args from `constructor-args.js`.
