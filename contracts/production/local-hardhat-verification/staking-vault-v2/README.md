# FlowStakingVaultV2 — frozen local verification project

Deployed: `0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` (BOT Mainnet 677)
Explorer: https://scan.botchain.ai/address/0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8

## Frozen build (do not change)

| Field | Value |
| --- | --- |
| Compiler | `v0.8.24+commit.e11b9ed9` |
| Optimizer | enabled, 200 runs |
| viaIR | true |
| EVM version | `cancun` |
| OpenZeppelin | 5.6.1 (vendored in `../vendor/openzeppelin-contracts-5.6.1/`, 13 files used, byte-identical to deployment) |
| License | MIT |
| Contract target | `FlowStakingVaultV2.sol:FlowStakingVaultV2` |
| Creation sha256 | `159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6` |
| Runtime sha256 | `af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce` (10366 bytes) |
| Local reproduction | EXACT — `npm run rebuild` prints MATCH |
| Constructor args | `constructor-args.js` (ABI-encoded in that file's header) |

Constructor args keccak256 0xc19ac2409811e9b37f32175a7869863cc7673216514e19ee5db98241e39b3c54.

## Run locally

```bash
cd ..              # dependencies are installed once, one level up
npm ci             # first run without a lockfile: npm install, then keep the lockfile
cd staking-vault-v2
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
files. The Solidity source name (`FlowStakingVaultV2.sol`, at the project root) is part
of the metadata hash — moving it into a subfolder changes the bytecode and
verification will fail.

## Browser fallback

If the explorer edge blocks `npm run submit` (Cloudflare HTTP 403 has happened
repeatedly from CI-like networks), upload `standard-input.json` on the
explorer's *Solidity (Standard JSON input)* form with the table values above and
the constructor args from `constructor-args.js`.
