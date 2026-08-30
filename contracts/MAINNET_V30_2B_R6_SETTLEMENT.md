# V30.2B R6 — FlowStakingVaultV2 Mainnet Settlement

Owner-authorized viaIR exception applies to this contract only.

| Field | Value |
| --- | --- |
| Chain | BOT Mainnet 677 |
| Deployer | 0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD (nonce 14) |
| Address | 0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D |
| Tx | 0x4ec853c82a1dc9acd1da6a7aab8ae7d91f3dc97c490c8c32639eb54721142992 |
| Block | 21,510,026 |
| Receipt | success (gas used 2,370,856 / limit 3,108,092) |
| Payload | frozen keccak 0xcdcd8daf…ea29d27d (verified pre-signing) |
| Build | solc 0.8.24+commit.e11b9ed9, optimizer 200, viaIR true, EVM cancun |

## Runtime parity

On-chain runtime is 10,366 bytes. It differs from the frozen artifact only in the
three constructor-set immutable address slots (28 runs, 560 bytes: `token`,
`controller`, `treasury`). Masking those slots yields byte-exact parity.

## Bindings and roles

- FLOW `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`
- Controller `0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF`
- Reward Treasury `0x96552909998F3DbAf5Ff4979dc158508b3442e65`
- Governance `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` holds `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE`
- Deployer holds no role (admin / pauser / epoch all false)

## Inert state

`nextPositionId = 0` (ids start at 1), `totalPrincipal = 0`, FLOW balance 0,
`currentEpochCommitted = 0`, `currentEpochEnd = 0`, `paused = false`, no token
transfers or approvals emitted by deployment. `withdraw()` carries no
`whenNotPaused` modifier, so principal exit remains available while paused.

## Upstream untouched

R5 `vault == address(0)`, R5 `maxFlowPerEpoch == 0`, R4 `VAULT_ROLE` not granted
to the vault.

## Public verification

Verified on scan.botchain.ai from the exact frozen viaIR=true Standard-JSON
package (14 source units): `FlowStakingVaultV2`, v0.8.24+commit.e11b9ed9,
optimizer 200, EVM cancun.

## Withheld (unauthorized in this gate)

Controller → Vault wiring, R4 `VAULT_ROLE` grant, 50,000 FLOW epoch cap, 10M
FLOW reserve funding, oracle/publisher configuration.
