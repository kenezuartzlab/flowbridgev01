# System verification and simple Ops funding

## Implemented
- Existing canonical accrual automatically writes VERIFIED awards after receipt, wallet, policy, server pricing and limit checks; diagnostic records now retain original calculated Points, base Points, USD calculation inputs and validation results. No historical metadata was backfilled.
- Ordinary verified UNFUNDED awards enter the existing funding queue, not Evidence Review. Queue reads include funded history for duplicate detection.
- Ops Control Center opens on an aggregate overview: qualifying Points, wallets, funding, unencumbered backing, verified budget, valuation exceptions, funded totals and claimed on-chain totals. Proposal and separate super-admin approval/confirmation remain distinct financial decisions.
- Successful atomic funding confirmation invokes existing unsigned settlement preparation. Failed preparation never repeats funding or reports a payout as published.
- Historical assessment is SELECT-only. Recorded valuation and self-described metadata cannot establish historical authority. Existing transaction, calculation, funding and reservation evidence is displayed automatically.
- Round #3 now has one grouped proposal with nine individually auditable evidence records. Atomic group RPCs support up to 50 records, retain individual audits, reject direct child decisions and roll back all records on a failed live check. A different current super admin decides the group.
- Authorized group decisions automatically recalculate unsigned eligibility and the existing renewal proposal. The Payout Operations read is invalidated; renewing the stored schedule, signing and publishing still require separate explicit actions.
- Missing original price documentation is optional under HISTORICAL_PRICING_EXCEPTION_V1, not a fraud/duplicate/wallet/policy waiver. RPCs recheck receipt/log identity, bound wallet, owner exclusions, approved version/day, original recorded economics, caps and matching reservations at proposal and approval. Approval changes provenance only, never funding or amounts.
- Insert caps count approved exceptions; publication accepts them only with a complete independent approval audit and original valid funding reservation.

## Read-only Round #3 report — 2026-10-25
- Stored: **1,122 FLOW**, one wallet, unpublished; no signing or funding occurred.
- Held Core Swap: **nine records / 1,022 Points**.
- Meet complete original approved verification requirements: **0 records / 0 Points**.
- Need historical valuation exception: **nine records / 1,022 Points**. Stored receipt/log and bound-wallet evidence passes; original historical price-source evidence is missing. The recorded USD is not assumed correct.
- Restricted: **776 Points / ten records**, preserved. Existing **74 unfunded excluded Points** stay unreserved; implementation did not fund any row.
- Reservations remain **40 / 3,457 Points**. All positive Core Swap records retain their prior funding state: **16 funded / 1,057 Points; 19 unfunded / 1,140 Points**.
- Rewards scheduler `rewards-ops-sweep`: **OFF**. Other existing jobs were not changed.

## Verification and limitations
- Latest grouped-review regression (09:20 UTC): **2,020 tests / 198 files PASS**; automatic build/typecheck **build OK** at 09:20:14 UTC.
- Exact migrations 0033/0036/0037/0038 on a disposable local database: nine funded records / 1,022 Points, one atomic proposal; same proposer/non-super/direct child denial; eight approvals produce one effective decision and one group audit; stale evidence and invalid policy roll back the group; duplicates blocked; original nine reservations / 1,022 Points unchanged. This does not authorize or mutate live records.
- Actual authenticated API returns nine held records / 1,022 Points; wrong-wallet access returns 403. Directly mounted actual-data group screen displays all nine transaction/policy/USD/wallet/reservation records; one rationale and prefilled missing-evidence statement verified, then cancelled. Not a physical connected-wallet test.
- Fresh live invariants: zero grouped proposals/reviews, renewals and publication attempts; 40 existing reservations; 74 unfunded and 776 restricted Points; automatic funding OFF. Round #3 remains 1,122 FLOW/unpublished.
- Basic security scan: no new actionable findings. Full and production dependency checks flag one high Zod advisory (GHSA-mrhx-c7xc-m3w5) in existing transitive dependencies. No dependency upgrade or risk waiver was performed. Release remains HOLD; physical connected-wallet acceptance and release security clearance are unverified. No production deployment or new live fingerprint is claimed.
- Authenticated real-data control/evidence APIs return 200. Overview, evidence display, batch selection and 390px layout checked with actual caller-scoped reads; component mounted directly for visual acceptance, not a physical connected-wallet test.
- No exception proposals/approvals, financial confirmations, publisher signatures or chain transactions were exercised against live financial records. These remain gated; unit tests cover post-confirm preparation and duplicate reservation exclusion.
- No independent immutable historical pricing archive exists for these records. No automatic PENDING→VERIFIED promotion was introduced; pending records require the approved exception path.
- Current pricing metadata remains diagnostic fetch-time information, not proof of an original historical observation.
- Existing claim discovery/reconciliation and claim-window gating remain unchanged; no new notification service or premature claim announcement was added.
- Not published in this task; preview application changes and shared-backend safeguards are implemented.