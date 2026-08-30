# V30.2B W1 — Staking Governance Wiring Preflight (READ-ONLY)

Verdict: **V30.2B W1 GOVERNANCE WIRING PREFLIGHT PASS**

Chain 677 (BOT Mainnet), block 21,510,672. No signature, no broadcast, no funding.
Evidence: `contracts/production/v30-2b-wiring/W1_PREFLIGHT.json`
(also `contracts/production/V30_2B_W1_WIRING_PREFLIGHT.json`),
script `contracts/production/v30-2b-wiring/scripts/w1-preflight.mjs`.

## Canonical addresses

| Role | Address |
| --- | --- |
| FLOW (R1) | 0xcaaB50F36252a57529AFeF651fa6B9f9281917fF |
| Reward Treasury (R4) | 0x96552909998F3DbAf5Ff4979dc158508b3442e65 |
| Controller (R5) | 0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF |
| Vault V2 (R6) | 0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D |
| Governance Safe | 0x88A4CC1F5771523baeB83DaEea07D323a3ce9507 |
| Operations Safe | 0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF |

## Role hashes (read live from the verified deployments, not guessed)

- Treasury `VAULT_ROLE` = `0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959`
- Treasury `CONTROLLER_ROLE` = `0x7b765e0e932d348852a6f810bfa1ab891e259123f02db8cdcde614c570223357`
- Vault `PAUSER_ROLE` = `0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a`

Each matches `keccak256("<NAME>")`. Selectors are ABI-encoded, not hand-written.

## Safe execution context

Governance Safe nonce at preflight: **5**. The five actions occupy nonces 5..9 in
the order below (2-of-3 owner threshold, `value = 0`, `operation = CALL`).

## W1.1 — `Controller.setVault(address)`

- Target: Controller · selector `0x6817031b`
- Args: `vault_ = 0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D`
- Calldata: `0x6817031b00000000000000000000000015e7b1b4b16a43e6ce2e1f460dbe4201e9b6790d`
- keccak: `0x8583a488fb62f52086b5bbb81b6ecea9d22ce6bf87f2146f5435b260878f0be0`
- Prerequisite: `Controller.vault == address(0)`; Governance holds `GOVERNOR_ROLE`
- Post-state: `Controller.vault == Vault V2`
- Authority: Governance Safe (`GOVERNOR_ROLE`) · Safe nonce 5
- `eth_call` from Safe: success · gas 46,843 · unauthorized deployer caller reverts

## W1.2 — `RewardTreasury.grantRole(VAULT_ROLE, Vault V2)`

- Target: Reward Treasury · selector `0x2f2ff15d`
- Calldata: `0x2f2ff15d31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d95900000000000000000000000015e7b1b4b16a43e6ce2e1f460dbe4201e9b6790d`
- keccak: `0x49e460201e6aca70357657a0350692660d8d7e135854b9fd88873db1c6aa73af`
- Prerequisite: role not held; Governance is `DEFAULT_ADMIN_ROLE`
- Post-state: `hasRole(VAULT_ROLE, Vault V2) == true`
- Authority: Governance Safe · Safe nonce 6
- `eth_call` from Safe: success · gas 51,911 · unauthorized caller reverts

## W1.3 — `RewardTreasury.grantRole(CONTROLLER_ROLE, Controller)`

- Calldata: `0x2f2ff15d7b765e0e932d348852a6f810bfa1ab891e259123f02db8cdcde614c57022335700000000000000000000000044b9b880c6188d8b8dbe4f68216ae28a5a1253bf`
- keccak: `0xc039a13ba5a1800577554a584ed48dff59a2f828f499aa645e8003d8dfca026e`
- Prerequisite: role not held; Governance is role admin
- Post-state: `hasRole(CONTROLLER_ROLE, Controller) == true`
- Authority: Governance Safe · Safe nonce 7
- `eth_call` from Safe: success · gas 51,923 · unauthorized caller reverts

## W1.4 — `VaultV2.grantRole(PAUSER_ROLE, Operations Safe)`

- Calldata: `0x2f2ff15d65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a0000000000000000000000001ce0b1df5d2055f6e92122d8cb7669609c2359ef`
- keccak: `0xa65a9a60b7e05f98a6d6126c58042a2708ef0e245c2beebe07e9dbd476bf494e`
- Prerequisite: Operations lacks `PAUSER_ROLE`; Governance holds Vault admin and its own pauser role
- Post-state: Operations gains `PAUSER_ROLE`; Governance admin + pauser untouched (grant is additive)
- Authority: Governance Safe · Safe nonce 8
- `eth_call` from Safe: success · gas 51,686 · unauthorized caller reverts

## W1.5 — `Controller.setBudgets(uint256 weeklyUsdBudget8_, uint256 maxFlowPerEpoch_)`

- Selector `0x5181ecd3` · args `weeklyUsdBudget8_ = 0`, `maxFlowPerEpoch_ = 50000000000000000000000`
- Encoded ceiling verified as exactly `50,000 × 10^18` against the FLOW token's live `decimals() == 18`
- Calldata: `0x5181ecd30000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a968163f0a57b400000`
- keccak: `0x9410508219448179db1408fa9683ada69b8811f84238d609ffd3fc06b2ad8da5`
- Prerequisite: both budgets currently 0
- Post-state: `maxFlowPerEpoch == 50,000e18`, `weeklyUsdBudget8 == 0`
- Authority: Governance Safe (`GOVERNOR_ROLE`) · Safe nonce 9
- `eth_call` from Safe: success · gas 50,162 · unauthorized caller reverts

## Proven post-sequence state

- `Controller.vault == 0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D`
- Treasury `VAULT_ROLE` → new Vault; `CONTROLLER_ROLE` → new Controller
- Operations holds Vault `PAUSER_ROLE`; Governance retains Vault `DEFAULT_ADMIN_ROLE` and its existing `PAUSER_ROLE`
- `maxFlowPerEpoch == 50,000 FLOW`, `weeklyUsdBudget8 == 0`
- `oracle == address(0)`; `PUBLISHER_ROLE` unassigned (Governance, Operations, deployer, Vault all false)
- Treasury FLOW balance 0, `totalObligations` 0, `accruedUnclaimed` 0, no committed epoch
- Vault `totalPrincipal` 0, `nextPositionId` 0, FLOW balance 0
- No epoch, no reward commitment: none of the five calls touch `publishEpoch`, `commitEpoch`,
  `setOracle`, `deposit`, or any accrual path. The epoch ceiling is a bound only —
  spendable rewards still require an oracle, a publisher, a published epoch, and funding.

## Out of scope (untouched)

Rewards Distributor, Activity Registry, Router V3/V4, Router Lens, oracle, publisher,
FLOW funding, and app routing.
