# FlowBridge V30.1F — Post-Deployment Wiring + Guardrails Preflight

Read-only gate. Nothing signed, nothing broadcast, no value moved.
Observed on BOT Mainnet 677 at block 21,371,606, gas price 20 gwei, deployer nonce 8.

## Current authority / state proof

| Contract | Address | State |
| --- | --- | --- |
| Staking Controller | `0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf` | `vault = address(0)`, `maxFlowPerEpoch = 0`, `weeklyUsdBudget8 = 0`, oracle unset, Governance = admin + governor, no publisher, deployer has no role |
| Reward Treasury | `0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e` | balance 0, all obligation buckets 0, no VAULT/CONTROLLER role granted, Governance = admin |
| Staking Vault V2 | `0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` | bindings match deployed FLOW/Controller/Treasury, principal 0, positions 0, FLOW 0, Governance = admin + pauser, Operations not pauser |
| Rewards Distributor | `0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB` | unchanged: balance 0, reserved 0, claimed 0, epochs 0, `minPublishDelay = 86400` |
| Activity Registry | `0xa80d8740f378989F649ca14C54e4B4a42E68753c` | unchanged, empty, Governance admin |
| Router V4 | `0x3c6fdaf93f39c72be931ab80196292962ebe6b06` | owner = Governance, feeTreasury = Treasury Safe, `globalFeeBps = 0`, `registryActivationDelay = 0`, registry empty, NOT promoted (v3 live) |
| FlowToken | `0x535dDDA826142AC42cE288154e9595f080940aE9` | 1,000,000,000 FLOW, entire supply still in Treasury Safe |

## Prepared governance transactions (Governance Safe `0x88A4…9507`)

All five approved calls simulate OK via `eth_call` from the Safe and revert from the deployer EOA
(no EOA governance path exists). One transaction per state change; no batching.

| Step | Call | Calldata hash | Gas |
| --- | --- | --- | --- |
| F.1 | `Controller.setVault(Vault V2)` | `0xa64fc6b5…cb453` | 46,823 |
| F.2a | `Treasury.grantRole(VAULT_ROLE, Vault)` | `0x654e20c0…f8ce` | 51,624 |
| F.2b | `Treasury.grantRole(CONTROLLER_ROLE, Controller)` | `0x8d12af93…4a1c` | 51,636 |
| F.3 | `Vault.grantRole(PAUSER_ROLE, Operations Safe)` | `0xa65a9a60…494e` | 51,686 |
| F.4 | `Controller.setBudgets(0, 50000e18)` | `0x94105082…8da5` | 50,139 |

Total approved gas 251,908 ≈ 0.00503816 BOT.

Role identifiers were derived from the deployed ABI/source and confirmed by on-chain
`VAULT_ROLE()`, `CONTROLLER_ROLE()`, `PAUSER_ROLE()` reads, not guessed.

### F.3 pause authority

`FlowStakingVaultV2` grants `PAUSER_ROLE` to the constructor admin and `getRoleAdmin(PAUSER_ROLE)`
is `DEFAULT_ADMIN_ROLE`, so Governance may delegate pause to Operations. The frozen
`TIMELOCK_POLICY` requires only "immediate pause through a narrowly scoped pauser" — it does not
require Operations-exclusive pause — so **no revocation of Governance `PAUSER_ROLE` is prepared**.
Governance retains `DEFAULT_ADMIN_ROLE`.

### F.4 ceiling units

`setBudgets(uint256 weeklyUsdBudget8, uint256 maxFlowPerEpoch)` is `GOVERNOR_ROLE`-gated;
`maxFlowPerEpoch` is FLOW wei. 50,000 FLOW → `50000000000000000000000` for the 604,800-second epoch.
This is a ceiling only: `publishVariableEpoch` still requires a healthy oracle and non-zero
`weeklyUsdBudget8`, both of which remain fail-closed.

## Router V4 registry delay

`ROUTER_DELAY_DECISION_REQUIRED`. The frozen manifest approves a general 24h `TIMELOCK_POLICY`
that lists "Router registry changes", but no Router-V4-specific `registryActivationDelay` value was
approved as an exact on-chain parameter, and V30.1F §4 forbids inferring it. Calldata for
`setRegistryActivationDelay(86400)` is prepared and simulates OK (47,937 gas) but is **not approved**.

## Source verification

Verified: Router V4, Router Lens, Staking Reward Treasury, Staking Controller.
Pending (`EXPLORER_TRANSPORT_BLOCKED`): FlowToken, Rewards Distributor, Activity Registry, Staking
Vault V2. Frozen bundles preserved byte-for-byte; nothing redeployed, no compiler/source change.
Final V30.1E release PASS still requires public publication.

## Verdict

`FLOWBRIDGE V30.1F POST-DEPLOYMENT WIRING GUARDRAILS PREFLIGHT PASS - APPROVED, NOT BROADCAST`

Funding (Rewards 1M FLOW, Staking Reward Treasury 10M FLOW) remains a later checkpoint.
