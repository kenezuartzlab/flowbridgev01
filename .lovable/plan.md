# Funded Community Growth Rewards — signup bonus + 1:1 FLOW

## What changes for users
- New eligible signups (after a fixed start time) earn **100 FLOW Points = 100 FLOW**. With a valid referral, the referrer also earns 100.
- Bonuses come out of a **1,000,000 FLOW signup fund**. When it runs out, Earn says "Signup bonus allocation is currently fully allocated." No countdowns. The remaining amount is shown only if it comes from the server's ledger.
- Earn / Referral pages show **Signup Bonus** (0 or 100 / 100) and **Activity Milestones** (0–100) separately, up to 200 per referred user.
- Before the bonus is confirmed, the user sees "100 FLOW Points signup bonus pending" with the steps still missing: verify email, bind a wallet.

## Eligibility (all required, checked on the server)
- New account created at or after the start time
- Email verified
- A unique wallet is bound
- This account and this wallet have never received a signup bonus before
- Passes the self-referral and anti-abuse checks

Referrer bonus rules:
- It respects the 10-per-month cap. The referral link is still recorded after the cap; the new user still gets their own 100.
- If more than 3 signups bind wallets to one referrer within 10 minutes, the bonus is held for review (status REVIEW).

## Funding and solvency (hard rules)
- Each reward type has its own budget and its own reservation records:
  - SIGNUP_BONUS: 1,000,000
  - CORE_SWAP: 0 until you fund it
  - REFERRAL_MILESTONE: 0 until you fund it
- A database function does three steps in one transaction: lock the budget row, check what remains (100 for a direct signup, 200 for a referred one, or nothing is paid), then write the reservation and the ledger entry together. If any step fails, nothing is written.
- Swap and milestone points keep being earned. Until their budget is funded, they stay **UNFUNDED / pending**: visible, but never claimable FLOW.
- Budgets go up only through a recorded admin action (ADMIN_ADJUSTMENT, audited). Treasury balance alone never raises a budget.

## 1:1 claims
- claimable FLOW = eligible backed points − FLOW already claimed on-chain.
- "Eligible backed points" are added up from the ledger: confirmed rows with a funded reservation. The stored profile total is never used.
- **Hard gate:** 1:1 claims stay off on Mainnet until two things are true:
  - The ledger-vs-profile reconciliation report has run with zero unexplained differences.
  - On-chain distributor funding is at least the total reserved.
  Until then the claim status reads BLOCKED with that reason.

## Contract audit (no writes)
FlowRewardsDistributor already supports this as it is:
- Signed cumulative entitlement
- A per-wallet `claimed` record
- Replay protection, since only the change since the last claim is paid
- Owner pause and withdraw

So no contract change is needed. Budgets and reservations stay off-chain. I'll check the Mainnet distributor's FLOW balance read-only. If it can't be verified, SIGNUP FUND = UNVERIFIED.

## Tests
- Every case in section 23
- Same-transaction reservation and award: if one fails, both fail
- Budget exhaustion cases: 999,900 used, then 1,000,000 used
- The budget can't go negative
- A manipulated stored total is never used to authorize a claim

## Expected report outcome
The signup and referrer rules, reservations, budget exhaustion and duplicate/self-referral checks can pass. The overall result will honestly be **BLOCKED** until all three of these are done:
1. The swap and milestone budgets are funded
2. On-chain FLOW funding is verified
3. Historical reconciliation shows zero unexplained differences

## Technical details
- Migration:
  - New `reward_budgets` table (program_id, total, reserved, status) and `reward_reservations` table (unique per ledger entry). Server-only grants, RLS on.
  - New ledger reasons: SIGNUP_BONUS_REFEREE, REFERRAL_SIGNUP_BONUS, ADMIN_ADJUSTMENT, UNFUNDED_PENDING.
  - New ledger columns: program_id, reservation_id, funding_state (nullable, with defaults).
  - Function `award_signup_bonus(user, wallet, referrer)`: SECURITY DEFINER, service_role only, `FOR UPDATE` lock on the budget row, unique keys on (user, reason) and (wallet, reason).
  - Retire the old `referral-signup-auto-credit-50` path in `handle_new_user` (leave it inert).
- `src/lib/rewards/signupBonusPolicy.ts` (pure: effectiveAt, amounts, eligibility); `signupBonus.server.ts`, triggered after wallet binding and email verification.
- `flowConversionPolicy.ts`: 677 policy uses a 1e18 ratio but only through `claimGate` (reconciliation + solvency); `rewardState.server.ts` totals the ledger.
- Earn/referral copy updated; the "not convertible" line is replaced only when the gate opens.
- No changes to Router V3/V4, FlowToken, the distributor, staking, MultiSend, or CaSwap.
