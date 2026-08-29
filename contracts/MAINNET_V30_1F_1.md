# FlowBridge V30.1F — F.1 Controller → Vault Binding Settlement

Chain 677. Exactly one governance state change executed; nothing else touched.

## Transactions

| Item | Value |
| --- | --- |
| Safe transaction hash | `0x140ec170d1f7c2d8e1effa34feb8341413a66f2c532c094f156c1d1eae3b1490` |
| On-chain execution hash | `0xe8ea7f4e013b613e64a46761e80ad7ad7232ab7d6f6ce7d7b081da2a671ad259` |
| Safe | `0x88A4…9507` (Governance) |
| Block | 21,376,826 |
| Status | success (`0x1`) |
| Gas used / price | 106,704 @ 20 gwei = 0.00213408 BOT |

The Safe emitted `ExecutionSuccess` for the F.1 Safe tx hash. Inner call decodes to
`setVault(0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8)` with selector `0x6817031b` and
calldata hash `0xa64fc6b5…cb453` — byte-identical to the approved V30.1F F.1 preparation.

## Post-execution state (block 21,377,652)

- Controller `vault` = `0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` (deployed Vault V2)
- Controller `maxFlowPerEpoch = 0`, `weeklyUsdBudget8 = 0`, oracle unset, `emergencyMode = false`
- Governance retains `GOVERNOR_ROLE`
- Vault: principal 0, positions 0, unpaused, FLOW balance 0
- Reward Treasury: FLOW balance 0, `VAULT_ROLE` and `CONTROLLER_ROLE` still ungranted
- Operations Safe still not a Vault pauser

Staking remains economically inert: no treasury roles, no budget, no oracle, no funding.

## Verdict

`FLOWBRIDGE V30.1F F.1 CONTROLLER VAULT BINDING SETTLED - VERIFIED, NO FURTHER EXECUTION`

Remaining approved steps F.2a, F.2b, F.3, F.4 are unexecuted and awaiting your per-transaction
go-ahead. Router `setRegistryActivationDelay(86400)` remains `ROUTER_DELAY_DECISION_REQUIRED`.
