# V37 — Continuous Points, Operator-Approved Claiming

- [x] 1. Claim-minimum policy change (pure + tests)
- [x] 2. Rewards Approval Queue (pure module, migration, server, API, Ops UI)
- [x] 3. Payout preparation on confirmation (no new reservation, prepare-only unsigned batch, claim window returned)
- [x] 4. User Rewards page: four balances + claim link gate
- [x] 5. Tests: small amounts, cycles, partial, multi-user, duplicate prevention + DB-level concurrency/guard checks
- [x] 6. Full regression + build verification (2,036 tests green; build OK; signed-in Rewards page and admin queue API verified live)

Preserved: Round #3 (1,122 FLOW, unsigned, unpublished), 74 unfunded / 776 restricted Points, auto funding/signing OFF, scheduler OFF, no contracts, no real payouts.

- [x] V37.1 automatic approval within Ops daily budget (default OFF)
- [ ] V37.1 link confirmed approvals to the prepared batch (settlement_batch_id) on publication
