# FlowBridge V30.1E.14 — Stage E.1 Settlement: FlowStakingRewardTreasury

**Verdict: `STAGE_E1_SETTLED_ONCHAIN_AND_SOURCE_VERIFIED`** — BOT Mainnet 677.

Exactly one transaction was broadcast. Controller (E.2) and Vault V2 (E.3) remain
unauthorized. No FLOW was funded, no role was granted, no product was enabled,
no oracle was configured.

## Transaction

| Field | Value |
|---|---|
| Tx | `0x1928f133f95497edfa0549307e78f5ac93c30d47793273e2cd515851ed104350` |
| Block | 21,358,833 |
| Nonce / value | 5 / 0 BOT |
| Address | `0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e` (exactly as predicted) |
| Gas used / limit | 1,001,010 / 1,313,159 |
| Fee | 0.0200202 BOT |
| Unsigned-data keccak | `0x967f90fb…115fdd7b` (matched before signing) |

## Build parity

Frozen `stakingV2` line — solc `0.8.24+commit.e11b9ed9`, optimizer 200, viaIR,
EVM cancun, OpenZeppelin 5.6.1. Double build byte-identical from the preserved
Standard-JSON input; creation `d090c6ba…aa28f` (4,604 bytes), runtime
`9dabd23c…a0cf3c` (4,137 bytes) — exact manifest parity.

### Immutable-aware runtime parity

viaIR does not emit `immutableReferences`, so the deployed code was byte-diffed
against the frozen artifact: same length (4,137 bytes), and exactly five 20-byte
ranges differ — `[393,412]`, `[1015,1034]`, `[1168,1187]`, `[2622,2641]`,
`[2943,2962]` — each containing the canonical FLOW token address
`0x535ddda826142ac42ce288154e9595f080940ae9` in the immutable `token` slots.
No other byte differs. `EXACT_IMMUTABLE_AWARE_MATCH`.

## Post-settlement verification

- FLOW token binding → canonical FlowToken `0x535dDDA8…40aE9`
- `DEFAULT_ADMIN_ROLE` → Governance Safe `0x88A4CC1F…ce9507`
- Recovery recipient → Treasury Safe `0xeFc13d1A…229Ea4`
- Deployer holds no role (`DEFAULT_ADMIN_ROLE`, `VAULT_ROLE`, `CONTROLLER_ROLE` all false); no `VAULT_ROLE`/`CONTROLLER_ROLE` holder exists
- FLOW balance = 0; `reservedGenesis` = `reservedFloors` = `committedEpoch` = `accruedUnclaimed` = `totalObligations` = `freeBalance` = 0
- Recovery bounded: `recoverFree()` is admin-only and cannot exceed
  `freeBalance() = balance − totalObligations()`; a deployer static call reverts
- No mint path in the ABI; the 10,000,000 FLOW inventory was not transferred

## Source verification

Blockscout v2 Standard-JSON submission accepted and completed:
`is_verified: true`, `FlowStakingRewardTreasury`, `v0.8.24+commit.e11b9ed9`.
The exact compiler input remains preserved at
`contracts/production/stage-e-verification/standard-input-FlowStakingRewardTreasury.json`.

## Stage locks

Stage E.2 Controller (expected nonce 6, `0x5095ecc7…1b52bf`) and Stage E.3
Vault V2 (expected nonce 7, `0x3cc0799f…B989c8`) require explicit authorization.
Router v3 remains live production; Stage A/B stay source-pending and Stage D
stays `EXPLORER_TRANSPORT_BLOCKED` — untouched by this stage.
