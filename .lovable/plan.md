# V37 — Continuous Points, Operator-Approved Claiming

Owner direction: remove the 1,000-Point minimum for new Ops-approved claims; any positive verified eligible amount can be paid out. Round #3 (1,122 FLOW stored, unsigned, unpublished) and all historical rounds stay unchanged. No contracts, no automatic signing/funding, no real payouts during implementation.

## 1. Claim-minimum policy change (pure, tested)
- `claimMinimumPolicy.ts`: keep `MAINNET_MIN_CLAIM_FLOW = 1,000` documented as the historical policy for rounds #1/#2 (and the canary exception). Add `MIN_OPS_CLAIM_FLOW = 1` for new Ops-approved rounds: `leafMeetsClaimMinimum` returns true for any positive amount on rounds after the last historical epoch; historical epochs keep their recorded terms.
- `settlementPlanner.ts`, `settlementQueue.ts`, `publicClaimPolicy.ts`, `rewardProgression.ts`, `rewardsSummary.ts`, `rewardPolicyPresentation.ts`: switch the *new-round* threshold to the new minimum; "below minimum" blocker becomes "awaiting Ops approval / not yet funded". 1:1 conversion, earning caps, backing checks unchanged.
- Update `src/lib/rewards/AGENTS.md` and the claim-minimum memory.

## 2. Rewards Approval Queue (Ops)
- New pure module `approvalQueue.ts`: per-account candidates from server facts only — bound wallet, verified eligible Points, funded, already settled/claimed, held/excluded, program budget and distributor backing. Delta math: payout = funded eligible − already allocated; zero/negative never proposed.
- New table `reward_payout_approvals` (migration: CREATE + GRANT + RLS service-only writes, admin reads via API): one open proposal per account, amount + evidence hash immutable after proposal, PROPOSED → APPROVED/REJECTED by a *different* super admin, then CONFIRMED once. Reuses the proposer/approver separation of the funding snapshots.
- `approvalQueue.server.ts` + actions in `/api/admin/rewards-control`: list, propose, approve/reject, confirm. Capacity check (program ceiling + free backing) re-run at proposal, approval and confirmation. No new evidence forms for ordinary verified rewards; historical exceptions stay on the existing grouped path.
- Ops Control Center gets an "Approval Queue" section: one row per user (wallet, available, funded, claimed, proposed FLOW, backing, held), with Review & Propose / Review & Approve / Confirm actions.

## 3. Immediate payout preparation
- On confirmation: reserve once (existing reservation mechanics; never twice), then automatically build an unsigned settlement candidate via the existing `settlementPlanner`/`payoutBatch` for the approved accounts, validating live distributor state (epoch count, pause, budget, minPublishDelay).
- The claim activation time shown everywhere is `now + minPublishDelay + margin`, rounded as today — the contract enforces the delay; nothing bypasses it. Publisher signature stays manual via the existing Review & Publish flow. If same-moment claiming is ever wanted, that's a separate contract design — out of scope.

## 4. User Rewards page
- Four balances from server facts: Available Points (verified, awaiting approval), Awaiting Approval (proposed/in review), Approved FLOW (funded+approved, with publication status and activation time), Claimable FLOW (open on-chain allocation).
- Dominant CLAIM FLOW button only when an open, proof-valid allocation exists (existing lifecycle gate). New earnings keep accruing after a payout (delta math already subtracts settled amounts).

## 5. Tests (no real payouts)
- Pure tests: small amounts (25/100/250), repeated payout cycles for one wallet (delta correct), partial payout (approve less than available), concurrent approvals (one wins), multiple users in one batch, duplicate-claim/double-fund prevention, wallet binding enforcement, insufficient backing blocked, held/excluded Points never included.
- Extend the isolated Postgres concurrency script for the new approval table.
- Regression: existing 2,024 tests must still pass; historical round tests pinned to the old minimum keep their expectations.

## 6. Out of scope / preserved
- Round #3 untouched: no rewrite, no auto-publish; its separate renewal workflow remains.
- Automatic funding and signing stay OFF. No contract changes, no treasury movement, no real financial transactions.
- Hourly scheduler stays OFF; manual "Run checks now" unaffected.

## Verification
Run full regression + new tests + concurrency script; check build log; then report what remains untested (any step needing a real wallet signature stays explicitly outstanding).
