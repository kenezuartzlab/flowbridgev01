# V30.2B P3B — Genesis-Only Mainnet Canary (Flexible, 1 FLOW)

Read-only gate. Nothing was signed, broadcast, funded or activated.
Evidence: `contracts/production/v30-2b-staking-genesis-canary/P3B_PREFLIGHT.json`
(script `scripts/p3b-preflight.mjs`, chain 677).

## Preflight — PASS (43/43 checks)

Chain 677; R4 `0x965529…42e65`, R5 `0x44b9b8…253bF`, R6 `0x15e7B1…6790D` code
present; Vault→Controller/Treasury/FLOW and Controller→Vault bindings intact;
Treasury `VAULT_ROLE` already held by R6 and `CONTROLLER_ROLE` by R5; Governance
Safe `0x88A4CC…9507` is role admin on both.

Standard/dynamic path stays fail-closed and unassigned: `oracle == 0x0`,
`weeklyUsdBudget8 == 0`, standard Year-1 used `0`, no live epoch, Year-1 ceilings
still 1M/2M/3M, `EPOCH_ROLE → Controller = false`,
`PUBLISHER_ROLE → 0x05F7…aB22 = false`. Their absence does not block the
Genesis-only Flexible path, as required.

Pre-canary economics: R4 exactly 10,000,000 FLOW with 0 obligations and 0
reserved genesis/floors; R6 holds 0 FLOW, `totalPrincipal == 0`,
`nextPositionId == 0`, unpaused, `emergencyMode == false`; every product has
`flowPerSecond == 0`.

## Derived Genesis-only terms (from deployed state, not assumed)

| Item | Value |
| --- | --- |
| Flexible productId | `0` (the only product with `lockSeconds == 0`, active) |
| Deployed minimum principal | exactly 1 FLOW — the 1 FLOW candidate qualifies |
| Genesis rate | 1800 bps for 7,776,000s (full 90-day lifetime quota, unused) |
| Exact Genesis obligation | `0.044383561643835616` FLOW (`principal*bps*secs/(BPS*YEAR)`, reproduced) |
| Floor obligation | `0` — Flexible `floorBps == 0`, so no standard budget is touched |
| Canary wallet | `0x3d8a…0164` — holds exactly 1 FLOW, 5.8968 BOT gas, 0 positions, allowance 0 |

The position consumes Genesis reservation only via
`controller.tryConsumeGenesisBudget()` + `treasury.reserveGenesis()`; it requires
no oracle, no epoch and no publisher.

## Prepared user-signed transactions — NOT EXECUTED

| Tx | From | Target | Call | Simulation |
| --- | --- | --- | --- | --- |
| P3B.TX1 | canary wallet | FLOW | `approve(R6, 1 FLOW exact)` | ok, gas 46,750 |
| P3B.TX2 | canary wallet | R6 Vault | `openPosition(0, 1 FLOW)` | reverts only on `ERC20InsufficientAllowance` (`0xfb8f41b2`) because TX1 has not run |

Value 0 BOT on both, no unlimited approval, no batching. TX2's only revert cause
is the missing exact allowance that TX1 creates; every economic precondition
(product active, minimum, Genesis window, Year-1 capacity, Treasury free
balance) verifies against live state.

Execution did not happen here and was not attempted: P3B mandates that the
canary wallet signs both transactions, and this environment holds no key for
`0x3d8a…0164`. Auto-signing is forbidden by the gate.

## Feature state

`STAKING_GENESIS` stays disabled in the app (`stakingExecutionEnabled: false`),
since §7 promotion requires the full canary lifecycle — approve → open →
positive accrual → claim → Flexible withdrawal — to reconcile first. The claim
and withdrawal paths exist on the deployed R6 (`claim(uint256)`,
`withdraw(uint256)`, `previewPending(uint256)`) and Flexible withdrawal is
unlocked (`maturityAt == 0`), so the lifecycle is expressible once TX1/TX2 land.

## Return

```
P3B PREFLIGHT: PASS (43/43)
1 FLOW FLEXIBLE CANARY: READY
CANARY LIFECYCLE: NOT EXECUTED (both transactions must be signed by canary wallet 0x3d8a…0164; no key here, auto-signing forbidden)
GENESIS FEATURE: STILL_DISABLED
STANDARD/DYNAMIC: DISABLED
NEXT: canary wallet signs P3B.TX1 FLOW.approve(0x15e7B1…6790D, 1 FLOW exact), then after receipt + allowance re-read signs P3B.TX2 R6.openPosition(0, 1 FLOW); calldata in P3B_PREFLIGHT.json.
```
