# FlowBridge V30.2B P3C.1 — Accelerated BOT Mainnet Fork Lifecycle Test

BOT Mainnet 677 · **local fork only** · **0 mainnet writes** · no app/contract source change

Evidence: `contracts/production/v30-2b-staking-locked-products/P3C1_FORK_LIFECYCLE.json`
Script: `contracts/production/v30-2b-staking-locked-products/scripts/p3c1-fork-lifecycle.mjs`
Fork tool: anvil 1.4.4 (`--fork-url https://rpc.botchain.ai`), 206 assertions, 0 failures

## Result

```text
P3C.1 FORK: PASS
30D: FULL_LIFECYCLE_PASS
90D: FULL_LIFECYCLE_PASS
180D: FULL_LIFECYCLE_PASS
365D: FULL_LIFECYCLE_PASS
ORACLE: 0x0 UNCHANGED
MAINNET WRITES: 0
```

## Fork runs (one product per process against a fresh fork)

| Product | Fork block | Block hash (prefix) | Fork wallet | Checks |
| --- | --- | --- | --- | --- |
| 30D | 21880409 | `0x6a34d04d95d5…` | `0x976EA740…0aa9` | 50 PASS |
| 90D | 21880450 | `0xf5f9774c08df…` | `0x14dC7996…9955` | 50 PASS |
| 180D | 21880483 | `0x85c531bc0342…` | `0x23618e81…1E8f` | 53 PASS |
| 365D | 21880522 | `0x4e90da1e4d44…` | `0xa0Ee7A14…9720` | 53 PASS |

Exact deployed R4 `0x9655…2e65`, R5 `0x44b9…53bF`, R6 `0x15e7…790D` bytecode and
storage from the fork. No redeploy, no oracle, no role grant, no storage slot
written directly — only ordinary user transactions plus block-time advancement.
Each product ran on its own fresh fork (stronger than snapshot/revert, so no
simulated lifecycle can contaminate another). Fork users are deterministic
fork-only wallets, never the P3B canary; each started with the full 90-day
Genesis quota and exactly 1 FLOW funded on the fork from an impersonated
mainnet holder. Allowance was exactly 1 FLOW per test — never unlimited.

## Per-product lifecycle (1 FLOW principal)

| Product | lock | Genesis | quoteOpen genesis obl. | floor obl. | rewards paid | principal returned |
| --- | --- | --- | --- | --- | --- | --- |
| 30D | 2,592,000s | 2700bps / 2,592,000s | 0.022191780821917808 | 0.006575342465753424 | 0.028767123287671232 | exactly 1.0 |
| 90D | 7,776,000s | 3600bps / 7,776,000s | 0.088767123287671232 | 0.024657534246575342 | 0.113424657534246574 | exactly 1.0 |
| 180D | 15,552,000s | 4800bps / 7,776,000s | 0.118356164383561643 | 0.059178082191780821 | 0.177534246575342462 | exactly 1.0 |
| 365D | 31,536,000s | 6000bps / 7,776,000s | 0.147945205479452054 | 0.150000000000000000 | 0.297945205479452053 | exactly 1.0 |

Every `quoteOpen()` value was independently recomputed with the deployed integer
formulas and required to match exactly. Per product the run proved: exact
reservation deltas on treasury `reservedGenesis`/`reservedFloors`, exact
controller Genesis/standard Year-1 budget consumption, positive mid-Genesis
accrual, one successful claim, principal never reduced by claim, an immediate
repeat claim paying zero, withdrawal at maturity returning exactly 1 FLOW,
position status CLOSED, `totalPrincipal` back to baseline, earned dust claimable
after closure with zero residual reward liability, reservations fully released or
consumed, treasury obligations back to baseline, and released obligations equal
to rewards paid out to the wei.

## Post-Genesis behaviour (180D / 365D, oracle 0x0)

| Item | 180D | 365D |
| --- | --- | --- |
| Pending at Genesis end | 0.073972606544901064 | 0.092465758181126331 |
| Pending +30d post-Genesis | 0.083835616438356163 | 0.104794520547945205 |
| Fixed floor accrual continues | yes | yes |
| Variable emission (`varPerTokenStored`, `currentEpochCommitted`) | 0 / 0 | 0 / 0 |
| Claim available post-Genesis | yes | yes |
| Exact principal at maturity | yes | yes |

With the oracle at `0x0` and no EPOCH/PUBLISHER role, the post-Genesis interval
is covered solely by the fixed floor obligation reserved at entry: floor accrual
continues, the variable tier stays exactly zero (no phantom emission), claims
remain available, and maturity principal is recovered exactly. No fake oracle,
epoch, rate or budget was inserted.

## Invariants held throughout

- Oracle `0x0`, `EPOCH_ROLE → Controller` false, `PUBLISHER_ROLE` unassigned,
  `emergencyMode` false, vault unpaused — verified at fork start and after every
  simulated lifecycle.
- Treasury solvent at every checkpoint (`freeBalance + totalObligations <=` FLOW
  inventory); user principal never counted as free reward capacity.
- Claim never reduced principal; repeat claim never double-paid; withdrawal
  returned exact principal for all four products.
- Live mainnet re-read after the gate (block 21880584): oracle `0x0`,
  `nextPositionId` 1, `totalPrincipal` 0, treasury free 9,999,999.999993013698630138,
  obligations 0.000000279680365296 — identical to the pre-gate baseline.

## Scope boundary

Per the P3C.1 speed rule, no application or contract source changed, so the full
application suite and production build were not rerun: **NO APP CODE CHANGE**.
`/stake` still exposes only Flexible Genesis as executable; this gate proves
contract lifecycle behaviour and does **not** authorize public activation of any
locked product.

NEXT: locked-product public activation now needs an explicit V30.2B P3D activation
decision (real-mainnet 30D canary with a user-signed exact 1 FLOW allowance, plus
UI activation policy) — the fork gate itself authorizes nothing on mainnet.
