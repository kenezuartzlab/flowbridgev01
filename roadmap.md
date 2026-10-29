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
- [x] Correct execution guards, exact initial prices and approval previews; unknown receipts fail closed.
- [x] Verify Mainnet venue/token wiring without sending transactions; preserve swap routing.
- [x] Run liquidity/swap safety tests, full regression and read-only desktop/mobile acceptance.
- [ ] Connected-wallet transaction/rejection/recovery acceptance: requires authorized wallet testing.
- [ ] Mainnet activation and production publication: blocked on separately authorized canaries and connected-wallet acceptance.

# Targeted mobile swap and existing bridge tracking release
- [x] Compact confirmation/receipt layouts with visible internal footer and safe viewport handling.
- [x] Evidence-only bridge states, durable context and chain timestamps, stale-read guards and safe tracker handoff.
- [x] Official BOT branding and Protocol Fee labels; preserve all financial execution.
- [x] Focused regression (283), full regression (2,079), responsive modal checks, restored-tracker read-only flow and fresh security; automatic preview build OK. Separate manual typecheck not run (harness-owned).
- [ ] Verified relay/destination progress: blocked by absence of an existing correlated provider/destination evidence feed; display unknown, never fake completion.
- [x] Published correction and verified flowbridge.space/trade HTTP 200, no runtime errors; App-DTHqg3Vy.js SHA-256 17e1105be5dc70b16f0acfe331fb0d632e7c612daed4d008279239830206434c.

# Monitoring finding review
- [x] Verify cited auto-approval mid-loop persistence: stale; current reads use persistBatch:false. Six focused files / 62 tests pass.
- [ ] Direct bridge verified completion: confirmed missing authoritative destination correlation feed; integration plan awaiting approval and official evidence interface.
