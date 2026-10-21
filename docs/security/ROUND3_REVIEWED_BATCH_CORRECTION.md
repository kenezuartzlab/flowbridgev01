# Round #3 reviewed-batch correction — 2026-10-21

## Decision: FAIL for release and publisher readiness

No production deployment, batch mutation, replacement, funding, signature or broadcast was performed.

## Root cause
The rebuilt settlement fingerprint includes the current hour and live inputs. Persistence used ignoreDuplicates on chain/distributor/epoch/root and retained the original fingerprint. The publisher API queried by the rebuilt fingerprint and therefore did not find the unchanged stored batch. It was not caused by missing allocation or an expired auth token.

A second, independent blocker exists: the stored window is **2026-10-20 16:00 UTC → 2026-11-19 16:00 UTC**, not the later preview window. Live contract read at block timestamp 1792550024 returned minPublishDelay **86400 seconds** and epochCount **2**. Stored claimStart 1792512000 is already past; re-review cannot make publication valid. The requested prohibition on replacement is respected.

## Correction in preview
- Fresh funded eligibility is compared with the stored root, total, recipients and proofs. Existing identity, fingerprint and claim window are retained without upsert.
- The original schedule is checked against live contract time and delay. Invalid schedules return BLOCKED and no transaction.
- Server acquisition checks exact stored calldata, network, target and zero value, and performs exact eth_call before acquiring a lock for otherwise valid batches.
- UI clears review on wallet/snapshot/readiness changes, disables submission when unresolved, and explains the precise expired-window blocker instead of showing a valid-looking confirmation.
- Existing cancellation, nonce fencing, recovery after epoch advance and confirmation audit paths remain intact.

## Verified evidence
- Authorized account with its actual bound wallet read Ops successfully (HTTP 200); no write endpoint used. Settlement **1 wallet / 1,122 FLOW**, status BLOCKED solely by STORED_CLAIM_WINDOW. Stored root/amount/window unchanged; separate **74 unfunded Points excluded**; attempts **0**, live rounds **2**, automatic signing OFF.
- Actual publisher panel rendered from that authenticated report at 390px and 1280px; no overflow, Review & Publish disabled, wallet submission controls absent. This was panel rendering, not a complete wallet-connected production UI flow.
- 1,857 tests / 175 files passed before the additional exact-payload mismatch test. Automatic compilation: build OK 2026-10-21T02:34:32Z. Final rerun is recorded in command output.
- Available backend security scan: no new active findings. Existing owner exception remains scoped to missing Wiz/cloud-IAM coverage only.
- Dependency audit FAIL: full graph 2 high / 5 moderate / 1 low; production graph 1 high / 3 moderate / 1 low. New dependency advisories are not covered by the owner's cloud assessment exception. No security pass claimed.
- Fresh eight-client database concurrency and physical TokenPocket acceptance were not run in this correction; existing recovery regressions passed, but do not replace those gates.

## Existing production fingerprint (not a new release)
Read-only fetch returned `/assets/ops-CYt8032L.js` HTTP 200; SHA-256 `8233d76ba84ac272f59be2748547e34a14e0622717d7e6293d661b570506f0f8`.
No new deployed bundle is claimed.

## Next required authority
The existing immutable schedule cannot be published under current contract rules. A separately authorized replacement/schedule workflow is required, but explicitly prohibited in this task; no approval was fabricated and no replacement was created. Dependency security remediation and remaining concurrency/production checks are also required before release.