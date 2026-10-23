# V36.11 release acceptance

## Final remediation checkpoint — 2026-10-23 16:48:34 UTC

**HOLD — not deployed. No production release fingerprint is claimed.**

### Implemented corrections
- Client transaction amounts/directions no longer supply reward valuation. The Core Swap writer independently checks bound-wallet Mainnet canonical receipts/events and server pricing; ingestion verifies chain 677, success, finality, canonical block and reorg consistency. Fake/missing evidence earns zero, with authoritative event deduplication and database-serialized verified daily caps.
- Historical Core Swap provenance defaults to PENDING. Funding preparation, funding confirmation and publication guards exclude unresolved provenance; settlement intersects funded reservations with individually eligible ledger IDs rather than substituting aggregate balances. Discretionary adjustment evidence labels do not authorize payouts.
- Proposal submission and votes require server-validated authentication. Atomic account/proposal voting prevents replay; public browsing remains unchanged and public authorship does not disclose account identity.
- Site settings require the super-admin gate and audited old/new-value writes. Unknown roles fail closed. Existing sensitive fee/reward terms cannot be changed directly through the ordinary settings writer.
- Wallet-binding errors are generic and no longer return another account's email or full profile.
- Shared proposal limits enforce title/category 100 characters and 400 UTF-8 bytes, body 1,000 characters and 4,000 bytes, and 8 KiB request maximum before parsing/writes. Frontend uses the same policy.

### Historical integrity audit (aggregate only)
- Read-only supplied evidence sample: 45 positive awards / 5,983 Points. Canonical BOT Mainnet receipts matched 35 awards / 2,197 Points: 1,057 funded and 1,140 unfunded. The 10 non-Mainnet awards / 3,786 Points are not Mainnet proof. No false Mainnet receipts were established in this sample.
- Historical price provenance was absent for all 45 supplied awards. Stored USD was preserved, not independently re-priced. Complete historical price verification and per-account daily-cap audit remain unresolved; receipt matching alone is not financial provenance approval.
- Broader ledger quarantine read: 16 funded positive Core Swap rows / 1,057 Points and 52 unfunded rows / 4,926 Points remain PENDING. The supplied sample is not the complete ledger.
- Round #3's 1,022 recorded Core Swap Points remain unapproved provenance; no VERIFIED attribution was established. Existing Round #3 batch remains 1 wallet / 1,122 FLOW, unchanged, unsigned and unpublished. Previously confirmed claims were neither reversed nor deleted. Published rounds 1 and 2 remain intact; other batch-level suspect attribution has not been established and is not represented as verified.

### Fresh verification
- Full regression: **1,918 tests / 186 files PASS** at 16:47 UTC. Includes client-value forgery, missing evidence, wrong-chain, minimum, replay, funding quarantine, authenticated/unauthenticated proposals, settings privileges, wallet privacy and existing publisher recovery tests.
- Complete Bun dependency audit: no vulnerabilities in 872 packages; production advisory scan: no vulnerabilities in 70 dependencies.
- Latest observed automatic build: **build OK 2026-10-23T16:46:46Z**. A separate hosted production-mode report remains unavailable; no manually run production build is claimed.
- Authorized fresh payout API read returned 200: stored allocation 1,122 FLOW / one wallet; current eligible preview **0 FLOW / zero qualified wallets**; status BLOCKED, transaction absent, renewal not ready, live epoch count 2. Aggregate excluded Mainnet Core Swap provenance: 2,197 Points, not the Round #3 amount. Signed-in Ops opened with no page errors, but without a connected physical wallet the integrated panel acceptance remains incomplete.
- Quick security scan completed with no new active findings; previously user-dismissed findings were not reopened. Cloud assessment skipped because the connector is unavailable. Deep scan requested and running; it scans the last saved project state, so final same-turn edits require completed coverage before release.

### Outstanding mandatory gates
1. Complete historical price/provenance review for Round #3; payout readiness remains HOLD independently of software release.
2. Verify legacy private bearer-link revocation without disrupting the last verified release.
3. Securely pair the existing hourly scheduler with private authentication and verify actual readiness alerts/reconciliation; public publishable credentials are not sufficient.
4. Completed deep security coverage and V36.11-specific cloud/permissions assessment or explicitly scoped owner acceptance. No previous exception inherited.
5. Physical TokenPocket and full wallet-connected payout/renewal acceptance; fresh isolated database concurrency against final guards, final hosted production build, deployment and authenticated production bundle/fingerprint verification.

No funding, allocation/schedule replacement, signature, publication, restricted-point release, contract change or treasury movement occurred. Automatic funding/signing remain OFF. The 74 unfunded and 776 restricted Points stay excluded.

Recorded 2026-10-22, after the 07:28 UTC acceptance run. Status: HOLD / production acceptance NOT PASS. No V36.11 deployment or production fingerprint exists.

## 2026-10-23 security remediation acceptance (04:13 UTC)
- Production release remains HOLD; no publish call, production signature, payout publication, funding, contract change or treasury movement occurred.
- Wallet messages now require same-origin, same-window, injected provider presence and expected action structure. Repeated hints are coalesced and trigger refresh only when provider state actually changes. EVM provider transport is unchanged.
- Public wallet lookup is retired with an identical non-identifying response and no profile read. Passive injected-wallet detection reads only eth_accounts; signed-in binding checks read the caller's own profile. Explicit proof sign-in and Verify & Bind remain available.
- Canonical and compact TokenPocket sign-in messages now bind domain/origin, wallet, nonce and issued time. Nonce consumption is conditional/single-winner and errors fail closed before session issuance; no account email is returned by verification.
- Owner confirmed the ad-hoc request-limit tradeoff on 2026-10-23. Migration 0026 applied and schema verified; service-only atomic limits are 10 per wallet and 600 shared requests per minute. Only expiring HMAC counters are stored; no raw IP or wallet. Internal credential generated securely, never exposed. Disposable PostgreSQL: 32 same-wallet concurrent requests give 10 successes; 601 distinct-wallet requests give 600 successes; aging 61 seconds resets the window.
- Private materials catalogue no longer mints signed storage links. Both admin download interfaces fetch files through the current admin gate with private/no-store caching. Anonymous download/list denied (401), wrong-wallet denied (403), authorized real PDF download succeeds. Mock revocation test confirms a previously authorized operator cannot download again after access is removed. Previously issued seven-day bearer URLs have NOT been revoked; changing the new code cannot invalidate them. Object relocation is deferred because the last verified release still uses current paths; deletion/cache propagation and already-delivered copies must not be misrepresented as immediate revocation.
- Final regression: 1,894 tests / 183 files PASS. Automatic compilation/type gate recovered from a sibling private-download type mismatch; latest observed build OK 2026-10-23T04:11:19Z. No separate final hosted production-mode/type report or deployment fingerprint is claimed.
- Fresh exact 0021–0025 migration functions on synthetic loopback PostgreSQL: eight initial/retry acquires produce one winner; stale generation rejected; pending locked; cancellation audit idempotent; exact revert safely retryable; published batch immutable. Eight renewal approvals create one audit and preserve base allocation/window; repeat renewal supersedes overlay; stale fingerprint/calldata rejected; eight interrupted-session confirmations create one system audit even with original operator disabled. No managed records were used as fixtures.
- Simulated browser publisher acceptance: rejection/nested rejection, disconnect, timeout, closed browser, invalid hash, refresh restoration, pending/delayed confirmation, one audit/no resend, reconciled revert and 320/390/430/1280 layouts PASS. This is not physical TokenPocket acceptance or production transaction acceptance.
- Authenticated fresh real payout read/component: stored and funded candidate 1,122 FLOW / one wallet; schedule renewal required and wallet submission absent; 390/1280 layouts have no overflow/page errors. Live epochCount remains 2; stored draft #3 is not a third published round. Zero attempts and zero renewal rows. Separate 74-point unfunded award remains excluded; reviewed 776 category and broader 1,339 historical total remain excluded. Current earned-but-unfunded candidate difference is 290 Points; amount is freshly read, never frozen to an older aggregate.
- Quick security scan 2026-10-23T04:09:14Z: no new active findings; previously user-dismissed findings unchanged. Wiz/cloud assessment skipped (no connector); V36.10.2 exception does not cover V36.11. Full and production Bun dependency audits again fail registry HTTP 404; no dependency PASS claimed.
- Supported database read now confirms existing hourly rewards-ops-sweep at minute 7, with recent production runs through 03:07 UTC. Its callback uses the public publishable key, NOT the V36.11 private sweep credential. New V36.11 sweep therefore must remain unauthorized until a server-only shared credential and scheduler are configured together. Do not duplicate the existing cron or treat legacy successful runs as V36.11 guarded-sweep/alert acceptance. Existing exceptions table was empty despite the expired schedule. New sweep checks alert/run persistence and rejects failures instead of silently reporting success.

### Genuine remaining V36.11 release blockers
1. Revoke/verify legacy bearer-file access without breaking the held production release; new gated access is verified, old links are not.
2. Configure the existing scheduler with the private sweep credential and verify V36.11 run records, actionable operator alerts and interrupted-publication reconciliation. Current public-key callback cannot authorize V36.11 audit writes.
3. Fresh completed deep application scan and complete dependency audit; registry 404 persists.
4. V36.11-specific cloud/permissions assessment or explicit scoped security-owner acceptance, never inherited.
5. Physical supported TokenPocket and complete integrated Ops acceptance; final hosted production/type evidence and, only after gates pass, deploy and verify production bundle/fingerprint.
Round #3 schedule approval remains a separate financial action, not a prerequisite to safely holding the release and not authorized by this remediation.

## Verified
- Full regression: 1,873 tests, 177 files PASS after final functional edits. Automatic build log: build OK at 07:25:57 UTC. Final separate type-validation evidence remains unavailable; older pre-migration type errors are not treated as a current PASS.
- Disposable loopback PostgreSQL: eight initial/retry acquisitions yield one winner; pending/uncertain attempts stay fenced; cancelled/exact-reverted retries are guarded; published batch immutable. Eight schedule approvals yield one approval/audit; repeat renewal supersedes the previous overlay without changing the base batch. Stale fingerprint/calldata rejected. Eight interrupted-session confirmations yield one atomic system audit, even with the original operator disabled. A rerun initially failed because the disposable fixture was already consumed; clean fixture reset and rerun PASS. No managed financial records were reset.
- Authenticated real payout API read and Payout Operations component at 1280/390 pixels: 1,122 FLOW, one qualified wallet, schedule needs renewal, no wallet submission control, no horizontal overflow or page errors. This is component acceptance, not a complete connected physical-wallet/integrated production acceptance.
- Source-only independent safety review found no critical blockers in migration 0025 and matching renewal/acquisition/recovery paths.
- Fresh quick security scan at 07:26:37 UTC: no new findings; existing user-dismissed findings unchanged. Cloud assessment skipped because no connector configured. Deep scan started after functional edits; results pending, not claimed PASS.
- Production dependency scanner: two moderate esbuild advisory paths; full Bun audit returns registry HTTP 404. No fresh full dependency PASS claimed, no blanket override or suppression applied.

## Round #3 read-only reconciliation
- Original batch ID: d45a18df-94e5-43b0-a3e8-34b5b1614f31; one leaf; 1,122 FLOW; root 0x900d6d388a7fac2db334aeb9c8ab38279e17e2b4f1c928aa3fb1101b8fda7de9.
- Stored window: 2026-10-20 16:00 UTC to 2026-11-19 16:00 UTC. Live distributor minimum delay: 86,400 seconds. Original schedule can no longer meet publication delay.
- Unapproved calculated renewal at verification: 2026-10-23 10:00 UTC to 2026-11-22 10:00 UTC; sign-before 2026-10-22 10:00 UTC; fingerprint 0x485108de7a1408feb1539b039b6a89b289800889bd02925ecb3ed4106e823839. Proposal dates must be refreshed before authorization; unchanged allocation/root/proofs are mandatory. Original batch and reservation evidence remain authoritative. No proposal/approval row committed.
- The separately referenced 74-point Core Swap award remains UNFUNDED without reservation; another distinct 74-point award is funded and is not the excluded award. Current candidate's aggregate earned-but-unfunded difference is 180 Points, not solely that 74.
- Reviewed-account Mainnet CORE_SWAP_V2 category totals exactly 776 Points, all UNFUNDED with zero reservations. Broader historical restricted presentation totals 1,339 Points; these are different scopes, not contradictory payouts. Both remain excluded.
- Two previously published on-chain rounds preserved; zero publication attempts, zero schedule renewal records at verification; automatic funding and signing OFF. No signature, payout publication, funding, FLOW movement, contract or policy change.

## Remaining gates and blockers
- Configure a server-only sweep credential and authenticated scheduler, then verify scheduled recovery and operator alerts. Invalid sweep bearer is rejected with 401. Scheduler listing through current SQL credentials is permission-denied, so scheduler presence is unverified, not inferred absent.
- Complete full integrated Ops/real supported wallet acceptance without unauthorized financial actions.
- Obtain fresh complete dependency/security results and V36.11-scoped cloud assessment coverage or explicitly scoped owner risk acceptance. V36.10.2 exception expires 2026-11-20 and explicitly does not authorize a later release; never silently transfer it.
- Final hosted production build/type validation, release deployment, bundle fingerprint and authenticated production acceptance remain pending. Keep last verified frontend deployment unchanged while gates are incomplete. Backend migrations 0024/0025 have been applied; they are not a completed frontend release.
- Round #3 schedule approval is a separate financial-terms authorization through the audited super-admin action, not implied by development or release authorization.