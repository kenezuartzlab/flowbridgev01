# V36.10.1 publisher lock acceptance — release held

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
- End-to-end wallet-prompt cancellation/retry/recovery UI acceptance using mocked transaction service, including refresh/disconnect and eventual confirmation.
- Current local-fork recovery acceptance (isolated database and mocked receipt tests are not a chain fork).
- Physical TokenPocket signing acceptance is unavailable and no real signing is authorized.
- Production publication and independent served-release verification are intentionally **not performed** while these mandatory gates remain open.

No payout was signed/published, no FLOW moved, no budget transaction repeated, no contract or historical hold changed.