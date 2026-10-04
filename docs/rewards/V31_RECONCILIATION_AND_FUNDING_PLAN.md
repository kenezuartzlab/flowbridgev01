# Rewards reconciliation + funding plan (2026-10-04)

Read-only. No contract writes, no funding, no claim opening, no balance overwrite.

## Historical reconciliation — BLOCKED
22 accounts: MATCH 2 · EXPLAINED 18 (retired +50 legacy signup credit; not ledger-backed, not claimable) ·
UNEXPLAINED + 0 · UNEXPLAINED − 0 · INSUFFICIENT EVIDENCE 2.

- Account 532956a9 (kenezuartzlab): stored 175, ledger-backed Mainnet 0, 150 pending review
  (referral milestones awarded from BOT Testnet referee activity, before any Mainnet evidence). Testnet core-swap rows (1,031) excluded.
- Account 9af56470: stored 314, ledger-backed 0, 100 pending review (milestones without Mainnet evidence; legacy referral aggregate 50).
- Router V4 `0x9694…68dd` (5) and Router V3 `0xe798…af6a` (5) belong to account afb08df9 (kentrosh2002): authoritative 10 = stored 10, MATCH.

## Signup program
Authorized 1,000,000 · reserved 0 · awarded 0 · released/voided 0 · remaining 1,000,000. Invariant holds.
Backing: APPROVED BUDGET — BACKING VERIFICATION PENDING. Distributor 0x7b80…b922 holds 999,999 free FLOW, totalReserved 0, campaignBudget 1 FLOW — not earmarked to signup.

## Funding proposals (not applied)
Swap (accrual 10, 7d rate 10, 1 active earner, cap 1,000, buffer 2×): MIN 3,000 · 30d 3,000 · 90d 3,000 FLOW.
Milestones (2 referrers × 10/month × 100): MIN 1,000 · 30d 2,000 · 90d 6,000 FLOW.

## Payout contract — SUFFICIENT
FlowRewardsMerkleDistributor supports 1:1 leaves, cumulative via delta epochs, claimed bitmap, replay protection,
wallet-bound leaves, InsufficientFunding/BudgetExceeded checks, pause, Merkle proofs. Promotion sequence: `MAINNET_PROMOTION_PACKAGE` in `src/lib/rewards/rewardFundingPlan.ts`.
