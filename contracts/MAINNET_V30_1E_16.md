# FlowBridge V30.1E Stage E.3 — FlowStakingVaultV2 settlement (BOT Mainnet 677)

Exactly one authorized transaction was broadcast. No configuration, funding,
role grant, `setVault`, oracle setup, stake or UI activation occurred.

## Build parity

- solc `0.8.24+commit.e11b9ed9`, optimizer 200, `viaIR: true`, EVM Cancun, OpenZeppelin 5.6.1
- Standard JSON input `contracts/production/stage-e-verification/standard-input-FlowStakingVaultV2.json`
  (sha256 `cea8ef2f…af9636`), rebuilt twice byte-identically
- Creation sha256 `159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6` (11,254 bytes) — matches the authorized value
- Runtime sha256 `af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce` (10,366 bytes) — matches the authorized value

## Pre-sign revalidation (block 21,366,225)

chain 677 · deployer nonce 7 · balance 2.25412392 BOT · gas price 20 gwei ·
candidate `fnv1a64:19671fd13a81be19` · manifest `fnv1a64:9972234982dbe76f` ·
constructor-args keccak `0xc19ac240…9b3c54` · unsigned-data keccak
`0x654e7597031841556f69bdfdaa6522d708a0a1d78b31de05e31ff6ae9c613440` ·
data 11,382 bytes · gas estimate 2,390,840 · predicted address
`0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` codeless.

## Transaction

| field | value |
| --- | --- |
| tx | `0xe3d000d3243a0b85862e64fff63e340ccabb2e73831b2293cd87ec1f1b43f6c9` |
| block | 21,366,262 (ts 1788008561) |
| status | 1 |
| address | `0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` |
| nonce / value | 7 / 0 BOT |
| gas used / limit | 2,370,856 / 3,108,092 |
| fee | 0.04741712 BOT |

## Runtime parity

10,366 on-chain bytes vs 10,366 compiled. The raw on-chain hash is
`78ae940e…bf2fb3`; it differs from the frozen hash in exactly 28 twenty-byte
ranges, each equal to one of the three immutable dependency addresses (FLOW
token, Controller, Reward Treasury). Classification:
`EXACT_IMMUTABLE_AWARE_MATCH`.

## Post-settlement proof

- Bindings: `token` = `0x535dDDA8…40aE9`, `controller` = `0x5095ecc7…1b52bf`, `treasury` = `0xA861152C…32d0e` — all immutable and exactly the deployed contracts
- Governance Safe `0x88A4CC1F…ce9507` holds `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE`; deployer holds none; `EPOCH_ROLE` has no holders (epoch entry is gated by `msg.sender == controller`)
- `totalPrincipal = 0`, `nextPositionId = 0` (0 positions), per-product staked = 0, accumulators = 0, epoch committed/moved/end = 0, FLOW balance = 0
- Not economically reachable: Controller `vault` is unset, `maxFlowPerEpoch = 0`, no Treasury role granted to the vault, oracle unset, reward inventory unfunded
- Locked products keep fixed maturities (30/90/180/365 days) with no normal early exit (`PositionLocked`); Flexible has no fixed lock; mature `withdraw()` remains available and works while paused
- No mint, slashing, confiscation, sweep/rescue, payable function, `receive` or `fallback`; `withdraw()` returns exact principal

## Product-flag semantics (frozen)

`product.active == true` means the product definition and rate matrix exist. It
is not a public-availability switch. Public staking is unavailable.

## Source verification

Blockscout v2 Standard JSON submission returned HTTP 403 (Cloudflare challenge)
on the verification POST endpoint across 5 attempts; GET reads succeed. Status:
`EXPLORER_TRANSPORT_BLOCKED`. The exact package is preserved unchanged and
reproduces the frozen artifact, so it can be resubmitted as-is.

## Verdict

`STAGE_E3_SETTLED_ONCHAIN_VERIFIED_SOURCE_PENDING` — deployment only.
The post-deployment governance/configuration gate (setVault, Treasury roles,
pause delegation, 50,000 FLOW weekly budget, oracle, 10M FLOW inventory, UI
activation) remains unauthorized. Router v3 remains live.
