## 1. Fix "Bind Manual Address" error

Root cause: `prevent_protected_profile_updates` trigger checks `current_setting('request.jwt.claim.role', true) = 'service_role'`. With new `sb_secret_*` API keys (non-JWT), that claim is empty, so the server-side admin update to `binding_changes_count` / `last_binding_change` is rejected.

Fix: migration to update the trigger to also allow bypass when `current_user = 'service_role'` (or `session_user`), which is how Supabase routes admin key traffic regardless of key format.

## 2. Email verification UX

- Verification email: check `check_email_domain_status`; if templates/rate limit is the issue, call `scaffold_auth_email_templates` and/or raise `rate_limit_email_sent`. Guide user if custom domain isn't verified yet.
- After clicking verification link, user lands back on `/` with `?type=signup` in hash. Add a small effect in `src/App.tsx` (or root) that detects a fresh confirmed session (transitioned from unverified → verified via `onAuthStateChange` USER_UPDATED, or hash contains `type=signup`) and shows a toast: "Email verified! You can now earn FLOW points."

## 3. Social-follow gate before FLOW claim

Add a `social_follows` table:
```
user_id uuid PK -> auth.users
youtube_confirmed_at timestamptz
x_confirmed_at timestamptz
telegram_confirmed_at timestamptz
```
Grants + RLS: user can select/update own row.

UI: in the Rewards → Claim panel, add three link-out buttons (YouTube, X, Telegram). Each opens the link in a new tab and marks that channel confirmed on click (self-attested; standard pattern for these gates). Claim button is disabled until all three are confirmed AND the other constraints below are satisfied. Server `claimFlowPoints` verifies all three flags before allowing claim.

## 4. Split FLOW points into 3 buckets + $100/1000 referral cap

Schema change (migration):
Add columns to `profiles`:
- `points_self` int default 0 — own swap/bridge points
- `points_referral_activity` int default 0 — recurring points from referred users' swaps/bridges
- `points_referral_signup` int default 0 — one-time signup bonuses (currently the +50 on link)
- `total_swap_volume_usd` numeric default 0 — cumulative $ volume of caller's verified swaps/bridges

Keep `flow_points` as the sum (mirror) for backwards compatibility, updated by the same server writes.

Server rules:
- Signup bonus (+50 today) → `points_referral_signup` on referrer.
- Server-verified swap/bridge points → `points_self` on caller, and a recurring cut → `points_referral_activity` on referrer.
- `createTransactionHistory` (or the on-chain verification path) also increments `total_swap_volume_usd` for the caller.

Claim rule in `claimFlowPoints`:
- Require ≥ 1000 total, social gates all true, wallet bound, email verified.
- Compute `maxSignupClaimable = floor(total_swap_volume_usd / 100) * 1000` for the caller.
- Effective referral-signup claimable = `min(points_referral_signup, maxSignupClaimable)`.
- Claimable total = `points_self + points_referral_activity + effectiveSignupClaimable`.
- Deduct exactly those amounts from their respective columns; any locked signup points remain until the user swaps more.

UI Rewards panel: show three separate totals + a "Locked (needs $X more in swaps)" hint for referral-signup points; the Claim button reflects effective claimable.

## Technical Details

Files:
- `supabase/migrations/*` — trigger fix, new columns, `social_follows` table + RLS/grants.
- `src/lib/flowbridge-db.server.ts` — split accounting, updated `claimFlowPoints`, `ensureProfile`, `linkReferralIfMissing`, `getUserPointsAndReferrals` (returns 3 buckets + volume + locked amount + social flags).
- `src/routes/api/social-follows.ts` (GET + POST channel confirm).
- `src/routes/api/users.claim.ts` — unchanged signature, new checks live in helper.
- Rewards UI component (find current file — likely `src/components/incentives/*` or in `App.tsx`) — add social buttons, split breakdown, locked hint.
- Root/App — post-verification toast.
- Email: run `email_domain--check_email_domain_status`, act on result.

## Out of scope

- Real OAuth verification of social follows (self-attest is standard for this kind of gate).
- Historical backfill: on migration, seed `points_self = flow_points`, others = 0 so existing users aren't penalized.
