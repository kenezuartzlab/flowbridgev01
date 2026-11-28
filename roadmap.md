# AutoTrade V1.3 final functional integration — paper-only
- [x] Share conservative per-leg route comparison between manual Swap and AutoTrade; BDEX V3 default, alternative CaSwap quote-only with 500 bps directional fee cap and fail-closed registration/identity/fee/liquidity gates.
- [x] Wire worker → mocked/fork executor transport with durable outbox/nonce/fence/pause, exact approvals, receipt reconciliation and signer payload checks; live/signer/independent-RPC remain OFF.
- [x] Pause failing schedule 334, add authenticated worker/RBAC tests, preserve the BNB/RWA publication boundary and record the whole-release blocker; no publish.
- [x] Document independent BOT node, managed non-exportable signer and dedicated-account requirements without credentials, accounts, funding or external signatures.
- [x] Complete local CA/BOT buy→sell plus four-pair/adversarial/reward-exclusion tests; typecheck/build pass, 108 focused and 3,702 full-suite tests pass, evidence report added.
- [ ] HOLD: resume schedule only after an authorized whole-project publish and observed heartbeat/metrics; connected bound-wallet create/tick acceptance remains blocked (403 without wallet).
- [ ] HOLD: live trading, registry writes, public AutoTrade, exact owner prices/order and separate gas cap, real accounts/keys/funding/signatures; 5 USDT-equivalent single-canary cap is APPROVED_CAP_ONLY.

# Exact owner-route recheck — read-only / local fork
- [x] Pin all four owner addresses at 31,793,279; prove BDEX USDT/WBOT 0.3% identity, all five V3 entries, immutable historical factories and complete bounded V2 CA-pool enumeration.
- [x] 24 native and 6 atomic CA/USDT local-fork trades match actual V4 caller quotes, budgets, fees and selected allowance/residual checks; BDEX 1% wins all sampled comparisons. UniversalRouter incompatible; 0.3% CA tier fails two-sided quoting.
- [x] Exact mapping, fee/admin risks, source/runtime evidence and reproduction archived; 122 focused tests pass, preview build OK; no production or prior-evidence changes. Report: docs/security/CASWAP_EXACT_OWNER_ROUTES_RECHECK_20261128.md.

# Targeted CaSwap registry correction audit
- [x] Pin exact new/old CaSwap identities, V3/V4 registries, historical receipt routes, backing and realistic quotes at BOT block 31,792,262.
- [x] Local-only V4 registration and four native buy/sell pairs pass output/fee/approval/residual checks; new CaSwap sell fee is 73%, so no default/activation recommendation.
- [x] 107 targeted tests pass; source/runtime provenance, replay, deterministic manifest and correction report archived; application/configuration unchanged.
- [ ] Integration HOLD (outside this diagnostic): external CaSwap 73% sell fee and mutable-admin risk, refreshed evidence and separate registry/signer/canary authorization; BDEX V3 default retained.

# BNB V1.16 direct-EOA governance exception — preview only
- [x] Record exact Guardian/Treasury direct-EOA preferences as OWNER_DIRECT_EOA_CHOICE_RECORDED / OWNER_EOA_EXCEPTION_PROPOSED; preserve preferred 2-of-3 Safe policy and all execution/launch holds.
- [x] Add exact-address two-RPC/pinned-block/empty-code/freshness/issuer/control/risk gates, private constructor argument preview (no calldata), pending owner-readable risk acknowledgment and D-01…D-05 summary.
- [x] Add 29 governance tests and 21 isolated mock-EVM tests for exact EOAs, 0/5/10 bps scenarios, pause access, exact selectors, protocol-target rejection and ledger effects; frozen V1.13 source unchanged.
- [x] 3,504/3,504 tests (287 files), typecheck/build PASS; 640 Swap and 5,036 nav/ad assertions PASS. Frozen source/ABI/bytecode checks PASS; 53-file private packet reproduced identically twice. Report: docs/security/BNB_V1_16_DIRECT_EOA_GOVERNANCE_READINESS_20261126.md.
- [ ] HOLD: explicit risk acknowledgment, fee-bps/payable consent, issuer-clear and wallet-control evidence, final-preparation refresh, D-01/D-04/D-05, human/device/security gates and separate deployment authorization.

# BNB V1.15 owner-provided address verification — preview only
- [x] Both original EIP-55 strings valid and canonical; two independent BNB56 providers agreed at block 135,782,648 / hash 0xef694504…c35828 / 2026-11-26T04:27:34Z. Both are VERIFIED_EOA with empty-code keccak; Treasury issuer blocklist UNKNOWN after authoritative-method probes reverted.
- [x] Added 11 pure tests for checksum/EOA/contract/non-Safe/Safe, threshold, chain/RPC/block/code failures, protocol targets and zero writes; private evidence records no owner identities and no role selection.
- [x] 29 focused and 3,472 full tests PASS; typecheck/build PASS; V1.13 frozen, execution/WalletConnect/XAUt holds unchanged. Report: docs/security/BNB_V1_15_OWNER_ADDRESS_VERIFICATION_20261126.md.
- [ ] HOLD: both proposed EOAs fail the preferred threshold-≥2 Safe policy; V1.16 later records the direct-EOA exception without deployment authority. Risk acknowledgment, fee consent, issuer/control evidence, final refresh, human/device/security gates and explicit deployment approval remain.

# BNB V1.15 owner-input-deferred review + wallet dry-run — preview only
- [x] Preserved frozen V1.13 identity; added GUARDIAN_AND_TREASURY_DEFERRED_BY_OWNER development readiness, future Safe-facts validation and request-at-right-time checklist. No addresses, keys, role configuration or on-chain writes.
- [x] Upgraded the private V1.14 packet with exact reviewer commands, questionnaire, signed-response rules/status, six HIGH dispositions and reproducible 43-file evidence; ZERO_REVIEWERS / 0 human attestations.
- [x] Added pure simulated EIP-1193 MetaMask/TokenPocket/Rabby dry-run tests plus real-preview browser checks; no signing, transaction submission or live BNB CTA. Physical devices remain UNVERIFIED.
- [x] Verified production bundle static/dynamic reachability, global WalletConnect hold, 138 focused wallet tests, current Zod/Coinbase/minimatch advisories; no removal or unsafe upgrade.
- [x] 3,461 full tests, 257 exploit tests, fresh Slither 0.11.6 (18 findings/six HIGH OPEN), reproducible packet, typecheck/build, 640 selector/5,036 ad-nav/201 logo assertions PASS. Report: docs/security/BNB_V1_15_REVIEW_AND_WALLET_READINESS_20261126.md.
- [ ] HOLD: genuine human review and six-HIGH dispositions, physical devices, D-01…D-05, installed Zod/minimatch advisories, separate deployment planning before Safe collection, and separate financial/deployment/publication authorization.

# Bridge tracking completion — BOT / BNB
- [x] Verified the owner's BOT→BNB transfer: source success at 07:33:45 UTC, exact nonce-linked release plus USDT transfer at 07:35:23 UTC; no financial writes.
- [x] Timestamp-bounded discovery, adaptive RPC ranges, stale receipt fallback and previous-head overlap prevent missed delayed-index releases; 174 bridge/activity tests PASS, preview build OK.
- [x] Actual tracker with real receipts passes both directions at 384/1280 with injected stale receipt and delayed log indexing; real app restored transfer→Completed→Done→refresh verified, no wallet writes.
- [x] Full suite: 3,043 PASS / 5 FAIL (275 files); failures all in unchanged securityWrites.test.ts expecting proposal writes that now correctly return retirement 410. Unrelated proposal behavior/tests left untouched. No publication or sending changes.

# Voter reward privacy — selected security fix
- [x] Public vote responses contain rank/votes only, never private credits or payouts.
- [x] Private summary requires a fresh single-use wallet signature with read-only scope; it cannot authorize the separate payout endpoint.
- [x] 40 ownership/privacy/vote tests PASS; live unsigned summary denied, actual component hides private balance behind explicit verification with no automatic signature. Build OK; no payout or publication. Successful private reads tested with mocked verification; physical wallet signing not exercised.

# Contribution and community proposals — disabled
- [x] Remove Support menu/footer entry points and prevent the non-rewards modal from rendering; preserve Rewards.
- [x] Proposal reads, publishing and voting return 410 without accessing stored history.
- [x] Six tests passed; live proposal read/publish/vote requests return 410; loaded Trade page retains swaps without contribution links, build OK. No publication or history deletion.

# Claim-screen monitoring fixes — preview only
- [x] Preserve recipient review and last verified totals through same-wallet refresh; invalidate on changed/failed reads or wallet changes.
- [x] Route the Home claim action to /earn#mainnet-flow-claim and verify claim-card destination.
- [x] 76 claim safety tests and actual-hook/card 30-second polling checks at 1280/384 PASS, including paused/failed reads and wallet changes; build OK. Synthetic read-only evidence only, zero wallet writes; real funded claims not exercised or authorized.

# Private external audit submission — final V1.12
- [x] Confirm no unfinished task; remediation finished at 582e43ee, frozen V1.12 is the latest candidate.
- [x] Private complete source/test/artifact/evidence packet at contracts/audit/bnb-v112-external/submission; exact V1.12 source freeze and bytecode reproduction.
- [x] Fresh locked export install, 89 isolated tests, one-byte tamper rejection and 3,024 project tests PASS; privacy inventory and ready-for-quote checklist complete.
- [ ] Independent signed audit blocked on owner-selected firm, agreement and separately authorized engagement; no contact, payment or deployment authorized.

# BNB V1.12 remediation — preview only
- [x] Confirm V1.11 branding/candidate work committed first; preserve all frozen candidates.
- [x] Six HIGH traces reviewed without suppression; V1.12 configuration/net-floor hardening, 74 candidate tests and 15 real-bytecode LOCAL fork transactions PASS.
- [x] Hono production findings 9→1; 3,021 full tests PASS; 640 selector/201 logo/3,786 dock/288 RWA checks PASS; frozen hashes and audit packet complete.
- [ ] External blockers: independent auditor sign-off (six HIGH open), upstream-compatible Zod 3 fix, dev minimatch major compatibility, physical wallets and all separate live-launch approvals.

# BNB V1.11 candidate and official branding — preview only
- [x] Original official BNB symbol shared across picker/token badges; 201 logo checks, 20 light/dark/motion cases and fallback PASS; 32px heading preserved.
- [x] New isolated two-tier immutable-guardian candidate; 44 EVM tests including 128 seeded swaps; 15 real-bytecode LOCAL fork transactions PASS; old candidates unchanged.
- [x] Frozen artifact/ABI handoff, six HIGH static findings OPEN, fresh 9-row production dependency scan; 2,944 tests and 640 selector/3,786 nav-ad/288 RWA checks PASS; automatic build OK, standalone typecheck unverified.
- [ ] HOLD: independent auditor and re-audit, guardian/pause policy, fee/treasury, execution limits/MEV, legal/liquidity/independent RPC, dependencies, logo-use permission, physical wallets and separately authorized deployment/funded rehearsal/publication.

# BNB V1.10 custom execution audit readiness — preview only
- [x] Record OWNER_PREFERRED_ARCHITECTURE_PENDING_APPROVALS without changing BOT execution, BNB activation, fees or 0x diagnostic restrictions.
- [x] Reproduce frozen V1.6 identities; fresh six-HIGH Slither evidence, 256-case fuzz expansion and seven-transaction real-bytecode local fork PASS; no mainnet activity.
- [x] Auditor handoff, 14-risk register, launch gates, owner matrix and explicit single-pool/no-pause/donation limitations; 2,883 tests, 640 selector, 3,786 nav/ad and 288 RWA assertions PASS.
- [ ] HOLD: choose pool/pause audit scope and engage independent auditor; fee/treasury, dependencies, legal/RPC, physical wallets, deployment/canary and hosted release need separate approvals.

# Compact Swap chain selector — preview only
## BNB V1.9 contemporaneous comparison (preview only)
- [x] Fresh bounded authenticated 0x/Pancake sampler, integer fee/gas ranking safeguards; ten successes, no eligible fee-verified winner.
- [x] Evidence/report, final 2865 tests, 640 selector and 3786 nav/ad assertions PASS; no financial actions or publication.
- [ ] HOLD: independent audit, contractual fee semantics/terms/legal, owner fee/recipient/slippage, physical wallets and hosted release.

- [x] Inline picker, isolated BNB unavailable view and fresh BOT remount; preserve original vertical geometry.
- [x] 640 browser checks / 20 width-theme-motion cases and 2,590 full tests passed before V1.2; exact-heading check and final report follow below.
- [ ] HOLD: physical-wallet rejection checks and inherited financial/security/publication gates; no activation.

# BNB Swap V1.2 — read-only general route feasibility
- [x] Strict chain-scoped quote interface, deterministic freshness/context invalidation and separated AMM/aggregation/RFQ providers; no execution.
- [x] 132 genuine fixed read-only RPC calls for WBNB/USDT and XAUt/USDT, source/evidence archive; compact preview-only inspection, no live UI quote promise.
- [x] 2,633 tests and 5,306 browser assertions PASS; exact 32px heading; dated reports; automatic build OK, standalone type/hosted pipeline explicitly unverified.
- [ ] HOLD: provider permission/API budgets, RWA issuer/legal/market rules, fee approval/security, physical wallets and hosted release acceptance.

# BNB RWA V1.1 exact-pool / two-way quote gate — preview only
- [x] Two official-operator BSC endpoints matched fixed pool/code/tokens at block 134073409; 66 genuine read-only calls, 20 quoter probes, zero transactions; 28 synthetic gate tests separate from evidence.
- [x] Five bounded two-way sizes, exact-output probes, archived-not-fresh preview evidence and proposed limits; no provider/health/fee authorization inferred.
- [x] 2,586 tests; 288 quote-panel, 392 catalog, 3,786 dock and 560 placement checks PASS; automatic build OK; acceptance report records evidence and limitations.
- [ ] HOLD: issuer/proxy/transfer restrictions, sustained liquidity and reorg monitoring, legal/provider permission, fee-preserving adapter review and owner fee approval, dependency/physical-wallet/hosted-release gates; no activation/publication.

# BNB RWA discovery gate — 2026-11-17, preview only
- [x] Scope correction: existing DEX-traded assets only, exact XAUt/USDT pair snapshot and seven independent readiness thresholds; unsupported research separated from browse.
- [x] 2,558 tests, 392 real catalog checks, 3,786 fixed-dock and 560 placement checks PASS; automatic build OK. Updated report: docs/security/BNB_RWA_READINESS_GATE_20261117.md.
- [ ] HOLD: XAUt independent pool/quote/health verification, legal/provider permission, bStocks working first-party and Ondo per-asset issuer/DEX proof, separately authorized BNB security/financial acceptance; no public opening.

# Tron bridge removal and Ethereum status — preview only
- [x] Remove Tron from shared bridge choices and block stale Tron selections before wallet prompts; retain historical tracking.
- [x] Browser selector/direction checks, 34 bridge tests and automatic build passed; Ethereum configured RPC repeatedly returned HTTP 525 while an independent endpoint confirmed gateway code. Acceptance: docs/security/TRON_BRIDGE_DISABLED_20261116.md.
- [ ] Ethereum end-to-end delivery remains unverified: requires restored connection and separately authorized wallet transfer; no transactions or publication, release HOLD unchanged.

# Compact-ad Trade-button regression — preview only
- [x] RED reproduced 16px taller nav; removed ad-dependent margin override, measured creative-only hit-transparent cutout preserves unchanged raised Trade and nav.
- [x] 3,750 actual-component + 560 placement checks, 2,532 full tests and automatic build/type gate PASS; real Home OFF/ON/dismissed geometry delta 0px at 320/390/430/1280 with screenshot QA. Acceptance: docs/security/COMPACT_AD_NAV_INVARIANCE_ACCEPTANCE_20261112.md.
- [ ] HOLD: physical Samsung/wallet-browser acceptance and inherited release gates; no publication, live configuration or financial changes.

# Final compact-ad mobile polish — preview only
- [x] Slim contained artwork, measured flush nav alignment and right-border close target; preserve all placement/suppression rules.
- [x] Verify scroll/resize/reduced-motion/dismissal at 320/390/430/1280, full tests and automatic build/type gate; acceptance: docs/security/COMPACT_AD_SLIM_FLUSH_ACCEPTANCE_20261112.md.
- [ ] HOLD: physical-device acceptance and inherited release gates; no publication, live config or financial changes.

# Final banner management — preview only
- [x] Required addendum: central master plus independent actual-page placement rules, excluded sensitive routes, default-OFF new pages, page/global-scoped caps and 560 route-change browser assertions; no publication/settings writes. Acceptance: docs/security/COMPACT_AD_PAGE_MANAGER_20261112.md.
- [x] Editable mandatory disclosure, Home-only ratios and transparent backed text; preserve legacy and compact trading frames.
- [x] Default-OFF normal-flow docked placement, separate admin preview/configuration, schedules, session/cooldown dismissal and existing analytics; no settings writes.
- [x] 2,484 tests/245 files, 2,114 browser assertions; automatic build/type gate OK; acceptance: docs/security/BANNER_MANAGEMENT_ACCEPTANCE_20261112.md.
- [ ] HOLD: inherited release gates, physical-device keyboard/safe-area acceptance and owner artwork placement review; production remains unpublished and settings unchanged.

# Fixed-ratio banner correction — preview only
- [x] Shared 6:1 edited artwork frame and accurate Home/Swap/CA-BOT/Bridge previews; opt-in text controls and legacy read defaults; no settings writes.
- [x] 2,470 tests/244 files, 1,568 isolated actual-component assertions plus whole-image/control-overlap checks, 26 current live-carousel checks; 320/390/430/1280, both motion modes; automatic build OK. Acceptance: docs/security/BANNER_FRAME_ACCEPTANCE_20261111.md.
- [ ] Production remains HOLD; no settings writes, publication, activation or financial changes.

# Release-readiness gate — preview only
- [x] Fresh dependency audit: 12 original advisory rows cleared, 1 high Zod/WalletConnect remains; all-scope dev minimatch moderate/deepmerge low recorded, no suppressions.
- [x] Fresh available hosted scans + independent deeper source audit; claim timeout/freshness/review and public GET write paths corrected; platform deep engines remain unavailable/stale.
- [x] 2,464 tests/243 files; 166 focused; disposable identity/Adventure checks; 26 banner checks plus actual-card isolated read/review at 320/390/430/1280; automatic build OK. Acceptance: docs/security/RELEASE_READINESS_GATE_20261110.md.
- [ ] HOLD: compatible wallet dependency patch, fresh platform deep engines, physical-wallet acceptance, cross-worker discovery budget and final hosted pipeline remain external/unverified gates; no production publication, activation or financial authorization.

# Mobile banner correction — preview only
- [x] Tiny internal dots and translucent 24px pause control; 26 live-preview navigation/swipe/pause/reduced-motion checks at 320/390/430/1280 PASS; 2,456 tests/242 files PASS; automatic build/type gate OK. Artwork, intervals, analytics, admin settings and draft privacy unchanged.
- [ ] Production remains HOLD; no publication or feature/economic changes authorized.

# Growth Integration V1 — preview only
- [x] Refined existing verified receipts, canonical next actions, recipient-reviewed claims and referral sharing; no execution or economic changes.
- [x] Restricted Adventure entry/content to successful existing gated preview reads; cosmetic presentation only.
- [x] Three privacy-safe registered events; 2,456 tests/242 files PASS, automatic build/type gate OK, 320/390/430/1280 reduced-motion checks; acceptance: docs/security/GROWTH_INTEGRATION_V1_20261110.md.
- [ ] Release HOLD: 2 high/11 moderate advisories, stale deep scans and real-wallet sign-in/financial acceptance remain unresolved; no publication/activation authorized.

# Adventure — safe non-chance-based build
- [x] Default-OFF static catalog, locked canonical evidence, single-use timed quizzes, 3-action daily / 5-type weekly cosmetic badges; no XP balance or economic writes. Migrations 0062–0064 applied; zero live config/completion/challenge rows.
- [x] Compact shared Home/Earn entry, accessible Adventure page and audited Super Admin-only preview toggle/cooldown; no public activation path. Static copy/order/targets deliberately retained for this held release.
- [x] 2,448 tests/241 files; isolated eight-way sync, replay/referral/duplicate/threshold/grant checks and real isolated SQL-backed quiz→badge UI at 320/390/430/1280 reduced-motion PASS; signed-in live OFF gate and automatic build/type gate PASS.
- [ ] Production remains HOLD/OFF: 2 high and 11 moderate dependency advisories, stale deep scans and real-wallet sign-in acceptance unresolved; no unrelated held features published. Full live quest flow intentionally not enabled; tested against disposable database only.

# Identity and promotions — 2026-11-10
- [x] Same-release follow-up: invalid UUID fixture corrected without validator changes; 2,430 tests/239 files pass, disposable identity races and banner rollback pass, signed-in admin/access negatives and 320/390/430/1280 reduced-motion crop checks pass; automatic build/type gate OK.
- [x] Permanent identity/recovery verified: live 0059/0060 readback, 27 compatible pairs, no duplicates/grants; additive 0061 revokes default public privileges only. No identity, recipient or financial changes.
- [x] Promotions extended and corrected: public draft transport filtered, malformed JPEG rejected, mobile-only upload rendered; old banner/settings fingerprints unchanged.
- [ ] Production publication HOLD: dependency scan has 2 high/11 moderate advisory rows, deep code scan stale, real wallet-sign-in acceptance unavailable. Existing production snapshot not republished; see docs/security/IDENTITY_PROMOTIONS_FOLLOWUP_20261110.md. No new owner decisions requested.
- [x] Wheel remains plan-only; no wheel code or activation in this follow-up.

# Wallet sign-in incident — 2026-11-09
- [x] Correct selected-provider signing, UTF-8 hex transport and single session exchange; 2,406 tests and preview build pass. 390px simulated wallet cancellation checked; real user-wallet sign-in remains unverified, production publication not requested.

# Owner-approved legacy carryover completion — 2026-11-08
- [x] Fix authenticated canonical staging/confirmation and immutable V1/V2 payment fences.
- [x] Integrate approved partial legacy sources, separate goodwill budget and manual publisher lifecycle.
- [x] Add Super Admin snapshot approval and default-OFF automatic funded verified queue.
- [x] Full suite: 2,368 tests, 25 hostile EVM tests, isolated eight-way approval race and existing V2 concurrency checks pass; automatic build/typecheck OK; backend scan has no new findings. 390px signed-in wallet-required gate has no overflow.
- [ ] Connected bound-wallet Super Admin carryover approval-screen acceptance: wallet connection unavailable in sandbox; no financial confirmation authorized. Publication withheld.

# V37 — Continuous Points, Operator-Approved Claiming

# Bridge destination safety
- [x] Current-wallet default, explicit edit/paste and restore controls, full alternate-address/network warning and address-specific acknowledgement; 156 bridge tests and isolated review interactions at 320/390/430/1280 pass, preview build OK. No financial actions or publication; live connected-wallet transfer not exercised.

# Rewards Vault V2
- [x] Deployment acceptance: frozen 11-source deterministic bundle, 25 hostile EVM tests, 2,293 full tests, isolated DB races, both RPC/token reads, live Mainnet 2-of-3 governance and authenticated 320/390/430/1280 disabled Ops PASS; no financial writes. Current-source assurance gaps and Testnet missing admin/signer authorization recorded in RELEASE_ACCEPTANCE.md; publication withheld because clean-release condition is unmet.
- [x] Four V2 software blockers fixed: enforced frozen runtime/token/Safe/publisher identity, no cancellation from nonce nonvisibility, verified candidate-hash journal, keyset-paged candidate reconciliation with continuation. 2,327 tests, 25 hostile EVM, isolated DB races, typecheck, bundle parity, signed-in 320/390/430 disabled pages PASS; no financial actions.
- [ ] Testnet acceptance: requires a verified Testnet multisig and explicit Vault-specific signer authorization (owner).
- [x] Optional Claim FLOW / Claim & Stake Flexible: canonical live checks, sequential receipt verification, nonce-backed durable recovery, mocked adversarial tests and signed-in disabled 320/390/430/1280 preview; no financial activation or publication. Unknown broadcasts remain blocked pending exact receipt reconciliation; live financial acceptance requires authorized deployment.
- [x] Non-upgradeable contract, exact compiled ABI, local adversarial/EVM tests and unsigned deployment instructions; 100-recipient execution 5,659,147 gas.
- [x] Installed disabled post-cutover routing, canonical funded source RPC, bounded allocator, global V1 approval/batch/publication fences, atomic reservation and exact receipt ingestion; readback confirms zero config, destination, allocation, batch and credit rows. No historical mapping.
- [x] Ops new-award cutover review, authenticated future cutover/prepare/credit verification commands, runtime-gated user panel and adversarial tests: 2,224 full tests, 66 focused tests, isolated 8-way reservations/6-way confirmations/V1 concurrency checks, automatic typecheck/build OK, signed-in 320/390/430/1280 Rewards/Earn and bound Super Admin review PASS.
- [x] V2 publisher signing controls: service-only durable intent before one wallet popup, immutable payload/simulation, immediate hash journal, nonce/hash recovery without resend, original bound publisher authorization, confirmed ingestion and compact Ops card. 2,289 full tests / 131 focused tests, isolated 8-way signing/reservation and 6-way confirmation races, automatic build/typecheck and signed-in bound-wallet 320/390/430/1280 disabled Ops PASS; no new actionable security findings. Zero live config/batches/attempts/credits, no deployment, signature, activation, financial writes or publication. Active financial wallet acceptance remains unavailable without separately authorized deployment.
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

## BNB V1.3 (2026-11-17)
- [x] Sustained read-only observer, token safety facts, provider matrix, architecture proposal, acceptance report
- [ ] HOLD: archive history, source/legal token review, provider access, fee approval/audit, RWA legal, physical wallet

## BNB V1.4 (pre-deployment safety candidate)
- [x] Native BNB/WBNB + Pancake V3 read-only mainnet simulation (block 134108781)
- [x] Verified-source token review (USDT, WBNB candidate-eligible; XAUt blocked)
- [x] Local adapter candidate + 25 adversarial tests + fence, owner decision sheet
- [ ] HOLD: audit, owner fee/recipient/provider decision, funded rehearsal, provider access, legal, physical wallet

## BNB V1.5 (security hardening)
- [x] V1.5 candidate (fee-in-WBNB fix F-1), 35 adversarial/fuzz tests, Slither triage, live read-only simulation + gas estimate, report
- [ ] HOLD: professional audit, compiler bump, owner fee/recipient/provider/slippage, rehearsal, legal, physical wallet

## BNB V1.6 (compiler hardening + validation)
- [x] V1.6 candidate (V1.5 logic, solc 0.8.38/cancun), 42 local tests, Slither rerun + per-warning traces, read-only simulation + opcode probe, fresh full suite, report
- [ ] Independent professional audit, owner fee/recipient/slippage decisions, deployment — blocked on owner authorization (HOLD)

## BNB V1.7 economics
- [x] Read-only economics sampler, provider matrix, owner sheet, report
- [x] 0x authenticated indicative prices — saved key verified on 2026-11-18; all ten size/direction combinations observed successfully, including two separately recorded retries; trading remains disabled.
- [ ] Independent audit — blocked: owner engagement

## BNB V1.8 saved-key verification (2026-11-18)
- [x] Real read-only 0x comparison, authenticated admin endpoint HTTP 200/no-store/non-executable, and 101 targeted tests passed.
- [ ] HOLD: contemporaneous provider economics, terms/legal, independent audit, owner fee/recipient/slippage authorization and physical-wallet acceptance; no activation or publication.

# BNB Swap owner publication embargo
- [x] Source-locked embargo, selective Trade removal and state normalization; preserve AutoTrade, BOT, bridge, MultiSend.
- [x] Retire BNB Swap vendor endpoint; enforce source and shipping-bundle release firewall with mutation tests.
- [x] Private reversible archive, frozen identity checks and restoration requirements.
- [x] Unit/full tests, responsive browser checks, published-site observation and automated build signals; final verification evidence and commit recorded in the pause archive. Hosted release/CI enforcement and real devices are explicitly unverified; no publication authorized.

## AutoTrade operational readiness from e2e8f2c4
- [x] Connect separate live durable intent/nonce/effect storage to managed transport and worker dispatch; source gate remains OFF.
- [x] Prove store/transport crash recovery and negative authorization with mock broker and local fork; 3,793 full tests and 37 final worker/firewall checks pass, automated typecheck/build OK.
- [x] Inspect actual published assets against preview and supported release options; authenticated published manual worker succeeds, but isolated release/source attestation and bound-wallet acceptance block publish/resume 334.
- [ ] Restricted publish and schedule 334 recovery — blocked by verified deployed source/server artifact, isolated whole-release review, bound-wallet Ops acceptance and managed scheduler deadline verification.
- [x] Expose Ops readiness and secure infrastructure setup; report exact external blockers and observed worker status.

## AutoTrade V1.4 canary preparation
- [x] Record owner 5 USDT APPROVED_CAP_ONLY, separate gas and order authorization.
- [x] Add read-only cap/gas preparation and source-locked managed transport boundary.
- [x] Verify transport regressions, fork/mock recovery, release firewall and fresh review; exact production artifact and bound-wallet acceptance remain unverified.
- [ ] Restricted publication and scheduler recovery — blocked by verified production diff and bound-wallet Ops acceptance.
- [ ] Live canary — blocked by independent RPC, provisioned managed signer/dedicated account, human security review, gas approval and exact order authorization.

## V1.4 bounded gas and first-order review
- [x] Exact local four-effect gas simulation, bounded contingency and fresh conversion evidence.
- [x] Non-executable order ticket with owner-entered prices, expiry, slippage and total exposure.
- [x] Focused/fork regression, current release/worker status and secure next-step report; full regression evidence added after completion.
- [ ] Exact dedicated-account gas/order confirmation — blocked by unprovisioned signer/account, independent RPC and owner-entered targets; no funding or live approval inferred.

## Urgent AutoTrade paper form defect (2026-11-28)
- [x] Diagnose deployed artifact, production 403 attempts, off-screen error reproduction, legitimate owner gate and existing persistence schema without bypassing RBAC.
- [x] Fix submission feedback, duplicate prevention, units/reference/review and mobile accessibility.
- [x] Verify exact screenshot inputs, failure/success mocks, 390/1280 browser checks, 3,819 full regressions and release holds.
- [ ] Real authorized paper creation — blocked by a legitimately connected bound-wallet actor; owner session alone returns 403 and no role/header/provider bypass was used.
- [ ] Production publication — blocked unless existing isolated-release and human-security conditions pass.
