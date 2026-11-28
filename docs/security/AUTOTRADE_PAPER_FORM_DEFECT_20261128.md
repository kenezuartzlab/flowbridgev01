# AutoTrade production paper-form defect — 2026-11-28

## Diagnosis, not assumptions

- Work began from `652a5e57`, preserving operational implementation `d24ffa02` and evidence `b5f8f427`. No worker, managed execution, scheduler, contract, registry, BNB/RWA, financial or authorization policy was changed.
- Production was **last published at 15:05:04.736 UTC**, not the older 07:34 timestamp in the historical operational checklist. Publish settings initially reported no unpublished changes. No publication was performed in this task.
- Retrieved production asset `https://flowbridge.space/assets/ops-6p6S7RQW.js`: SHA-256 `304b800e65fb52e6857cc1cfc121677b3b11a9bc84b92fd2c3812dfca5ca308a`, 147,398 decoded text characters. It contains the original unbounded session/request pipeline and literal stale summary. This fingerprints the actual client artifact, **not an attested deployed source/server commit**.
- Production worker logs show successful AutoTrade GET reads (16:06:10 and 16:15:46 UTC) and repeated POST **403** denials through 16:17:26 UTC, including rapid repeated clicks. These requests were not silently ignored and did not reach successful order insertion. Logs do not contain the response bodies or identify the caller; therefore they cannot establish the precise denial reason on the owner's phone.
- Reproduced original source with the exact reported controlled values in a 390×844 isolated browser and a denied API response: request contained budget `5`, buy `2`, sell `2.5`, slippage `50`, gas `0.05`, loss `5`, expiry `60`, no stop. The click fired; button was enabled, pointer events `auto`, type `submit`. The static summary still said targets were not selected. The error appeared **463px above the viewport**, making the mobile button look unresponsive. No overlay or decimal-state defect was observed in this reproduction.
- The exact values pass the unchanged order engine. For CA/BOT, `budget=5` means **5 BOT**, not the separately approved 5 USDT-equivalent live cap. `50 bps` means **0.5%**.
- Shared database read: **zero paper orders**, no orders in the prior 24 hours. Existing order columns and UUID primary key are present. No missing migration was found; no migration was applied.
- Legitimate owner account inspection returned active super-admin status with a bound wallet. Its real signed-in sandbox request, without a physically connected bound wallet, returned **403: Connect the wallet bound to this admin account to continue.** No role promotion, fabricated provider or manually substituted bound-wallet header was used.

## Implemented correction

- Errors and status now sit directly beside the paper action, use alert/status announcements and receive focus. Loading is explicit; submission locks immediately. No request retries itself.
- Session initialization and network requests are bounded, including a guard preventing a late session resolution from sending after timeout. Ambiguous writes explicitly warn that an order may already exist.
- Parameter review freezes the actual pair, quote budget, buy/sell bounds, stop, percent slippage, gas, max loss and expiry before confirmation. Missing paper values remain blank; targets are never invented. Summary derives from current input, not static copy.
- CA/BOT labels use **Budget (BOT)**, **Buy at or below (BOT per CA)**, **Sell at or above (BOT per CA)**, **Slippage (%)**, **Max gas per leg (BOT)** and **Max loss (BOT)**. Other pairs retain their real quote/base currencies. Canary slippage also displays percent without changing server basis-point guards.
- Authenticated read-only net sell references include correct price/inverse units, block, expiration and unavailable states. The BOT budget can display an indicative USDT equivalent or use a USDT-equivalent input. Conversion uses integer arithmetic, is reviewed, and is freshly rechecked server-side; changed or unavailable conversions create no order. References are not independent-RPC readiness evidence or executable quotes.
- Strict fixed-point validation is shared by UI/API. Excess decimal precision, missing/invalid prices, inverted targets, invalid expiry/slippage and loss above budget fail visibly instead of rounding or defaulting.
- A client request UUID is saved in session storage **before sending**. Unknown results and reloads retain the same frozen request. Server replay checks the existing primary key, actor and exact validated parameters. A unique-key insert race reads back the existing matching request; different actor/parameters cannot replay it. This uses the existing order JSON/primary key, not a new table or migration.
- Successful creation reports the saved ID and refreshes the order list. A list-refresh failure does not resubmit the saved order. Definite initial validation/auth failures allow editing; unknown writes cannot quietly become a new request.
- Wallet changes invalidate the prior loaded AutoTrade state. Authorized reads expose role only, no identity/address; read-only operators are not shown an enabled writer action. Server RBAC remains authoritative and unchanged.

## Verification and limitations

- Full regression: **3,819/3,819**, 310 files, including the previous 3,793 baseline and 26 added tests.
- Final focused AutoTrade: **211/211** across 16 files after final changes.
- Automated build/typecheck signal: **build OK** after final source edits. No manual project build or typecheck was run.
- BNB embargo source firewall: **PASS**; build plugin continues enforcing emitted-module closure. Existing security findings/holds were not suppressed or marked fixed.
- Current security-result read: supply-chain and MCP inventory results current; deeper security/database results stale. This is **not security certification or independent human approval**.
- Chromium 390×844 and 1280×1800: exact inputs, Enter submission, review, disabled loading, saved-id/list readback, 403, 503, interrupted response and same-UUID reload/retry passed in an **isolated mock harness**, with no horizontal overflow or page errors. Reviewed screenshots show the corrected values and adjacent errors. Original source also reproduced its off-screen 403 behavior.
- Handler tests use isolated mocked authorization/storage: screenshot persistence, replay, unique-key-race recovery, different actor/parameters, storage errors, precision rejection and server conversion recheck. They are **not real owner acceptance**.
- Real signed-in owner UI showed the connected-bound-wallet requirement and a working Retry action. Actual authorized paper creation remains **PENDING** because no legitimate connected bound-wallet actor was available. No paper row was inserted in the shared database by testing.
- No physical mobile-wallet keyboard/provider acceptance was claimed. No actual live reference result was obtained through the fully authorized owner screen; arithmetic and unavailable states are tested, market availability remains subject to fresh authenticated RPC reads.

## Production deployment and acceptance

1. The fix is available in current preview code only. **No production release occurred.** Production still has the old form.
2. Publish deploys the entire current snapshot, not just these files. A named human must attest the current production-to-fix diff/source/server artifact and the restricted whole-release conditions; the existing independent human security acceptance remains outstanding. The observed 15:05 publication is not inferred to satisfy those conditions. No supported selective publish or deployed server-revision attestation was found in the available platform tools.
3. Do not publish unrelated BNB/RWA work, change the embargo, or bypass a security hold. A reviewed isolated release branch/workspace with recorded source/build identity remains the supported isolation approach outside partial Lovable Publish; no branch switch/export/deployment was performed here.
4. Real acceptance: sign in using the approved owner account, connect **that account's already bound wallet in the same browser**, open Ops → AutoTrade, and check the role/permission state. Enter the screenshot values with slippage **0.5%**, review the **5 BOT simulation budget**, confirm once, and verify saved ID plus ARMED row. If denied, read the adjacent response; do not rebind, promote roles, spoof headers or bypass 403. A USDT-equivalent budget is a different reviewed amount, not an automatic interpretation of the screenshot.
5. Scheduler state was **not changed or restored**. This form fix does not establish scheduled endpoint authentication/deadline/heartbeat acceptance or remove any prior infrastructure blocker.

Live/public/registry remain OFF; BNB publication embargo and execution/launch holds remain enforced. The approved live trade cap stays 5 USDT-equivalent; the old gas estimate is expired, and exact live prices/gas remain unapproved. No real orders, funding, signatures, broadcasts, registry actions or new accounts.

## Follow-up: read-only operator notice (17:01 UTC)
- Observed role mismatch (aggregate, no identities): two enabled admins exist, one `super_admin` and one `internal_operator`, both email-verified with a bound wallet. The most recent sign-in (16:04 UTC) was the operator account; the super admin last signed in 2026-11-26. The screenshot notice matches the operator branch, so the session and bound-wallet gate succeeded and only the role blocked creation.
- Server policy before: every POST action required `super_admin`, including `paper_reference`, so the reference also failed for the operator.
- Change: `src/lib/autotrade/paperPermissions.ts` decides actions. Verified Ops roles (app_admins + verified email + matching bound wallet, unchanged gate) may create paper orders, read references and manage only their own paper orders (others' orders return 404). Server forces `mode=paper`; quota 5 active / 10 per hour per account, fail-closed; existing audit row retained. Super-admin only: emergency, prepare_canary, validate_infrastructure, registry_preview. Unknown roles/actions rejected.
- Form: simulation defaults, inline errors, next-action line, blank max loss = full budget shown on review, no price defaults.
- Verification: 17-test handler suite (operator create, forced paper, unknown role, quota, isolation), 5 permission tests, form default/error tests; component browser check at 390/1280 for operator and super admin against a mocked API (not owner acceptance, not production).
- Not changed: no role promotion, no live/public/registry flag, no publish.
