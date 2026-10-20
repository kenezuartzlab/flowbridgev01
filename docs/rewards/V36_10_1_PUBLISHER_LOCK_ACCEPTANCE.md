# V36.10.1 publisher lock acceptance — release held (2026-10-20)

## Root cause
The epoch lock was inserted before the wallet request, but rejection was only displayed locally. No durable cancellation or safe-retry transition existed, so an unsent attempt permanently blocked the batch. Refresh restored all unresolved attempts, not just the current epoch.

## Changes
- Durable operation generation and atomic single-winner acquisition retain the existing epoch lock.
- Cancellation requires an explicit provider rejection, operation ownership, no hash, unchanged publisher nonce and unpublished epoch. Cancelled retries retain the exact sender, nonce and calldata: even a delayed old wallet request cannot publish a second transaction at another nonce.
- Timeout, disconnect, unknown close or invalid hash stays recovery-required. No expiration or automatic resend.
- Exact canonical reverted receipts can become retry-safe only after nonce and epoch reconciliation. Unrelated reverted transactions do not unlock.
- Re-check and recovery are read-only on chain. Unknown hashes can be searched by recorded publisher nonce in a bounded 256-block window; no result means uncertainty, not failure.
- Stale operation IDs and replacement hashes are rejected. Audit transitions are atomic and idempotent. Automatic signing and funding stay OFF.

## Verified
- Full regression: **1,826 tests / 169 files passed**.
- Automatic build/type validation: **build OK**, 2026-10-19 16:09:30 UTC.
- Isolated PostgreSQL with exact migration functions: eight parallel initial/retry acquisitions produce one winner; stale generations rejected; cancelled nonce/payload drift rejected; pending operations locked; cancellation audit written once; reverted retry allowed; published batches immutable.
- Signed-in owner with non-signing simulated bound wallet: Control Center and real publisher panel render at 320/390/430/1280px without horizontal overflow.
- Real ledger read: Round #3 has one wallet / **1,122 FLOW**, every proof verified, authorized eth_call simulation PASS; historical rounds remain claimed; no publication attempt created.
- Fresh available security scan: no new findings; external connector scanner unavailable.

## Mandatory gates still open
- Security release gate: fresh dependency scan reports a critical proxy-addr advisory through the existing MCP dependency and multiple high advisories. Exploitability/remediation is not established; no dependency changes or dismissals were made. The fresh backend scan has no new findings, but the external connector scanner remains unavailable. A clean comprehensive security PASS cannot be reported.
- Full signed-in Control Center page layout check remained loading in this run; isolated actual publisher panel layout passed. Do not substitute the panel screenshots for full-page acceptance.
- Physical TokenPocket signing acceptance is unavailable and no real signing is authorized; simulated provider tests are not physical-device acceptance.
- Hotfix publication and independent verification of a newly deployed release were **not performed**, because required security/full-page checks have not passed.

## Final acceptance run
- Actual publisher panel, signed-in browser, simulated transaction service: explicit 4001 and nested ACTION_REJECTED cancellation clear pending state; server-restored cancellation exposes Retry Publication; operator can retry without database editing. Disconnect 4900, provider timeout, unknown close and invalid returned hash remain locked after panel remount/storage recovery. Pending re-check and eventual recovery never add a wallet request. Exact reconciled revert exposes retry. These UI services were mocked; database/API/fork checks below were separate integrations, not one combined production-wallet flow.
- Private loopback BOT Mainnet fork, chain 677: delayed transaction has no receipt and advances pending nonce; after mining, exact sender nonce/calldata/root/1,122 FLOW/window/event/canonical receipt match. An exact call with an invalid window reverts, consumes the nonce, leaves epochCount at 2 and reconciles latest/pending nonce. Snapshot restored; old rounds remain claimed. No production transport received a send request.
- Exact migration functions in disposable PostgreSQL: eight initial and eight cancelled-retry acquisitions each yield one winner; stale generation, nonce/payload drift and pending retries rejected. Eight recovered-hash confirmations yield one true/seven false results and exactly one PUBLISH_CONFIRMED_VERIFIED audit. Published batch immutable.
- Added API tests for conclusive cancellation, disconnect/timeout lock retention, advanced nonce, hash-present cancellation, wrong recorded nonce, recovered confirmation and exact-revert reconciliation. Verification now checks recorded nonce before attaching/confirming a hash.
- Full regression: **1,834 tests / 170 files PASS**. Automatic build/type validation: **build OK**, 2026-10-20 01:05:21 UTC. Actual publisher review panel at 320/390/430/1280px: no horizontal overflow; screenshots inspected. Full Ops page check is not PASS in this run.
- Fresh signed-in ledger read: **Round #3 / one eligible wallet / proposed 1,122 FLOW**; simulation PASS, all root proof checks PASS; on-chain epochCount **2**, no publication attempt, autonomous signing **false**. Any later signature requires another fresh revalidation.
- Current production (not this new hotfix): `/assets/ops-C30r3sDO.js`, SHA-256 `e3c37e03b9b68a543441a2ab427652695d27ab458d5bc47890e2de3653387808`. Downloaded independently from flowbridge.space; this proves the currently served bundle only, not a new deployment.

Final result: recovery mechanics PASS in the bounded simulated/local checks; **release FAIL / HELD** pending security and full-page acceptance. Publisher candidate ready for review only; no production signature authorized.

No payout was signed/published, no FLOW moved, no budget transaction repeated, no contract or historical hold changed.