# FlowBridge V30.2B W2 — Post-Wiring Snapshot + Funding Readiness

**Mode:** READ-ONLY. Nothing signed, broadcast, funded, published, or activated.
**Chain:** BOT Mainnet 677 · observed block 21,516,898 · `rpc.botchain.ai`
**Evidence:** `contracts/production/v30-2b-wiring/W2_SNAPSHOT.json`
**Script:** `contracts/production/v30-2b-wiring/scripts/w2-snapshot.mjs`

**Verdict: V30.2B W2 POST-WIRING SNAPSHOT + FUNDING READINESS PASS — PREPARED, NOT FUNDED**

## Canonical V30.2B stack (all publicly verified)

| Gate | Contract | Address | Code |
| --- | --- | --- | --- |
| R1 | FlowToken (FLOW) | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` | 1,786 B |
| R2 | FlowRewardsMerkleDistributor | `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922` | 6,629 B |
| R3 | FlowBridgeActivityRegistry | `0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814` | 3,082 B |
| R4 | FlowStakingRewardTreasury | `0x96552909998F3DbAf5Ff4979dc158508b3442e65` | 4,827 B |
| R5 | FlowStakingController | `0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF` | 7,997 B |
| R6 | FlowStakingVaultV2 | `0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D` | 10,366 B |

## Bindings and roles (post-W1)

- `Distributor.token == Treasury.token == Vault.token == R1 FLOW`
- `Vault.controller == R5`, `Vault.treasury == R4`, `Controller.vault == R6` (W1.1)
- Treasury `VAULT_ROLE` → R6 Vault (W1.2); `CONTROLLER_ROLE` → R5 Controller (W1.3)
- Governance Safe `0x88A4…9507` holds `DEFAULT_ADMIN_ROLE` on Treasury, Controller, Vault, Distributor, Registry, plus Controller `GOVERNOR_ROLE` and Vault `PAUSER_ROLE`
- Operations Safe `0x1Ce0…59eF` holds Vault `PAUSER_ROLE` (W1.5)
- Controller `PUBLISHER_ROLE` unassigned (Governance / Operations / deployer / Vault all false)
- Deployer EOA `0x8512…f3dD` holds no role on any R contract

## Economic emptiness and non-activation

| Reading | Value |
| --- | --- |
| Distributor FLOW balance / totalReserved / totalClaimed / epochCount | `0` / `0` / `0` / `0` |
| Reward Treasury balance / freeBalance / totalObligations | `0` / `0` / `0` |
| Treasury reservedGenesis / reservedFloors / committedEpoch / accruedUnclaimed | `0` |
| Vault totalPrincipal / nextPositionId / FLOW balance | `0` / `0` (zero positions) / `0` |
| Vault per-product stake and flow-per-second (5 products) | all `0` |
| Controller `maxFlowPerEpoch` | `50000000000000000000000` = **50,000 FLOW** |
| Controller `weeklyUsdBudget8` | `0` |
| Controller `oracle` | `0x0000…0000` (unset) |
| Controller `epochCommitted` / `epochEnd` | `0` / `0` — no staking epoch |
| Controller `genesisYear1Used` / `standardYear1Used` | `0` / `0` |
| Year-1 ceilings | 1M genesis / 2M standard / 3M total present |

No reward epoch or merkle root exists; no staking activation occurred.

## Quarantine (all hold 0 new FLOW)

`0x535dDDA8…40aE9` (V30.1 FlowToken), `0x3824681c…5673FB` (V30.1 Distributor),
`0xA861152C…32d0e` (V30.1 Reward Treasury), `0x5095ecc7…b52bf` (V30.1 Controller),
`0x3cc0799f…B989c8` (V30.1 Vault V2), `0xa80d8740…68753c` (V30.1 Activity Registry),
`0x123e64b1…1DB63` (V30.2A FlowToken, superseded).

## App / token registry readiness

`flowRewardsRegistry.ts` and `flowStakingRegistry.ts` keep BOT Mainnet 677 fail-closed:
`token`, `distributor`, `vault` all `null`, `claimsEnabled` and `stakingEnabled` `false`.
No superseded V30.1 / V30.2A mainnet address appears anywhere in the app registries, so
promotion is a single-point change to the six V30.2B addresses. **Deliberately not applied:**
filling the mainnet entries would be public activation, which this gate forbids.

## Prepared Treasury Safe funding actions (unsigned)

Treasury Safe `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` · threshold 2-of-3 · current
`nonce = 0` · FLOW balance 1,000,000,000 — sufficient for both. Separate transactions, never batched.

### F1 — REWARDS_1M

- Token target: `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` · `transfer` `0xa9059cbb` · value `0` · CALL
- Recipient: `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922` (R2 Rewards Distributor)
- Amount: 1,000,000 FLOW = `1000000000000000000000000`
- Calldata: `0xa9059cbb0000000000000000000000007b805b036b22e2b71ef5e8f7ea21d8791819b92200000000000000000000000000000000000000000000d3c21bcecceda1000000`
- Calldata keccak: `0x9e9b90cb8580894e2f1c279c80f454e31f82e3e5551ce5a55656ccecdff9e67c`
- Treasury Safe nonce: **0** · confirmations: 2
- Simulation from Safe: **OK** · gas estimate **52,019** · reverts from deployer EOA
- Expected post-state: Treasury Safe −1,000,000 FLOW; Distributor +1,000,000 FLOW; `totalReserved` 0, `epochCount` 0 unchanged

### F2 — STAKING_10M

- Token target: `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` · `transfer` `0xa9059cbb` · value `0` · CALL
- Recipient: `0x96552909998F3DbAf5Ff4979dc158508b3442e65` (R4 Staking Reward Treasury)
- Amount: 10,000,000 FLOW = `10000000000000000000000000`
- Calldata: `0xa9059cbb00000000000000000000000096552909998f3dbaf5ff4979dc158508b3442e65000000000000000000000000000000000000000000084595161401484a000000`
- Calldata keccak: `0x1594b6a434b16f69c13ff78937adc113d98d84c134828ec83f739910a133dac8`
- Treasury Safe nonce: **1** (after F1) · confirmations: 2
- Simulation from Safe: **OK** · gas estimate **52,031** · reverts from deployer EOA
- Expected post-state: Treasury Safe −10,000,000 FLOW; Reward Treasury +10,000,000 FLOW and `freeBalance` +10,000,000; obligations / reservedGenesis / reservedFloors / committedEpoch / accruedUnclaimed remain 0

## Broadcast ledger

Signed 0 · broadcast 0 · FLOW transferred 0 · role changes 0 · configuration writes 0 ·
roots published 0 · epochs committed 0.
