# Local Hardhat source verification — BOT Mainnet 677

Four self-contained Hardhat projects for the contracts that are deployed and
runtime-proven but still `SOURCE_PENDING` on `https://scan.botchain.ai` because the
explorer edge rejects automated submissions from this environment.

| Project | Contract | Address |
| --- | --- | --- |
| `flow-token/` | FlowToken | `0x535ddda826142ac42ce288154e9595f080940ae9` |
| `rewards-distributor/` | FlowRewardsMerkleDistributor | `0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB` |
| `staking-vault-v2/` | FlowStakingVaultV2 | `0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` |
| `activity-registry/` | FlowBridgeActivityRegistry | `0xa80d8740f378989F649ca14C54e4B4a42E68753c` |

Already publicly verified and therefore not included: Router V4, Router Lens,
Staking Reward Treasury, Staking Controller.

## How to use

1. Download / clone this repository locally — do not copy Solidity into a new project.
2. `cd contracts/production/local-hardhat-verification/<project>`
3. `npm ci` (first run without a committed lockfile: `npm install`, then keep the lockfile)
4. `npx hardhat compile`
5. `npm run hashes` — must print `MATCH` for creation and runtime before you verify
6. `npm run verify`

Optional: `export BOT_MAINNET_RPC_URL=https://rpc.botchain.ai` (already the default) and
`export BOT_EXPLORER_API_KEY=...` if the explorer ever requires a key.

## Why these projects are safe to run

- Every Solidity file, including OpenZeppelin 5.6.1, is copied byte-for-byte out
  of the Standard-JSON input used at deployment; OpenZeppelin is a local
  `file:./oz` dependency, so registry drift cannot change the bytes.
- Compiler version, optimizer runs, `viaIR` and EVM version are the frozen
  deployment settings.
- No private key, mnemonic or deployer secret is used or needed. Verification is
  read-only against the explorer; these projects contain no deployment script.
- Each project ships its original `standard-input.json` for the browser fallback.

Do not edit sources or settings. `MANIFEST.json` records every frozen hash.
