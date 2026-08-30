# Local Hardhat source verification — BOT Mainnet 677

Four self-contained Hardhat projects for the contracts that are deployed and
runtime-proven but still `SOURCE_PENDING` on `https://scan.botchain.ai` because the
explorer edge rejects automated submissions from this environment.

| Project | Contract | Address | Local reproduction |
| --- | --- | --- | --- |
| `flow-token/` | FlowToken | `0x535ddda826142ac42ce288154e9595f080940ae9` | EXACT |
| `rewards-distributor/` | FlowRewardsMerkleDistributor | `0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB` | EXACT |
| `staking-vault-v2/` | FlowStakingVaultV2 | `0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` | EXACT |
| `activity-registry/` | FlowBridgeActivityRegistry | `0xa80d8740f378989F649ca14C54e4B4a42E68753c` | LAYOUT_DIVERGENT |

Three of the four reproduce the deployed bytecode exactly. `activity-registry` is
`LAYOUT_DIVERGENT`: identical sources, settings, byte length and metadata hash, but a
different `viaIR` jump layout — neither the published wasm nor the published native
solc 0.8.20 build reproduces the deployed bytes, so expect explorer verification to
fail for that contract only until that is resolved.

Already publicly verified and therefore not included: Router V4, Router Lens,
Staking Reward Treasury, Staking Controller.

## How to use

1. Download / clone this repository locally — do not copy Solidity into a new project.
2. `cd contracts/production/local-hardhat-verification`
3. `npm ci` once in `contracts/production/local-hardhat-verification/` (first run without a
   committed lockfile: `npm install`, then keep the lockfile)
4. `cd <project> && npm run rebuild` — must print `MATCH` for creation and runtime
5. `npm run submit` — sends the preserved Standard-JSON bundle to the explorer

Optional: `export BOT_MAINNET_RPC_URL=https://rpc.botchain.ai` (already the default) and
`export BOT_EXPLORER_API_KEY=...` if the explorer ever requires a key.

## Why these projects are safe to run

- Every Solidity file, including OpenZeppelin 5.6.1, is copied byte-for-byte out
  of the Standard-JSON input used at deployment; OpenZeppelin is a local
  `file:./vendor/openzeppelin-contracts-5.6.1` dependency, so registry drift cannot change the bytes.
- Compiler version, optimizer runs, `viaIR` and EVM version are the frozen
  deployment settings.
- No private key, mnemonic or deployer secret is used or needed. Verification is
  read-only against the explorer; these projects contain no deployment script.
- Each project ships its original `standard-input.json`, which is what `submit`
  sends and what you upload in the browser fallback.
- `npm run rebuild` compiles that bundle verbatim with the pinned solc and fails
  loudly unless the frozen creation and runtime hashes match.
- Hardhat is installed for convenience (`hardhat:compile`, `hardhat:verify`), but it
  re-orders the compiler input sources; under `viaIR` that yields a different
  internal jump layout, so prefer `rebuild` + `submit`.

Do not edit sources or settings. `MANIFEST.json` records every frozen hash.
