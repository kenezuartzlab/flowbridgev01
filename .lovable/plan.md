# V36.10 — Unified Rewards Operations Control Center

Builds on what already exists (reservation RPC, solvency report, settlement planner/queue, publish gate + verify, Budgets tab). No new reward engine, no on-chain writes, auto-signing stays OFF.

## Phase A — Apply the approved 1,047 FLOW funding (through the new workflow, not by hand)
- Phase A runs as the first real use of the Phase C "Review & Confirm Funding" flow, so the same safeguards apply to it.
- Snapshot check: re-read the 14 records, wallet bindings, activity, policy versions, duplicates, the Core Swap ceiling and live distributor backing. The run goes ahead only if the set and the total match the approved snapshot (1,047 Points, 14 rows, six accounts, frozen hash `b8d240fd…8b34`). Any difference stops it and opens an Ops exception.
- Records with no program label are fixed in one additive, audited step. It sets `program_id = 'CORE_SWAP'` only where verified Router V3/V4 Mainnet provenance exists, and keeps the original value in the audit evidence. Rows that already have a label are left alone.
- The 776 restricted Points, the 250 held Points, the 50-Point legacy mismatch, the signup wallet mismatches and rounds #1/#2 are excluded by the existing rules and are never touched.
- Afterwards eligibility is recalculated. If exactly one wallet reaches 1,122 Points, the unsigned Round #3 candidate is saved for publisher review and is not published.

## Phase B — Ops → Rewards Control Center (one tab with sub-sections)
Overview · Funding Queue · Funding Approvals · Settlement Queue · Review & Publish (existing) · Budgets (existing) · Exceptions · Audit History. Each section shows a status chip (READY / NEEDS APPROVAL / BLOCKED / PENDING / CONFIRMED) and one primary next action, with the exact blocker and how to fix it. Audit history and reports download as CSV/JSON. The screen works in TokenPocket at 320–430px.

## Phase C — Review & Confirm Funding
1. An operator proposes funding. The server builds an immutable snapshot (record IDs, amounts, SHA-256, backing and budget readings).
2. A super admin approves it. Approval is a separate role, and the proposer cannot approve their own snapshot when policy requires two people.
3. A confirm call in the database re-checks the snapshot hash against live rows, the budget, backing and exclusions. In one transaction it then reserves and marks the rows as funded and writes an audit record.
4. A snapshot can only be confirmed once (unique lock and status transition). The call rejects snapshots that are stale or mismatched, repeated, or sent by the wrong role. Re-check only reads and never runs the funding again.
5. CONFIRMED appears only after the database commit. The settlement queue rebuild then runs.

## Phase D — Routine automation
- A scheduled job runs every 15 minutes. It verifies events, recomputes eligibility, runs solvency and duplicate checks, prepares batches (unsigned), re-checks publication receipts (read-only), reconciles the audit trail and queues publisher and claim notifications.
- Per-program auto-funding policy: an enabled flag, a per-run cap, a daily cap and an emergency suspend switch. It ships **OFF** and can only be turned on by a super admin, with an audit record.
- Nothing in it signs on-chain.

## Phase E — Publishing
The existing publisher flow stays as it is and becomes the single Review & Publish action whenever a prepared batch exists. Batch limits, the publisher wallet gate and receipt verification are unchanged.

## Phase G — Acceptance
Tests cover:
- double confirmation
- the wrong role approving
- going over the budget or backing
- stale snapshots
- exclusions holding
- Round #3 never publishing automatically
- network and wallet guards

Then: concurrency test (8 parallel confirms → 1 funding), full regression, security scan, build, and mobile/desktop checks. After that, publish and verify production. The owner then confirms the 1,047 FLOW in the new UI, or I run it once the gates pass, using the existing approval.

## Technical details
- New tables (with grants, RLS deny, service_role only): `reward_funding_snapshots` (status, hash, rows jsonb, totals, proposer/approver/confirmer, timestamps, unique hash), `reward_ops_exceptions`, `reward_automation_policy`.
- New SECURITY DEFINER RPC `confirm_reward_funding_snapshot(p_snapshot, p_actor…)`. It locks the snapshot, re-validates the rows and calls the existing `reserve_reward_budget` logic in the same transaction.
- API: `/api/admin/rewards-funding` (GET queue/snapshots, POST propose, PUT approve, PATCH confirm), `/api/admin/rewards-exceptions`, `/api/public/hooks/rewards-sweep` (cron, read-only/prepare-only, bearer filter only).
- Pure logic in `src/lib/rewards/fundingSnapshot.ts` (+ tests), plus a scoped rule in rewards AGENTS.md.

## Blockers I cannot remove
Physical TokenPocket signing acceptance, the decision on the 776 restricted Points, and the publisher signature for Round #3.
