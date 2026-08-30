# FlowBridgeActivityRegistry — frozen local verification project

Deployed: `0xa80d8740f378989F649ca14C54e4B4a42E68753c` (BOT Mainnet 677)
Explorer: https://scan.botchain.ai/address/0xa80d8740f378989F649ca14C54e4B4a42E68753c

## Frozen build (do not change)

| Field | Value |
| --- | --- |
| Compiler | `v0.8.20+commit.a1b79de6` |
| Optimizer | enabled, 1 runs |
| viaIR | true |
| EVM version | `shanghai` |
| OpenZeppelin | 5.6.1 (vendored in `../vendor/openzeppelin-contracts-5.6.1/`, 6 files used, byte-identical to deployment) |
| License | MIT |
| Contract target | `FlowBridgeActivityRegistry.sol:FlowBridgeActivityRegistry` |
| Creation sha256 | `25ec99e2bc31648d9e0cb2376c00063c404d2b535afe887f1b9cb37ebfc2cc6d` |
| Runtime sha256 | `53a83eea932da41016a7021926113e4ed50612525768bb6ba0eb1ec876b3e03b` (2713 bytes) |
| Local reproduction | LAYOUT_DIVERGENT — see note below |
| Constructor args | `constructor-args.js` (ABI-encoded in that file's header) |

Deployed runtime is byte-identical to the frozen deployment artifact (no immutables), and this bundle reproduces the same size and the same metadata hash — but not the same viaIR jump layout. Both the published wasm and the published native solc 0.8.20+commit.a1b79de6 builds produce runtime sha256 c164c24b6d9b4929b5c69696600e1458a049341fa4593863da453d2c2d377aa6 from these exact sources and settings, so no local rebuild currently reproduces the deployed bytes and explorer verification is expected to fail for this contract only. Attester address stays lowercase in the ABI-encoded args as broadcast.

## Run locally

```bash
cd ..              # dependencies are installed once, one level up
npm ci             # first run without a lockfile: npm install, then keep the lockfile
cd activity-registry
npm run rebuild    # must print MATCH for creation and runtime
npm run submit     # submits to https://scan.botchain.ai; no private key needed
```

`rebuild` compiles `standard-input.json` verbatim with pinned solc 0.8.20, which
reproduces the deployed bytecode exactly. `hardhat:compile` / `hardhat:verify` are
installed too, but Hardhat re-orders the sources in the compiler input and under
`viaIR` that changes the internal jump layout — same size, same metadata hash,
different bytes — so Hardhat verification can fail where `submit` succeeds. Treat
`rebuild` + `submit` as the authoritative path.

Do not edit any `.sol` file, the compiler settings, or the vendored OpenZeppelin
files. The Solidity source name (`FlowBridgeActivityRegistry.sol`, at the project root) is part
of the metadata hash — moving it into a subfolder changes the bytecode and
verification will fail.

## Browser fallback

If the explorer edge blocks `npm run submit` (Cloudflare HTTP 403 has happened
repeatedly from CI-like networks), upload `standard-input.json` on the
explorer's *Solidity (Standard JSON input)* form with the table values above and
the constructor args from `constructor-args.js`.
