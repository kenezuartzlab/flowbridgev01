# FlowBridge V12.4A — FLOW Points V2: Canonical Accrual + UI Semantics

Status: **IMPLEMENTED** (server-authoritative, effective `2026-08-20T15:00:00.000Z`). The frozen
on-chain layer — FLOW `0xCE14…41Ac`, distributor `0x559605…2b34`, owner, reward signer, EIP-712
schema, cumulative `claimed` accounting, 1B supply — is untouched.

## 1. Approved policy (single active rule set)

| Rule | Value | Source |
| --- | --- | --- |
| Core swap accrual | `floor(verifiedUsd)` FLOW Points, 1 point per whole $1 | `coreSwapAward()` |
| Minimum swap | verified USD ≥ $5 (below → 0 points, swap still valid) | `minSwapUsd` |
| Daily cap | 1,000 FLOW Points per bound wallet per UTC day | `dailyCoreSwapCap` |
| Referral milestones | +15 first qualifying swap · +35 at $100 qualified volume · +50 at 3 distinct active days | `referralMilestonesDue()` |
| Per-referee ceiling | 100 FLOW Points | `referralMaxPerReferredUser` |
| Referrer monthly ceiling | 10 rewarded referred users per calendar month | `referralMonthlyCap` |
| Conversion threshold | 1,000 FLOW Points eligible to convert | `claimThreshold` |

Disabled for all new accruals (legacy, historical balances preserved):
`referral-signup-auto-credit-50`, `referral-activity-percentage-share`, `swap-daily-tier-table`,
`usd-block-multiplier`.

## 2. Authoritative path

```
POST /api/transactions
  → createTransactionHistory()                        src/lib/flowbridge-db.server.ts
      guards: verified email AND submitted wallet === bound wallet
      evidence: verifySwapReceipt(txHash, wallet)     (on-chain, server-side)
      valuation: estimateSwapUsd()                    (server-side pricing)
      accrual: accrueCoreSwapPoints()                 src/lib/rewards/flowPointsV2Ledger.server.ts
                 · idempotent on activity_key = flow-swap:<chainId>:<txHash>
                 · daily cap read from flow_points_ledger for the UTC day
      referral: grantReferralMilestones()              (idempotent per (referee, milestone))
      writes: flow_points_ledger + profiles.{points_self, flow_points, total_swap_volume_usd}
```

Browser-submitted amounts never decide rewards. Every award is derived from a re-read receipt and
server pricing, then written once per canonical activity key.

## 3. Idempotency and anti-abuse

1. `flow_points_ledger.activity_key` is unique — a replayed swap inserts nothing and awards nothing.
2. `(user_id, tx_hash)` unique index on `transactions_history` still short-circuits duplicate rows
   before any profile update.
3. Daily cap is recomputed from the ledger on every accrual, so splitting volume across many swaps
   cannot exceed 1,000 points/day (covered by test).
4. Referral milestones are unique per `(referee_id, milestone)`; self-referral and unbound-wallet
   referees are rejected.
5. Bridge rows, sub-threshold swaps and campaign tasks never create core FLOW Points.

## 4. UI semantics

- "Claimable PTS" is gone. `/earn` and `/rewards` now show **Available to claim**, denominated in
  **FLOW** — the remaining on-chain payout delta, not a second points balance.
- `/earn` states the live rule (1 point per $1 verified, $5 minimum) and the 1,000/day cap; the
  retired daily-tier table is removed.
- Referral copy states that a signup alone earns nothing; value comes from milestones.
- Campaign PTS remains separately labelled and is never an input to FLOW entitlement.

## 5. Claim compatibility

Cumulative entitlement stays monotonic and is compared against on-chain `claimed[wallet]`, so the
verified V12.3 canary (`0x3D8a…0164`, 1,017 FLOW) keeps `claimableDelta = 0` and new V2 points pay
out only the increment. Covered by `src/lib/rewards/flowPointsV2.test.ts`.

## 6. Admin surface

`/sets → Rewards` now edits the V2 fields (minimum swap USD, daily cap, three milestone values,
qualified volume threshold, per-referee ceiling, monthly referral cap, conversion threshold) and
states the active policy version and effective timestamp. Retired V1 knobs are no longer editable.
