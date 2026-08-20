# FlowBridge V12.4 — Rewards Accrual Integrity + Public Testnet Activation

Status: **BLOCKED** (two unresolved economic-policy conflicts requiring owner approval; no live economics were changed in this gate).

## 1. Frozen on-chain layer (unchanged)

- FLOW token `0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac`
- Distributor `0x559605fa3120cd472b86966FE4b5dC7e9e0b2b34`
- Contract sources, owner, reward signer, EIP-712 schema, cumulative `claimed` accounting, 1B supply and the funding model: untouched.
- BOT Mainnet 677 remains `token: null`, `distributor: null`, `claimsEnabled: false`.
- BOT Testnet 1 FLOW Point = 1 FLOW stays labelled testnet-only validation economics.

## 2. Current swap reward path (authoritative)

```
POST /api/transactions
  → createTransactionHistory(userId, emailVerified, payload)      src/lib/flowbridge-db.server.ts
      guards: verified email AND submitted wallet === bound wallet
      idempotency: pre-check on (user_id, tx_hash) + unique-index 23505 recovery
      eligibility: tx_type === SWAP AND status === SUCCESS AND not BRIDGE
      evidence:   verifySwapReceipt(txHash, wallet)  (on-chain receipt, server-side)
      valuation:  estimateSwapUsd(direction, fromAmount)  (server-side pricing)
      formula:    estimateFlowPointsForUsd(usd, rules)    src/lib/rewards.ts
                  usd < minUsd → 0; else floor(usd / usdBlock) * pointsPerBlock
      writes:     profiles.total_swap_volume_usd, points_self, flow_points
```

Authoritative config source: `app_settings.rewards` (edited in `/sets`, validated in
`src/routes/api/admin.settings.ts`, merged by `src/lib/config/appConfig.ts`, read server-side via
`getRewardSettings()`). Defaults: `minUsd 5`, `usdBlock 1`, `pointsPerBlock 1`,
`referralActivityPct 20`, `referralClaimMinSwapUsd 100`, `claimThreshold 1000`.

Browser-submitted amounts never decide rewards: USD is re-derived server-side and the receipt is
re-read on chain. `points_earned` on the transaction row is written from the server value only.

## 3. Current referral reward path

- **Signup:** `ensureProfile()` / `linkReferralIfMissing()` credit the referrer `+50` PTS
  (`points_referral_signup` and `flow_points`). Hardcoded, not config-driven.
- **Activity share:** in `createTransactionHistory`, the referrer receives
  `referralActivityShare(refereePoints, rewards.referralActivityPct)` = `floor(pts * pct / 100)`
  into `points_referral_activity` + `flow_points`. Self-credit is blocked (`referrer.id !== userId`),
  and `linkReferralIfMissing` rejects self-codes and already-bound referrals.
- **Conversion gate:** `computeClaimable()` only unlocks signup points at
  `floor(volume / referralClaimMinSwapUsd) * claimThreshold`; locked signup points survive a claim.

## 4. Legacy / duplicate logic found

| Item | Status |
| --- | --- |
| `SWAP_DAILY_TIERS`, `SWAP_MAX_DAILY_PTS` (`src/lib/points.ts`) | **display-only, conflicting** — documented daily-tier policy (cap 75 PTS/day) never executed by the server. Now rendered on `/earn` as a pending reference, not as the active rule. |
| `minUsd`, `usdBlock`, `pointsPerBlock` | **economically active** (the live formula). |
| `referralActivityPct` | **economically active**. |
| `referralClaimMinSwapUsd`, `claimThreshold` | **economically active**, at off-chain conversion time only (not accrual). |
| Referral signup `+50` PTS | **conflict** with V12.4 §3 ("relationship only"). Left running; needs an explicit owner rule or removal. |
| Verified-activity store (`verified_activities`) and campaign settlement | **no FLOW Points writes** — verified by search: the only writer of `profiles.flow_points` for swap/referral activity is `createTransactionHistory`. Campaign settlement writes Campaign PTS exclusively. |

No duplicate credit path exists: one economic writer, one idempotency key `(user_id, tx_hash)`.

## 5. Deduplication / idempotency guarantees

1. Pre-insert lookup on `(user_id, tx_hash)` returns the stored row without any profile update.
2. Unique-index violation `23505` is caught and resolved to the stored row (concurrency-safe).
3. Profile credit happens only on the insert branch, after receipt verification.
4. Bridge rows are recorded with `points_earned = 0` and never touch profile point columns.

## 6. Post-claim cumulative entitlement

- Cumulative entitlement is derived from the off-chain lifetime converted total, scaled 1:1 on
  BOT Testnet, and compared to on-chain `claimed[wallet]` (`flowClaimAuthority.server.ts`).
- Unchanged points ⇒ `claimableDelta = 0` (`nothingToClaim`), replay-safe.
- New legitimate points ⇒ the distributor pays only the increment (`incrementalPayout`).
- The V12.3 canary (`0x3D8a…0164`, 1,017 FLOW) is settled and untouched; historical
  `transactions_history.points_earned` rows and `claimed_tokens` remain auditable.
- Campaign PTS is never an input to entitlement.

## 7. Fresh canary

**Not performed — not needed.** The live path is fully exercised by automated coverage
(`src/lib/rewards/flowAccrualPolicy.test.ts`, `flowClaimAuthority.test.ts`,
`src/lib/activity/verifySwapRoute.integration.test.ts`) and by the already-verified V12.3
on-chain claim. No transaction was spent in V12.4.

## 8. Product clarity

- `/earn` remains the canonical rewards/claim destination; `/rewards` remains the referral/tasks console.
- `/earn` "How you earn" now reads "Verified swaps … grow your FLOW Points" and marks the daily-tier
  table as documented-but-pending, instead of presenting an inactive cap as the rule.
- FLOW Points (PTS), Campaign PTS and FLOW token remain distinctly labelled; BOT Testnet 1:1 is
  labelled testnet validation only.

## 9. Monitoring / activation readiness

`src/lib/rewards/flowAccrualPolicy.ts` defines the reporting thresholds (accounting untouched):

- distributor funded reference: 10,000,000 FLOW
- low-funding warning: < 2,000,000 FLOW (20%)
- critical alert: < 500,000 FLOW (5%)
- watch signals: failed claim authorizations by reason (`signerNotConfigured`,
  `chainStateUnavailable`, `distributorUnderfunded`), failed on-chain claims, abnormal
  reward-credit spikes (points per user per hour), reward-signer mismatch
  (`SIGNER_SECRET_CONFIGURATION_REQUIRED` is raised whenever the key does not derive to `0xA7d0…30a2`).

Emergency procedures: distributor `pause()` by owner `0x628e…BB97` halts all claims; signer rotation
is owner-only `setRewardSigner(newSigner)` followed by rotating `FLOW_REWARD_SIGNER_PRIVATE_KEY`
(previously issued signatures then fail closed). Staking is explicitly out of scope for V12.4.

## 10. Blocking items for owner decision

1. **Swap formula:** keep the uncapped per-USD block formula, or activate the documented daily-tier
   capped policy? Both must not run.
2. **Referral signup bonus:** keep the automatic `+50` PTS relationship reward (needs explicit
   approval), or remove it so a referral relationship alone grants nothing?
