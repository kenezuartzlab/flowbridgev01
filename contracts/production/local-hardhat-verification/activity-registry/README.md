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
| OpenZeppelin | 5.6.1 (vendored in `oz/`, 6 files, byte-identical to deployment) |
| License | MIT |
| Contract target | `contracts/FlowBridgeActivityRegistry.sol:FlowBridgeActivityRegistry` |
| Creation sha256 | `25ec99e2bc31648d9e0cb2376c00063c404d2b535afe887f1b9cb37ebfc2cc6d` |
| Runtime sha256 | `53a83eea932da41016a7021926113e4ed50612525768bb6ba0eb1ec876b3e03b` (2713 bytes) |
| Constructor args | `constructor-args.js` (ABI-encoded in that file's header) |

Deployed runtime is byte-identical to the frozen artifact (no immutables). Attester address must stay lowercase in the ABI-encoded args as broadcast.

## Run locally

```bash
npm ci            # first run without a lockfile: npm install, then commit the lockfile
npx hardhat compile
npm run hashes    # must print MATCH for creation and runtime
npm run verify    # submits to https://scan.botchain.ai; no private key needed
```

Do not edit any `.sol` file, the compiler settings, or the OpenZeppelin files in
`oz/`. Any change produces different bytecode and verification will fail.

## Browser fallback

If the explorer edge blocks the automated submission (Cloudflare HTTP 403 has
happened repeatedly for this contract), upload `standard-input.json` on the
explorer's *Solidity (Standard JSON input)* form with the table values above and
the constructor args from `constructor-args.js`.
