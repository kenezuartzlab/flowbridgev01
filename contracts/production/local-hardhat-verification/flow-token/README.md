# FlowToken — frozen local verification project

Deployed: `0x535ddda826142ac42ce288154e9595f080940ae9` (BOT Mainnet 677)
Explorer: https://scan.botchain.ai/address/0x535ddda826142ac42ce288154e9595f080940ae9

## Frozen build (do not change)

| Field | Value |
| --- | --- |
| Compiler | `v0.8.24+commit.e11b9ed9` |
| Optimizer | enabled, 200 runs |
| viaIR | true |
| EVM version | `cancun` |
| OpenZeppelin | 5.6.1 (vendored in `../vendor/openzeppelin-contracts-5.6.1/`, 20 files used, byte-identical to deployment) |
| License | MIT |
| Contract target | `FlowToken.sol:FlowToken` |
| Creation sha256 | `200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2` |
| Runtime sha256 | `f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf` (3539 bytes) |
| Local reproduction | EXACT — `npm run rebuild` prints MATCH |
| Constructor args | `constructor-args.js` (ABI-encoded in that file's header) |

On-chain runtime differs from the frozen local runtime only in the 131 bytes of EIP-712 immutables written by the constructor.

## Run locally

```bash
cd ..              # dependencies are installed once, one level up
npm ci             # first run without a lockfile: npm install, then keep the lockfile
cd flow-token
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
files. The Solidity source name (`FlowToken.sol`, at the project root) is part
of the metadata hash — moving it into a subfolder changes the bytecode and
verification will fail.

## Browser fallback

If the explorer edge blocks `npm run submit` (Cloudflare HTTP 403 has happened
repeatedly from CI-like networks), upload `standard-input.json` on the
explorer's *Solidity (Standard JSON input)* form with the table values above and
the constructor args from `constructor-args.js`.
