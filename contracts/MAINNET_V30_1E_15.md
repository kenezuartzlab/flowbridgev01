# FlowBridge V30.1E.15 — Stage E.2 Settlement: FlowStakingController

**Verdict: `STAGE_E2_SETTLED_ONCHAIN_AND_SOURCE_VERIFIED`** — Stage E.3 (Vault) remains unauthorized.

## Transaction (exactly one)

| Field | Value |
| --- | --- |
| Chain | BOT Mainnet 677 |
| Tx hash | `0x70e7cbfc298c2f6ea33483f1531b29538bf4fba7a64d6b3ce6c4ce241b3a8f49` |
| Block | 21,363,621 (timestamp 1788006580) |
| Deployer / nonce | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` / 6 |
| Contract | `0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf` (exact predicted address) |
| Value | 0 BOT |
| Gas used / limit | 1,949,156 / 2,555,531 |
| Fee | 0.03898312 BOT |

## Pre-sign revalidation (block 21,363,599)

chain 677, nonce 6, balance 2.29310704 BOT, gas price 20 gwei, candidate `fnv1a64:19671fd13a81be19`,
manifest `fnv1a64:9972234982dbe76f`, creation SHA `c54baac0…77ef8`, constructor-args keccak
`0xf03d5b65…4c856`, unsigned-data keccak `0xb3bdd9c9…6d844893`, gas estimate 1,965,793, predicted
address codeless. All matched the authorization exactly.

## Build parity

solc `0.8.24+commit.e11b9ed9`, optimizer 200, `viaIR: true`, EVM Cancun, OpenZeppelin 5.6.1.
Double build reproducible; creation 8,876 bytes / SHA `c54baac0…77ef8`; runtime 7,108 bytes /
SHA `e534f7b8…1f459b`.

**Runtime parity:** on-chain runtime is 7,108 bytes and differs from the compiled artifact in
exactly one 4-byte range (`4063–4066`), which decodes to `1788006580` — the `year1Start` immutable
set to the deploy block timestamp. Classification: `EXACT_IMMUTABLE_AWARE_MATCH`.

## Post-settlement proofs

- Governance Safe `0x88A4…9507` holds `DEFAULT_ADMIN_ROLE` and `GOVERNOR_ROLE`.
- Deployer holds no admin, governor or publisher role.
- `PUBLISHER_ROLE` has zero holders — publisher was `address(0)` at genesis and remains unset.
- Year-1 caps: Genesis 1,000,000 FLOW, Standard 2,000,000 FLOW, Total 3,000,000 FLOW; used = 0/0.
- `maxFlowPerEpoch = 0` and `weeklyUsdBudget8 = 0` → the approved **50,000 FLOW/week ceiling is not
  activated**; that belongs to the later controlled configuration stage.
- Oracle unset; `referenceHealthy()` returns `(false, 1)`; `quoteEpochBudget()` reverts
  `OracleNotConfigured` → dynamic bonus is fail-closed/unavailable.
- No epoch published, no reward released (`epochEnd`, `epochCommitted`, `prevImpliedVarBps` all 0,
  `emergencyMode = false`).
- `vault` is `address(0)`. `setVault` is a governor action reserved for the later activation stage,
  as the frozen design intends.
- Controller holds no FLOW, has no mint path and cannot move principal.

### Product matrix — honest reading

All five products are present with the exact frozen economics (Flexible 18%/0/10/12, 30D
27%/8/14/18, 90D 36%/10/18/24, 180D 48%/12/24/32, 365D 60%/15/30/40, min 1 FLOW each).

The frozen constructor writes each product with `active = true`; that flag is a rate-matrix
presence flag, not a public-availability switch. Nothing is stakeable: the vault binding is unset,
`maxFlowPerEpoch = 0`, the oracle is unset, and `FlowStakingVaultV2` is not deployed. Stage E.2
reconfigured or enabled zero products.

## Public verification

Blockscout v2 Standard-JSON verification succeeded on `scan.botchain.ai`: `is_verified: true`,
name `FlowStakingController`, compiler `v0.8.24+commit.e11b9ed9`, using the preserved input at
`contracts/production/stage-e-verification/standard-input-FlowStakingController.json`.

## Nothing else happened

Zero FLOW funding, zero role grants, zero oracle configuration, zero `setVault`, zero epoch
publication, zero `maxFlowPerEpoch` change, zero Safe transactions, zero Router migration, zero
unrelated writes. Router v3 remains the live production router.
