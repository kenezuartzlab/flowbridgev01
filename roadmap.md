# V37 — Continuous Points, Operator-Approved Claiming

- [x] 1. Claim-minimum policy change (pure + tests)
- [x] 2. Rewards Approval Queue (pure module, migration, server, API, Ops UI)
- [x] 3. Payout preparation on confirmation (no new reservation, prepare-only unsigned batch, claim window returned)
- [x] 4. User Rewards page: four balances + claim link gate
- [x] 5. Tests: small amounts, cycles, partial, multi-user, duplicate prevention + DB-level concurrency/guard checks
- [x] 6. Full regression + build verification (2,036 tests green; build OK; signed-in Rewards page and admin queue API verified live)

Preserved: Round #3 published history and claimed allocation; restricted/unfunded rewards unchanged, automatic funding/signing OFF, no contract changes or real payouts during implementation.

- [x] V37.1 automatic approval within Ops daily budget (default OFF)
- [x] V37.1 link confirmed approvals to verified published rounds
- [x] Simplify automation to existing authorized funding and campaign limits, retaining OFF and suspension
- [x] Safely retire expired unapproved draft without reusing allocations (audited retirement confirmed)
- [x] Verify atomic backing/duplicate/batch safety: isolated concurrent writes, caps, unpaid deltas and schedule recovery
- [x] Rewards release and Round #4 publication completed; preserve existing rewards controls.

# Smart Trade + Liquidity V1 completion
- [ ] Correct execution guards, exact initial prices, approval previews and receipt recovery.
- [ ] Verify Mainnet venue/token wiring without sending transactions; preserve swap routing.
- [ ] Run liquidity/regression safety tests and desktop/mobile acceptance.
- [ ] Mainnet activation and production publication: wait for authorized canaries and wallet acceptance if required.
