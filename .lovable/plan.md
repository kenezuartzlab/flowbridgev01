# V36.11 — Payout Operations

## Outcome
One Payout Operations screen inside Ops for funded eligibility, payout review, schedule renewal and transaction recovery. Routine payouts must not require developer instructions, database edits, date calculations or transaction hashes for transactions never broadcast.

## Verified starting state
- BOT Mainnet distributor reports two published rounds, is not paused, and requires a 86,400-second publication-to-claim delay.
- Stored Round #3: one wallet, exactly **1,122 FLOW**, batch `d45a18df-94e5-43b0-a3e8-34b5b1614f31`, root `0x900d6d388a7fac2db334aeb9c8ab38279e17e2b4f1c928aa3fb1101b8fda7de9`.
- Its stored claim window is **2026-10-20 16:00 UTC → 2026-11-19 16:00 UTC**. It cannot now satisfy the publication delay. Re-review alone cannot repair it.
- No publisher attempts exist. Original records remain untouched.
- The earlier 74-point exclusion must be checked row-by-row, not inferred from current aggregate totals: current Core Swap totals contain additional activity. The 776 restricted historical Points remain excluded.

## 1. Single operator screen
- Add Payout Operations within the existing Control Center navigation.
- Show funded eligible FLOW, qualified wallet count, selected stored allocation, next payout, publication readiness, claim dates, last verified time and precise blockers.
- Choose one primary action from Review, Approve renewal, Sign, Re-check or Recover using a shared state decision module.
- Reuse the existing publisher wallet flow and recovery safeguards. Unresolved batches, stale reviews and failed reads must never expose a ready-to-sign confirmation.
- Present exclusions separately and distinguish proposed schedules from authorized stored terms.

## 2. Authorized schedule renewal
- Compute valid dates from fresh contract time and actual minimum delay, preserving the established safety margin and 30-day window.
- Automatically prepare a renewal proposal when an unpublished schedule is no longer valid. Display old/new dates, original/proposed identity, allocation, root, reservation evidence, changed terms and required authority.
- Keep schedule-only renewal roots and proofs unchanged when their inputs are unchanged; recompute fingerprints and calldata for the new schedule. Any allocation, recipient or funding drift blocks schedule-only renewal and requires separate allocation authorization.
- Persist proposal and approval lineage separately from original immutable batches. An explicit authorized approval applies a renewal transactionally; preparing or viewing a proposal does not apply it.
- Lock renewal and publication against the same batch/epoch authority. Pending or uncertain publication prevents renewal; repeated or concurrent requests are idempotent.
- Freshly validate funding, exclusions, wallet bindings, contract state and timing before approval and again before the wallet opens.
- **Prepare Round #3’s proposal only. Do not approve or apply its replacement during development.**

## 3. Durable recovery and operator alerts
- Restore attempts from server records after refresh, wallet disconnect or interrupted sessions.
- Reconcile recorded sender nonce, transaction identity, calldata, receipt, canonical confirmations and on-chain round before reporting success.
- Automatically recover confirmed-but-unrecorded publication using the existing atomic confirmation/audit operation. Unknown broadcasts remain locked; never infer cancellation from timeout or absence of a hash.
- Extend the existing verification sweep and internal exception list for backing, eligibility, duplicates, permissions, pause/budget, schedule renewal, pending transactions and claim expiry.
- Secure background writes with server-only authorization; a public publishable bearer key is insufficient.
- Use one low-frequency reconciliation backstop, supplemented by checks on operator actions. Its cadence and maximum detection delay will be documented; background jobs are enabled only against a verified deployed endpoint.
- Notify authorized operators inside Ops. No user claimability announcement precedes confirmed publication and an active claim window.

## 4. Financial boundaries
- Preserve the 1,000 funded eligible-Point minimum, existing funding permissions, program budgets, wallet verification, historical exclusions, publisher permissions and batch/day limits.
- Automatic funding and automatic signing remain OFF.
- No Round #3 signature/publication, FLOW movement, contract/fee/treasury change, funding of the 74 Points or release of historical holds.

## 5. Acceptance and release evidence
- Add focused tests for schedule expiration and renewal, unchanged originals, changed eligibility, stale/missing reviews, authorization, cancellation, refresh, disconnect, delayed mining, interrupted confirmation, exact reverts, duplicate clicks and claim-window boundaries.
- Run eight-client concurrency acceptance against a disposable database, plus private-chain simulations where required; never use real payout signatures for testing.
- Validate authenticated Ops with fresh authoritative records on desktop and phone layouts. Automated wallet-provider checks will be distinguished from physical TokenPocket acceptance.
- Provide repeatable regression, financial invariant, concurrency, dependency/security and release-evidence checks. Use the environment’s automatic build/typecheck gates rather than bypassing them.
- Maintain an owner/scope/expiry risk register. The existing cloud/IAM exception is explicitly V36.10.2-scoped and will not silently authorize V36.11 or dependency/payout defects.
- Record actual production assets, hashes, security headers and authenticated read-back only after deployment. Never declare production PASS while a mandatory gate remains unresolved.

## Technical implementation
- Keep pure scheduling, renewal validation and primary-action decisions under `src/lib/rewards`, with tests beside them.
- Add an additive, service-role-only renewal/approval schema and transactionally fenced RPCs with explicit grants and RLS. Preserve batch lineage without weakening existing publication locks.
- Update all batch selection/read paths together so historical originals cannot conflict with the active authorized revision or published-round discovery.
- Reuse the admin gate, existing Control Center endpoints, publisher verification and canonical funded settlement calculation; keep private operator evidence out of public responses and client bundles.
- Update project architecture rules and the roadmap as each feature and acceptance gate completes.

## Release blockers to resolve honestly
- Fresh dependency advisories require remediation, not the cloud/IAM exception.
- Physical supported-wallet acceptance requires a real device check if it remains mandatory.
- V36.11 cloud assessment or appropriately scoped release authorization must be resolved without extending the V36.10.2 exception automatically.