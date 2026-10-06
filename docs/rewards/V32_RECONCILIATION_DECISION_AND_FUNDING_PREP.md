# Rewards reconciliation decision + funding preparation (2026-10-04)

No on-chain writes. Nothing signed or broadcast. No allocation root published. Claims stay locked.

## Reconciliation (owner decisions applied)
- 532956a9 (stored 175) and 9af56470 (stored 314): REVIEWED — NONCLAIMABLE HISTORICAL. Ledger-backed Mainnet entitlement 0. Records kept.
- BOT Testnet ledger points: kept for audit and excluded from Mainnet entitlement.
- 18 legacy +50 signup balances: EXPLAINED, historical only, not claimable.
- Result: PASS (no unexplained or insufficient-evidence accounts left). No evidence created.

## Budgets (internal accounting, audited via increase_reward_budget)
SIGNUP_BONUS 1,000,000 · CORE_SWAP 3,000 · REFERRAL_MILESTONE 2,000 · total 1,005,000. No spending across buckets.

## Live payout contract (block 25,471,524)
Distributor 0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922, token 0xcaaB50F36252a57529AFeF651fa6B9f9281917fF (canonical FLOW).
FLOW balance = freeBalance 2,499,999 · totalReserved 0 · totalClaimed 1 · campaignBudget 1 (budgetRemaining 0) · not paused · epochCount 1 · minPublishDelay 86,400 s.
Roles: DEFAULT_ADMIN + BUDGET_MANAGER = Safe 0x88a4…9507 (2-of-3); PAUSER = Safe 0x1ce0…59ef; publisher 0x971e…3f94; recovery = Treasury Safe 0xeFc1…9Ea4.

## Prepared owner transaction (unsigned)
No FLOW transfer is needed: shortfall is 0. The free balance is 2,499,999, not the cached 999,999.
The on-chain budget cap must still be raised:
- Safe 0x88a4cc1f5771523baeb83daeea07d323a3ce9507 → 0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922, value 0, CALL
- setCampaignBudget(1005001000000000000000000)  (1 already claimed + 1,005,000)
- calldata 0x7bc0db4600000000000000000000000000000000000000000000d4d1369fe87ea1840000
- estimated gas 35,049

## Draft first allocation (not published)
1 leaf: 0x628e…bb97 (afb08df9), 10 FLOW = 10000000000000000000 wei. These are the Router V4 0x9694…68dd and Router V3 0xe798…af6a proofs.
These ledger rows are still UNFUNDED. They become claimable only after the budget tx and a CORE_SWAP reservation.
