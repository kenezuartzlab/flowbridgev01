# V36.2 UI/read-only acceptance — 2026-10-15

## Verified account evidence (identities omitted)
- Displayed 1,000 PTS = 800 stored historical profile Points + 200 ledger-only referrer signup awards (two 100-PTS rows). The profile history is not a fully ledger-reconciled Mainnet entitlement.
- Verified summary: 625 Mainnet Points awaiting funding; 1,381 excluded historical/Testnet-classified Points; 0 eligible toward the next 1,000; 0 claimable FLOW; 1 FLOW claimed in verified round #1.
- The 2,023 figure came from profiles.claimed_tokens, a legacy conversion counter, not live distributor evidence. Removed from Earn, assistant evidence and the legacy wallet balance display.
- Referrals #1–#7 predate the October 4 program; all have verified emails, #7 has no bound wallet. Later binding does not make them new signups.
- Referrals #8–#9 were created October 14, email verified, wallet bound, no prior other-account bonus wallet found; each has its own FUNDED 100-PTS award and a matching 100-PTS referrer award.
- Historical milestone awards total 150 PTS across two referrals; badges are not funded Mainnet entitlement. Current Mainnet evidence does not justify treating old Testnet volume/day badges as qualified Mainnet milestones.
- Signup budget has 998,900 PTS headroom; its funding_verified flag is false. Swap/referral program flags are also false. No flags, budgets or ledger rows were changed.

## Outstanding accounting issue
The two FUNDED referrer awards have null chain IDs. The existing progression counts funded chain-677 rows only, while the legacy incentives endpoint also treats signup rows as eligible. V36.2 preserves zero eligibility and exposes the classification condition, rather than changing economics. The displayed total must never imply all 1,000 PTS are ledger-backed or claimable.

## UI and checks
- All five Mainnet staking products active; vault unpaused, read directly on chain 677. No transaction sent.
- Mobile assistant moved into reserved bottom navigation space; account metrics wrap, policy and payout explanations collapse.
- Signed-in Earn/Rewards/Profile checked at 320, 384, 430 and 1280 pixels; no horizontal overflow; nine referral rows read back.
- Before/after screenshots captured privately in the sandbox. Real TokenPocket device verification unavailable.
- 154 test files / 1,724 tests passed; automatic build and type validation OK. Fresh backend scan found only the two previously accepted findings; deep scan timestamps remain older.
- No contract, treasury, funding, reward policy, role, fee or oracle changes; no signatures or blockchain writes.