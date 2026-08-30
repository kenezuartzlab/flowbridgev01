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
| OpenZeppelin | 5.6.1 (vendored in `../vendor/openzeppelin-contracts-5.6.1/`, 15 files used, byte-identical to deployment) |
| License | MIT |
| Contract target | `FlowRewardsMerkleDistributor.sol:FlowRewardsMerkleDistributor` |
| Creation sha256 | `21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581` |
| Runtime sha256 | `a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367` (5861 bytes) |
| Local reproduction | EXACT — `npm run rebuild` prints MATCH |
| Constructor args | `constructor-args.js` (ABI-encoded in that file's header) |

On-chain runtime differs only in the 100 bytes of the five `token` immutable slots.

## Run locally

```bash
cd ..              # dependencies are installed once, one level up
npm ci             # first run without a lockfile: npm install, then keep the lockfile
cd rewards-distributor
npm run rebuild    # must print MATCH for creation and runtime
npm run submit     # submits to https://scan.botchain.ai; no private key needed
```

`rebuild` compiles `standard-input.json` verbatim with pinned solc 0.8.24, which
reproduces the deployed bytecode exactly. `hardhat:compile` / `hardhat:verify` are
installed too, but Hardhat re-orders the sources in the compiler input and under
`viaIR` that changes the internal jump layout — same size, same metadata hash,
different bytes — so Hardhat verification can fail where `submit` succeeds. Treat
`rebuild` + `submit` as the authoritative path.

Do not edit any `.sol` file, the compiler settings, or the vendored OpenZeppelin
files. The Solidity source name (`FlowRewardsMerkleDistributor.sol`, at the project root) is part
of the metadata hash — moving it into a subfolder changes the bytecode and
verification will fail.

## Browser fallback

If the explorer edge blocks `npm run submit` (Cloudflare HTTP 403 has happened
repeatedly from CI-like networks), upload `standard-input.json` on the
explorer's *Solidity (Standard JSON input)* form with the table values above and
the constructor args from `constructor-args.js`.
