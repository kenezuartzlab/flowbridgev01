# V30.2B P3A — Staking Publisher Wiring + Genesis Epoch Preflight

Read-only gate. Nothing was signed, broadcast, funded or activated.
Evidence: `contracts/production/v30-2b-staking-wiring/P3A_PREFLIGHT.json`
(script `scripts/p3a-preflight.mjs`, chain 677).

## Preflight — PASS (29/29 checks)

Chain 677; R4 `0x965529…42e65`, R5 `0x44b9b8…253bF`, R6 `0x15e7B1…6790D` code
present; Vault→Controller/Treasury/FLOW and Controller→Vault bindings intact;
Governance Safe `0x88A4CC…9507` is role admin on both, deployer holds nothing;
no unexpected `EPOCH_ROLE` or `PUBLISHER_ROLE` holder (both are held by no
address); R4 exactly 10,000,000 FLOW with 0 obligations; R6 principal 0 and no
positions; `maxFlowPerEpoch == 50,000 FLOW`, immutable `EPOCH == 604800s`,
Year-1 ceilings 1M/2M/3M with 0 used; `oracle == 0x0` and
`weeklyUsdBudget8 == 0`; no live epoch; Vault unpaused, `emergencyMode == false`
so exits are unaffected; all five products zero-staked with 0 emission.

## Wiring — PREPARED, NOT EXECUTED

Both grants simulate successfully from the Governance Safe context and revert
for the deployer. They could not be executed here: the Governance Safe is
2-of-3 multi-signature and this environment holds no Safe owner key.

| Tx | Target | Call | Gas | Calldata keccak |
| --- | --- | --- | --- | --- |
| P3A.W1 | R6 Vault | `grantRole(EPOCH_ROLE, 0x44b9b8…253bF)` | 51,674 | see evidence JSON |
| P3A.W2 | R5 Controller | `grantRole(PUBLISHER_ROLE, 0x05F7E3…aB22)` | 51,989 | see evidence JSON |

`EPOCH_ROLE = 0xd5a89e8a650061fa538ac2ef45b7e2fa231077c8f19d034f623c35bd12bf68ac`,
`PUBLISHER_ROLE = 0x0ac90c257048ef1c3e387c26d4a99bde06894efbcbff862dc1885c3a9319308a`.
Execute W1 first at the live Safe nonce, re-read `hasRole`, then W2. Value 0,
operation CALL, no batching with any economic write.

Post-settlement: `EPOCH_ROLE → Controller` and `PUBLISHER_ROLE → 0x05F7…aB22`
currently read **false**.

## Genesis epoch preparation — BLOCKED (contract-level, not a missing input)

Derived from the verified deployed R5 ABI/source, not guessed:

- The only epoch entrypoint is `publishEpoch(uint8[] productIds, uint256[] flowPerSecond)`
  under `PUBLISHER_ROLE`. There is no fixed-rate or Genesis mode argument, and the
  7-day duration is the immutable `EPOCH` constant (not a parameter).
- `publishEpoch` calls `quoteEpochBudget()` first, which reverts
  `OracleNotConfigured()` while `oracle == address(0)`. The path is fail-closed;
  no Genesis epoch transaction can even be simulated without an oracle.
- `publishEpoch` consumes **STANDARD** Year-1 budget (`_consumeStandard`), never
  Genesis. Publishing through it would activate standard-rate emissions, which
  P3A forbids.
- Genesis economics in the frozen design are per-position, not per-epoch: the
  Vault reserves Genesis APR inside `openPosition()` via
  `controller.tryConsumeGenesisBudget()` (`onlyVault`) — no epoch, no publisher,
  no oracle involved.
- All products are at `totalStaked == 0`, so any epoch would emit to zero stakers.

No economic amount, rate or product allocation was invented, and no oracle was
substituted. The application still presents no live staking APR and keeps
staking execution disabled.

## Return

```
P3A PREFLIGHT: PASS
WIRING: NOT EXECUTED (prepared + simulated; Governance Safe 2-of-3, no owner key here)
EPOCH_ROLE -> Controller: false
PUBLISHER_ROLE -> 0x05F7...aB22: false
GENESIS EPOCH PREP: BLOCKED
NEXT: Governance Safe owners execute P3A.W1 then P3A.W2 as prepared. Genesis
staking activation additionally requires an owner decision on economics, because
the deployed Controller has no fixed-rate Genesis epoch function — either
(a) enable Genesis APR by per-position reservation only, which needs no epoch,
publisher or oracle, or (b) authorize a FLOW/USD reference oracle so the
standard oracle-gated publishEpoch path becomes usable.
```
