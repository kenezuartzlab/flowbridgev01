# Mainnet FLOW Points + Referral V2 — Audit result and fix plan

## Audit result (read-only, done)

**BOT Mainnet 677 swap accrual: MISCONFIGURED**

| Step | Finding |
| --- | --- |
| Receipt check | Mainnet only accepts swaps sent to **Router V3**. Swaps through Router V4 `0x7965…fc61` fail this check, so they never reach the points engine. |
| SwapActivity ingestion | The verified-swap list only contains one **Testnet** path. Mainnet V4 SwapActivity events are not ingested. |
| Ledger | 4 Mainnet entries exist (all Router V3, Aug 21), all 0 points correctly (each under $5). 12 Testnet entries hold 3,786 points. |
| Recent Mainnet V4 trades | Oct 1 and Oct 3 swaps recorded with 0 points (never evaluated). |
| Your proof trade `0x310f…3546` | Real, succeeded, sent to Router V4, but only 0.11 BOT (about $1.07). Even when fixed it earns 0 because it is under $5. No transaction-history row exists for it under the bound account. |
| Referral | Signup gives 0 (legacy +50 only fires before the V2 cutoff). Milestones exist: 3x +15, 3x +35, 1x +50 — all from Testnet activity. 7 referred accounts. |
| Mainnet point → FLOW claim | Conversion policy marks 677 as UNAPPROVED. Already disabled. |
| Already correct | $5 minimum, floor rule, 1,000 daily cap, dedup on chain+tx+logIndex, max 100/referee, 10/month, self-referral block, no % share, bridge = 0, Campaign PTS separate. |

## Fix (server/indexer only, no contract changes)

1. **Receipt check** — Mainnet accepts Router V4 `0x7965…fc61` as the canonical reward source. Router V3 stays an approved legacy source (it already earns under V2). One swap is one transaction to one router, so V3 and V4 cannot double-credit; dedup key still applies.
2. **Mainnet SwapActivity ingestion** — server reads the receipt, decodes the V4 `SwapActivity` log (wallet, tokenIn, tokenOut, amountIn, routerId, logIndex), checks success + finality depth, and records one verified activity. Covers native BOT in (BOT→FLOW) and token in (FLOW→BOT, other approved pairs).
3. **Server USD pricing** — from the decoded tokenIn + amountIn using the existing BOT DEX price source. If no reliable price: 0 points, ledger row marked `PRICING_REVIEW` for retry. No browser values used. Remove the hardcoded BOT fallback price for Mainnet rewards.
4. **Monthly cap reason** — when the cap blocks a referral milestone, write a 0-point `REFERRAL_MONTHLY_CAP_REACHED` ledger entry (relationship kept). Add reject on same referrer/referee wallet.
5. **Ledger reasons** — new entries use `CORE_SWAP_V2`, `REFERRAL_FIRST_QUALIFYING_SWAP`, `REFERRAL_100_USD_VOLUME`, `REFERRAL_3_ACTIVE_DAYS`, `DAILY_CAP_REACHED`, `REFERRAL_MONTHLY_CAP_REACHED`, `ANTI_ABUSE_REVIEW`, each with policy version. Daily-cap and qualified-state reads accept both old and new names so history counts once. Old rows untouched.
6. **Anti-wash review** — rapid reverse-pair round trips by the same wallet inside a short window get `ANTI_ABUSE_REVIEW` (0 points until resolved). Funds never blocked.
7. **UI** — Earn/Home/Profile: "Today X / 1,000", $5 minimum, referral table (Signup 0, +15, +35, +50, max 100, 10/month). Referral page: Referred users vs Rewarded referrals, per-referral safe status steps, no wallet/email shown. Mainnet points show no FLOW conversion ratio.
8. **Tests** — all cases in section 26 for chain 677, including wrong router, reverted, unconfirmed, duplicate, V4 BOT→FLOW and FLOW→BOT decode, 11th referral, next-month reset.

## Live proof

- **Swap:** no existing Mainnet V4 trade of $5+ found so far. After the fix I re-scan recent V4 trades read-only; if none qualify, LIVE MAINNET SWAP PROOF stays BLOCKED until a natural $5+ trade happens (no practice trade sent).
- **Missed history:** the Oct 1 / Oct 3 V4 swaps — I prepare a written, bounded backfill list (tx, wallet, verified USD, points it would earn). Nothing is credited without your approval.
- **Referral:** existing milestones are Testnet only, so LIVE REFERRAL CANARY on Mainnet: NOT YET AVAILABLE unless a qualifying Mainnet referee appears.

## Not touched

Router V4, Router V3, FlowToken, FlowRewardsDistributor, staking, MultiSend, CaSwap, FLOW payouts.

## Technical details

- `verifySwapReceipt` in `flowbridge-db.server.ts`: add V4 mainnet candidate from `executionCapability`/registry.
- New `src/lib/activity/mainnetV4SwapEvidence.server.ts`: receipt → `decodeSwapActivityLog` → `verified_activities` upsert (unique chain+tx+logIndex), finality via block depth.
- `flowPointsV2.ts`: reason constants + alias set; `flowPointsV2Ledger.server.ts`: alias-aware queries, cap-reached row, wallet self-referral check.
- New tests `src/lib/rewards/mainnetFlowPointsV2.test.ts`.
