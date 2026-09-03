# V30.2B P4A — Dynamic Standard Staking: Oracle Readiness + Owner Decision Gate

Chain 677 (BOT Mainnet). Read-only discovery, source/ABI derivation, and local fork
simulations. **Mainnet writes performed by this gate: 0.** No signature, no role grant,
no oracle setter, no epoch publication, no liquidity provision, no deployment.

Gate: `contracts/production/v30-2b-staking-locked-products/scripts/p4a-oracle-readiness.mjs`
Evidence: `contracts/production/v30-2b-staking-locked-products/P4A_ORACLE_READINESS.json`
**47 / 47 checks PASS, 0 failures** at block `21888393`.

## 1. Frozen baseline reconfirmed live

- Oracle `0x0000000000000000000000000000000000000000`; `weeklyUsdBudget8 = 0`.
- `maxFlowPerEpoch` exactly `50000 FLOW`; ceilings 1,000,000 / 2,000,000 / 3,000,000 FLOW.
- `EPOCH_ROLE` → Controller: unassigned. `PUBLISHER_ROLE` → `0x05F7…aB22`: unassigned.
- `emergencyMode` false, vault unpaused, controller bound to canonical R6.
- Product floor/target/hard-cap matrix unchanged for all five products
  (0/1000/1200 · 800/1400/1800 · 1000/1800/2400 · 1200/2400/3200 · 1500/3000/4000 bps).
- P3D locked Genesis/floor staking untouched; canary position #2 (`0x3d8a…0164`) intact.

## 2. FLOW/USDT pool discovery — NOT_FOUND

Two independent read paths agreed exactly:

- BDEX V3 factory `0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419`: `getPool` returns zero for
  FLOW/USDT and FLOW/WBOT at every fee tier (100, 500, 2500, 3000, 10000).
- Full `PoolCreated` history: 18 pools total, **0 containing FLOW**.
- BDEX V2 factory `0x1171…0aa3`: `getPair` returns zero for both pairs.

No pool exists, therefore no observation history exists and **no earliest ≥7-day TWAP
timestamp can be quoted**. It becomes computable 7 days after a real pool is created and
begins accumulating observations. No testnet, legacy, browser/API, or typed price was used.

## 3. Deployed oracle interface and fail-closed semantics

`IFlowReferenceOracle.latestReference() → (priceUsd8, updatedAt, liquidityUsd8, deviationBps)`
— USD per FLOW at 8 decimals. Deployed policy today: `maxStalenessSeconds = 7200`,
`minLiquidityUsd8 = 0` (governor must set), `maxDeviationBps = 500`.

Live: `referenceHealthy()` = `(false, 1)`; `quoteEpochBudget()` reverts `OracleNotConfigured`.

Fork simulations against exact deployed R5 bytecode (all PASS, fork-only writes):

| Scenario | reasonCode | `quoteEpochBudget()` |
| --- | --- | --- |
| unavailable / not configured | 1 | reverts |
| malformed zero price | 2 | reverts |
| stale reference | 3 | reverts |
| insufficient liquidity | 4 | reverts |
| excessive deviation | 5 | reverts |
| recovery to valid reference | 0 | returns `0` (weeklyUsdBudget8 is 0) |

`publishEpoch(uint8[],uint256[])` remains impossible for the approved publisher: it reverts
without `PUBLISHER_ROLE`, and even with a healthy reference the budget is 0.

## 4. Standard economics

- Standard Year-1 used: `0.006575342465753424 FLOW` — exactly the P3D 30D floor
  reservation. No variable epoch has ever consumed Standard budget.
- Standard Year-1 remaining: `1999999.993424657534246576 FLOW`.
- Free reward capacity `9999999.971225890410958906 FLOW`, excluding reserved Genesis
  `0.022191780821917808` and reserved floors `0.006575342465753424 FLOW`.
- Deployed formula reproduced off chain: `flow = weeklyUsdBudget8 * 1e18 / priceUsd8`,
  clamped by `maxFlowPerEpoch`, then by min(Standard remaining, total remaining). Twelve
  sample price/budget pairs are recorded in the evidence JSON and exercise the
  `maxFlowPerEpoch` clamp. **They are math tests, not proposed launch values.**
- Enforceable rate rule confirmed from source: `floorBps + impliedVariableBps <= hardCapBps`,
  plus the ±10% week-over-week blended guard outside emergency mode.

## 5. Unsigned P4B role preparation (built, not signed)

1. `Vault.grantRole(EPOCH_ROLE, 0x44b9b880…53bF)` on `0x15e7B1b4…790D`.
2. `Controller.grantRole(PUBLISHER_ROLE, 0x05F7E3eA…aB22)` on `0x44b9b880…53bF`.

Calldata is in the evidence JSON. Nothing was signed or broadcast, and both roles remain
unassigned on chain.

## 6. Owner decisions still required (none of these may be auto-chosen)

- Observation window for the FLOW/USD reference (target ≥ 7 days).
- Maximum freshness age (`maxStalenessSeconds`).
- Minimum liquidity threshold (`minLiquidityUsd8`).
- Maximum deviation threshold (`maxDeviationBps`).
- A nonzero `weeklyUsdBudget8`.

Already frozen, not up for re-approval: `maxFlowPerEpoch = 50,000 FLOW / 7 days`, the
1M/2M/3M Year-1 ceilings, the product floor/target/hard-cap matrix, and the approved
Staking Publisher `0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22`.

## Verdict

```
P4A: BLOCKED
FLOW/USDT POOL: NOT_FOUND
TWAP >=7D: BLOCKED
ORACLE CANDIDATE: BLOCKED
WEEKLY USD BUDGET: APPROVAL_REQUIRED
ROLE PREP: SIMULATION_PASS
STANDARD/DYNAMIC: DISABLED
NEXT: Create and verify a real FLOW/USDT production pool with committed liquidity on BOT
Mainnet 677 (BDEX V3 factory 0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419); a >=7-day TWAP,
and therefore any oracle threshold decision, is impossible until it exists and has
accumulated 7 days of observations.
```

Genesis/floor staking (Flexible + 30D/90D/180D/365D) stays live and unmodified;
Standard/dynamic staking stays disabled.
