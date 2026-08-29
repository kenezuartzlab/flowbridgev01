# FlowBridge V30.1E.13 — Stage E staking-v2 preflight (read-only)

**Verdict: `FLOWBRIDGE V30.1E STAGE E PREFLIGHT PASS — APPROVED, NOT BROADCAST`**

Observed on BOT Mainnet `677` at block `21,357,833`. Nothing was signed,
broadcast, funded, activated or configured.

## Frozen build parity

Build line `stakingV2` — solc `0.8.24+commit.e11b9ed9`, optimizer runs `200`,
`viaIR`, EVM `cancun`, OpenZeppelin `5.6.1`. Each contract was built twice from a
clean process; both builds and the manifest matched exactly.

| Contract | creation SHA-256 / bytes | runtime SHA-256 / bytes |
| --- | --- | --- |
| FlowStakingRewardTreasury | `d090c6ba…aa28f` / 4,604 | `9dabd23c…a0cf3c` / 4,137 |
| FlowStakingController | `c54baac0…77ef8` / 8,876 | `e534f7b8…1f459b` / 7,108 |
| FlowStakingVaultV2 | `159b8849…e80e4f6` / 11,254 | `af5ed43f…94b7ce` / 10,366 |

Exact Standard-JSON compiler inputs are preserved in
`contracts/production/stage-e-verification/` and each reproduces its frozen
artifact byte-for-byte (Stage D lesson applied).

## Live revalidation

- chain `677`, deployer `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`, live nonce `5`
- balance `2.31312724 BOT`, gas price `20 gwei`
- Governance Safe `0x88A4…9507`, Treasury Safe `0xeFc1…9Ea4`, Operations Safe `0x1Ce0…59eF` — all contracts, 2-of-3 threshold, owners unchanged
- FlowToken `0x535d…0ae9`: symbol `FLOW`, total supply exactly 1,000,000,000 FLOW, entirely held by the Treasury Safe
- candidate `fnv1a64:19671fd13a81be19`, manifest `fnv1a64:9972234982dbe76f` unchanged
- all three expected CREATE addresses currently have no code

## Constructor graph (derived from source, no cycles)

1. `FlowStakingRewardTreasury(token_, admin, recoveryRecipient_)` — independent
2. `FlowStakingController(admin, governor, publisher)` — independent
3. `FlowStakingVaultV2(token_, controller_, treasury_, admin)` — must be last

## Unsigned deployment review

| # | Contract | Nonce | Expected address | Gas est. / limit | Fee (buffered) | Unsigned data keccak |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | RewardTreasury | 5 | `0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e` | 1,010,122 / 1,313,159 | 0.02626318 BOT | `0x967f90fb…15fdd7b` |
| 2 | Controller | 6 | `0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf` | 1,965,793 / 2,555,531 | 0.05111062 BOT | `0xb3bdd9c9…6d844893` |
| 3 | VaultV2 | 7 | `0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` | 2,390,840 / 3,108,092 | 0.06216184 BOT | `0x654e7597…9c613440` |

Total buffered fee `0.13953564 BOT`, well inside the funded balance.

Constructor arguments:

- Treasury: token `FlowToken`, admin `Governance Safe`, recovery recipient `Treasury Safe`
- Controller: admin `Governance Safe`, governor `Governance Safe`, publisher `address(0)` — `PUBLISHER_ROLE` deliberately ungranted at genesis
- Vault: token `FlowToken`, controller/treasury = the predicted nonce-6 / nonce-5 CREATE addresses, admin `Governance Safe` (the frozen constructor also grants `PAUSER_ROLE` to admin; delegating pause to the Operations Safe is a later governance action, never a source change)

## Genesis expectations after settlement

- Reward Treasury: 0 FLOW balance, 0 funded inventory, 0 liabilities, `VAULT_ROLE`/`CONTROLLER_ROLE` ungranted
- Controller: 5 products defined (Flexible 18%, 30D 27%, 90D 36%, 180D 48%, 365D 60% genesis APR ceilings), Year-1 caps 1M genesis / 2M standard / 3M total, epoch 7 days, genesis window 90 days, `weeklyUsdBudget8 = 0`, `maxFlowPerEpoch = 0`, oracle `address(0)` so dynamic bonus is fail-closed, `vault` unset
- Vault V2: 0 positions, 0 principal custody, 0 reward liability, unpaused
- No product is enabled, no FLOW moves, no mint path exists, and no user-visible staking is turned on by deployment alone

## Scope lock

Approvals are issued one per transaction (`STAGE_E_1/2/3`). They exclude the
10,000,000 FLOW funding, product activation, oracle configuration, role grants,
`setVault`, and any Safe transaction. If an earlier CREATE address or the live
nonce changes at signing time, all Stage E approvals are void and must be
regenerated. Router v3 remains the live production router; Stage A/B remain
source-pending and Stage D remains `EXPLORER_TRANSPORT_BLOCKED` — unchanged.

No staking transaction may be broadcast until this report is reviewed and the
first staking deployment is explicitly authorized.
