# V37 — Continuous Points, Operator-Approved Claiming

# Rewards Vault V2
- [x] Optional Claim FLOW / Claim & Stake Flexible: canonical live checks, sequential receipt verification, nonce-backed durable recovery, mocked adversarial tests and signed-in disabled 320/390/430/1280 preview; no financial activation or publication. Unknown broadcasts remain blocked pending exact receipt reconciliation; live financial acceptance requires authorized deployment.
- [x] Non-upgradeable contract, exact compiled ABI, local adversarial/EVM tests and unsigned deployment instructions; 100-recipient execution 5,659,147 gas.
- [x] Installed disabled post-cutover routing, canonical funded source RPC, bounded allocator, global V1 approval/batch/publication fences, atomic reservation and exact receipt ingestion; readback confirms zero config, destination, allocation, batch and credit rows. No historical mapping.
- [x] Ops new-award cutover review, authenticated future cutover/prepare/credit verification commands, runtime-gated user panel and adversarial tests: 2,224 full tests, 66 focused tests, isolated 8-way reservations/6-way confirmations/V1 concurrency checks, automatic typecheck/build OK, signed-in 320/390/430/1280 Rewards/Earn and bound Super Admin review PASS.
- [ ] Finish only V2 publisher signing controls: durable database intent before popup, exact immutable payload, nonce/hash recovery, authenticated Ops integration and regression/security/mobile verification; keep disabled and undeployed.
- [x] Shared Rewards/Earn disabled panel and super-admin view-only controls; 320/390/430/1280 smoke no overflow/runtime errors, legacy claim section preserved.
- [x] Full regression and automatic build passed; backend scan reports no new actionable findings. Production remains unchanged/not published; dependency scan retains existing high/moderate advisories. Live Mainnet acceptance unavailable without authorized deployment.
- [ ] Mainnet deployment/funding/cutover: requires separate owner financial authorization; not part of this implementation.

- [x] Visitor voting announcement: owner artwork, direct in-app CTA, Control Panel editing/removal controls; 17 focused tests, automatic build OK, 390px arrival/dismissal/vote-link and desktop Earn checks pass. Existing super-admin save restriction preserved; no settings write or publication performed.

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
- [x] Oct 31 incident: both account ledgers and authorized budgets inspected; Round #4 public proofs and live evaluator pass for 11/11 unclaimed leaves at block 28,567,775.
- [x] Correct approval-read snapshot persistence, prepare manual confirmations after commit, and exclude unsupported milestone rows from pending funding; all economic holds unchanged.
- [x] 558 rewards tests / 2,120 full tests; automatic build OK; signed-in 390px program breakdown has no overflow. Corrective release verified at flowbridge.space: RewardsExperience-B_WqHfZy.js includes pending program breakdown; ReferralRewards-BroYjDfn.js includes no-new-published-allocation wording. No financial writes or Round #5 preparation performed.
- [x] Oct 29 incident: read live funded reservations, approvals and Round #4; bound payout-state reads and distinguish reconciliation-held funding from ready allocations.
- [x] Published incident correction; live Ops asset ops-DYmLlvbm.js fingerprint c2c8c6a082813566, signed-out Rewards/Ops HTTP 200 without runtime errors; 2,101 tests passed and preview build OK.
- [ ] Next payout readiness: no confirmed unpaid approvals or Round #5 stored. CORE_SWAP has an authorized 1M ceiling but funding_verified=false; 415 verified Points lack reservations. The 299 signup delta remains blocked by REVIEWED_NONCLAIMABLE_HISTORICAL (981 stored-vs-accepted difference, 776 provenance-held swap Points and 30 unsupported later milestone Points). Requires explicit program backing authorization and an audited account evidence decision preserving historical exclusions; no financial action authorized here.
- [x] Verify cited auto-approval mid-loop persistence: stale; current reads use persistBatch:false. Six focused files / 62 tests pass.
- [ ] Direct bridge verified completion: confirmed missing authoritative destination correlation feed; integration plan awaiting approval and official evidence interface.
