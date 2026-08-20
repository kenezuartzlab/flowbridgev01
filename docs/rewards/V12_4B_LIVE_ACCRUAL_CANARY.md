# FlowBridge V12.4B — FLOW Points V2 Live Swap Accrual Canary

Status: **BLOCKED — awaiting the owner's one fresh qualifying BOT Testnet swap.**

## 1. Before-state (recorded 2026-08-20T15:52Z)

| Item | Value |
| --- | --- |
| Wallet (bound, verified) | `0x3d8a7fa490f9db09dd8006b74688213ace9c0164` |
| FLOW Points (`profiles.flow_points`) | 0 |
| Lifetime converted points (`claimed_tokens`) | 1017 |
| Cumulative entitlement | 1017 FLOW (1 PTS = 1 FLOW) |
| On-chain `claimed[wallet]` | 1017 FLOW |
| Available to claim | 0 FLOW (delta = 0, replay-safe) |
| Distributor FLOW balance | 9,998,983 FLOW |
| Campaign PTS (separate ledger) | 350 (2 completions) |
| V2 core swap points awarded today (UTC 2026-08-20) | 0 (`flow_points_ledger` empty) |
| Referral milestone awards | 0 |
| FLOW Points V2 | ACTIVE (effective 2026-08-20T15:00:00Z) |
| Active policy | $5 minimum · 1 point per whole verified $1 · 1,000 points/wallet/UTC day |
| BOT Mainnet 677 | remains disabled (distributor not promoted) |

## 2. Blocking defect found and repaired (code change required)

The V2 accrual path verified swap receipts **only against BOT Mainnet 677 and the
legacy v3 router**, and recorded the ledger activity key with a hardcoded
`chainId = 677` and no log index. A fresh BOT Testnet Router V4 swap — the only
approved verified-swap path — would therefore have accrued **zero** points and
could not satisfy §3 canonical identity.

Repair in `src/lib/flowbridge-db.server.ts` (economics untouched):

1. `verifySwapReceipt()` now returns the chain the swap was proven on and adds a
   disjoint BOT Testnet 968 · Router V4 candidate (mainnet stays on legacy v3;
   neither candidate's evidence is reinterpreted as the other's).
2. `canonicalSwapEvidence()` reads the indexed `verified_activities` row
   (`source_chain_id`, `source_log_index`, `amount_raw`, `token`).
3. `canonicalEvidenceUsd()` derives verified USD from `amount_raw` + token
   decimals of the approved path — the browser `fromAmount` is now only a legacy
   fallback for historic mainnet v3 rows.
4. `accrueCoreSwapPoints()` receives the canonical `chainId` and
   `sourceLogIndex`, so the idempotent activity key is
   `<sourceChainId>:<txHash>:<sourceLogIndex>`.

No policy constant, cap, milestone, UI label or mainnet configuration changed.
Typecheck, build and 60 reward tests pass.

## 3. Remaining owner action

Perform exactly ONE ordinary USDT → BOT (native) swap on BOT Testnet through the
Trade UI, with expected verified value comfortably above $5 and well below the
1,000-point daily cap. No bridge, no referral action, no second swap, no claim.
Then supply the tx hash so the after-state (points delta, claimable delta,
campaign PTS unchanged, single ledger row, idempotency proof) can be verified.

FLOW POINTS V12.4B LIVE ACCRUAL CANARY BLOCKED
