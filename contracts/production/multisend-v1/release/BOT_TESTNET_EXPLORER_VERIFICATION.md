# MultiSend V1 — BOT Testnet explorer verification attempt

Status: **BLOCKED — explorer verifier cannot reproduce the deployed layout**
(no contract change, no redeploy, no weakening of any setting)

## What was attempted (automated, through the explorer API)

scan.bohr.life is a Blockscout instance and *does* expose automated verification:

- `POST /api/v2/smart-contracts/{address}/verification/via/standard-input`
- `POST /api` with `module=contract&action=verifysourcecode&codeformat=solidity-standard-json-input`
- `is_rust_verifier_microservice_enabled: true`, `v0.8.20+commit.a1b79de6` is offered.

Three submissions were made with the frozen settings (0.8.20, optimizer on / 200 runs,
viaIR, shanghai, ipfs metadata hash, MIT, recorded constructor args):

1. frozen `verification/standard-input.json` (single source, OpenZeppelin imports
   resolved by the build's import callback) → `Fail - Unable to verify`
   (the remote verifier has no way to resolve `@openzeppelin/...`).
2. same, with explicit constructor args → `Fail - Unable to verify`.
3. complete standard JSON with all 11 sources inlined (OpenZeppelin 5.0.2 from
   `node_modules`, byte-identical content) → `Fail - Unable to verify`.

## Root cause (proved locally with the pinned compiler)

On-chain runtime (`eth_getCode`, chain 968): 13 544 hex chars,
sha256 `5453b43e504d89ce9dd922eb08a5a202e5d93f11aa7a736ba937a2f6a9047349`.

With *identical* sources, identical settings and identical solc metadata
(`settings` and `sources` sections of the compiler metadata compare equal):

| build shape | runtime sha256 | matches chain |
| --- | --- | --- |
| 1 source + import callback (how the deployed artifact was produced) | `5453b43e…047349` | yes (exact) |
| 11 sources inlined in the standard JSON | `e88272e2…2d1462` | no |
| 11 sources inlined, narrowed `outputSelection` | `e88272e2…2d1462` | no |
| flattened single file | `a1fadc50…713544f` | no |
| inlined + remapped source names | `567f532f…83b162b` | no |

The difference is layout only (same byte length, jump destinations differ), a
viaIR code-placement difference that depends on how the compilation unit set is
presented to solc 0.8.20. Blockscout can only compile a fully inlined standard
JSON, so it produces `e88272e2…` and rejects the match. No source, setting or
safety rule was changed to chase this.

## Exact values for manual submission (scan.bohr.life UI)

| field | value |
| --- | --- |
| Contract address | `0x535dDDA826142AC42cE288154e9595f080940aE9` |
| Contract name | `FlowBridgeMultiSend.sol:FlowBridgeMultiSend` |
| Compiler type | Solidity (Standard JSON input) |
| Compiler version | `v0.8.20+commit.a1b79de6` |
| Optimization | Enabled, 200 runs |
| viaIR | true |
| EVM version | `shanghai` |
| Metadata bytecode hash | `ipfs` |
| Libraries | none |
| License | MIT |
| Constructor arguments (ABI-encoded) | `0x000000000000000000000000851275569923c62a2ef962ec35bfbb8f1bcbf3dd000000000000000000000000851275569923c62a2ef962ec35bfbb8f1bcbf3dd` |
| Constructor values | initialOwner `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`, initialFeeRecipient `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` |
| Deployment tx | `0xcaf7df7178a02c5d5c4f6b4c4ad74f54b1d4f1c95c407c65f94fce17877e5971` (block 24259496) |
| Standard JSON file | `contracts/production/multisend-v1/verification/standard-input.json` |
| Flattened source | `contracts/production/multisend-v1/verification/FlowBridgeMultiSend.flat.sol` |
| ABI | `contracts/production/multisend-v1/artifacts/FlowBridgeMultiSend.json` |
| Creation bytecode sha256 | `8cb6aeaadf019cee1e18bd3c230d0bbafeaac961565500d69f445bfec761eef0` |
| Runtime bytecode sha256 | `5453b43e504d89ce9dd922eb08a5a202e5d93f11aa7a736ba937a2f6a9047349` |
| Source sha256 | `3284801055c7f40c939e55a660d740e0d7caf2bf243311659810d6a8c00d91f4` |
| ABI sha256 | `918f74150f872a11ad41f5660ab4d3bda082bd6e4bbf5df27e3a548de7f0f8e7` |

A manual submission will hit the same layout mismatch, because the explorer UI
feeds the same rust verifier. The only ways to get an explorer-green badge:

1. ask the BOT explorer operators to accept the frozen standard JSON /
   register the source manually, or
2. rebuild MultiSend from a fully inlined standard JSON and deploy that build to
   testnet (requires explicit approval; the current contract stays untouched).

Source-reproduction evidence for the live contract remains PASS and is recorded
in `release/bot-testnet-source-reproduction.json`.
