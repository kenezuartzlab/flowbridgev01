# Permanent identity and promotions follow-up — 2026-11-10

## Result: HOLD, not published

- Precise failing test reproduced: `identityPolicy.test.ts > requires ownership evidence and a reason`, expected true/received false at line 11. The fixture `00000000-0000-0000-0000-000000000001` is not a valid UUID under the current validator; a valid version/variant fixture fixes it without changing validation. Added malformed-ID and missing-reason negatives.
- Final full suite: **2,430 passed, zero failed, 239 files**. Wallet sign-in regression tests include verified matching email, exact minted account, single-use concurrent proof, invalid signatures and unbound sign-in.
- Disposable PostgreSQL: first bind, immutable wallet/email, eight-way competing ownership, nonce replay, verified email, expiry/revoke, one recovery maximum, preserved original wallet, private privileges, banner revision capture and rollback pass. Hosted identities were never rebound and grants were never enabled.
- Automatic harness compilation: **build OK 2026-11-10T01:49:45Z**; harness type gate used, no standalone manual build/typecheck. `tsconfig.tsbuildinfo` refreshed 01:48:48 UTC.
- Live migration 0059 confirmed by exact function/trigger readback and 27 compatible identity pairs, zero duplicate wallets, zero review cases and zero grants. Migration 0060 confirmed by revision table and trigger. Migration 0061 applied only an additive privilege correction: revoke default anon/authenticated table rights; service-role access and existing RLS remain. Readback confirms private tables and service access.
- Corrected public config to omit draft content, not merely hide it in the renderer; admin config retains drafts. Added all-surface preservation regression. Corrected truncated JPEG frame validation and mobile-only image fallback.
- Signed-in real admin lookup and actual authorization checks passed with a read-only simulated bound provider. 320/390/430/1280 crop/overflow and reduced-motion checks passed. Uploaded mobile PNG decoded to 640px with cover/focal 75% 50%. Draft/published controls and banner save payload verified; save deliberately intercepted, no visitor settings changed. Audit persistence/rollback exercised only in disposable DB.
- Anonymous, missing-wallet and wrong-wallet admin reads returned 401/403; authenticated direct identity/history/grant/revision reads blocked. Operator and malformed super-admin write tests reject before RPC.
- All content routes inspected for title/description/OG/twitter metadata; none missing.
- Banner fingerprint remains `2650c95bb2dc01e151380f67f476dcdf`; fees/rewards fingerprint remains `3f19fd401d3fb61ea9337eefd11553b9`.

## Release blockers and limitations

- Fresh backend scan 01:50:36 UTC: no actionable new finding; intentionally ignored findings untouched. Persisted deep code scans remain stale (2026-10-25); not claimed fresh/clean.
- Production dependency scan reports **two high and eleven moderate advisory rows**, including transitive WalletConnect Zod/follow-redirects and serializer advisories. No dependency or unrelated code changes made under this narrowly scoped follow-up. The owner's all-PASS security release condition is not met.
- Real user-wallet sign-in/signature acceptance and actual production identity/banner bundle behavior remain unverified. A restored account session and simulated provider are not proof of live-wallet success.
- No app publication requested. Existing production app snapshot unchanged; live schema safeguards stay in place. Rolling back the UI does not roll back live migrations; do not remove identity history, guards or grants to revert app code. Any compatible correction must be additive.
- No recovery grant, role, budget, reward allocation, Vault setting, transaction, token transfer or wheel implementation was performed. Only test artwork uploaded; existing visitor promotions stayed unchanged.