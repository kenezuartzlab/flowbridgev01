# V36.11 release acceptance

Recorded 2026-10-22, after the 07:28 UTC acceptance run. Status: HOLD / production acceptance NOT PASS. No V36.11 deployment or production fingerprint exists.

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