# Legacy carryover acceptance — 2026-11-08

Implemented canonical Super Admin staging/confirmation, immutable separately tagged goodwill budget, global V1/V2 fences, canonical partial award preparation, manual publisher integration and explicitly gated prepare-only scheduler path. No live staging, financial confirmation, reservation, credit, transfer, signature, activation or scheduler change was performed.

## Authoritative read-only review
- Verified unpaid: 1,473 FLOW / 24 sources.
- Goodwill candidates: 1,325 FLOW / 30 sources.
- Total creditable: 2,798 FLOW / 54 sources / 11 bound wallets.
- Needs identity: 200 FLOW / 2 sources.
- V1 paid/committed excluded: 2,423 FLOW / 24 sources.
- Already V2 excluded: 689 FLOW / 9 sources.
- Non-economic/unsupported excluded: 3,986 points / 59 sources.

The earlier 3,198 FLOW / 14-wallet estimate is not the canonical snapshot. Identity and duplicate/source validation exclude additional amounts; it must not be approved as an exact payout. No profile-only totals authorize credit. Reports return aggregate fields only.

All four V1 on-chain roots, allocations and leaf proofs reproduce; unpublished alternate drafts are not mistaken for canonical rounds. Renewed windows do not change economic commitments.

## Live Vault
BOT Mainnet 677, block 29,542,463: vault 0x91f70c91b4273d0129abc3f14373fbb10ca59006; code hash 0xdc9d2b315367b7a56fb3b9f4115ff81f8e954797caadad8d61e77399a16a75b1. Frozen identity/canonical FLOW checks pass. Owner 0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD; publisher 0x971E7790FE6C8F77dc666Bb05D4aedA362653f94. Unpaused; balance/free 1,010,000 FLOW; liabilities zero; batch/day 10,000 FLOW; 100 recipients is a count, not a FLOW-per-wallet cap. Carryover queue OFF, no confirmed snapshot, no pending V2 batches. Existing live financial configuration was not changed.

## Checks
2,368 tests / 231 files pass, including 25 hostile EVM tests; isolated SQL tests pass (eight-way single snapshot confirmation, immutable source/budget, partial V1 allocation and original V2 concurrency/signing/receipt tests). Automatic build/typecheck OK. Backend scan has no new findings; unrelated user-ignored findings unchanged.
390px signed-in Ops wallet-required gate renders without overflow. Full bound-wallet approval-screen acceptance unavailable; no simulated approval is represented as live acceptance. Publication withheld.

## Remaining authorized financial sequence
Connect the bound Super Admin wallet, refresh canonical review, stage its exact current hash, explicitly approve verified amount plus separate OWNER_GOODWILL budget and prepare-only queue. Fresh confirmation requires full free backing after pending reservations and reverified V1/V2 evidence. Current read shows enough vault backing for 2,798 FLOW; additional funding is not indicated by this snapshot. Future CORE_SWAP awards still require independently verified program backing/reservations. Prepare immutable batches (100 recipients maximum, live 10,000 FLOW caps), then the bound publisher manually signs each; credits become claimable only after exact canonical successful receipt ingestion. No new role or signature authorization was exercised here.
