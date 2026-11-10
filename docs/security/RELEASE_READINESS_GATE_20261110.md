# FlowBridge release-readiness gate — 2026-11-10

**HOLD. Preview/code only; not publication or feature activation.** Based on Growth `46b3f08` and banner `b59dc720`. No hosted DB writes/migrations, config changes, financial signatures, sends, contracts, budgets, roles, payouts or staking changes.

## Completed remediation
- Dependency overrides: follow-redirects 1.16.1 → 1.16.3; qs 6.16.0 → 6.17.1; seroval 1.6.8 → 1.6.11; @hono/node-server 1.19.15 → 2.1.6 (MCP SDK explicitly permits the v2 range); glob 13.0.6 → 14.0.4 (also replaces production minimatch 10 with 11.0.5). Glob is CLI tooling, not the email renderer; its major override remains preview-only and needs email CLI workflow acceptance before release. No unsafe Zod-major override, suppression or audit waiver.
- Wallet sign-in checks active account again after the explicit provider signature and before proof/session exchange. No extra signatures or session exchanges.
- Sequential claims retain a returned submission hash as **unconfirmed** on receipt timeout or post-receipt RPC failure, never “not sent.” Subsequent rounds stop.
- Claim review freezes the exact preparation array/proofs and closes when canonical selection changes; provider account polling clears old review/results and stops subsequent rounds. Latest-request guards prevent late wallet/read results overwriting newer state. Reads clear old eligibility, refresh every 30 seconds and use chain block time rather than browser clock. Exact read-only `simulateContract(claim)` is required immediately before each wallet send, checking current contract proof/window/pause/cancellation/backing. No simulation or financial send was performed against a real entitled wallet during acceptance.
- Public reward-round requests now reuse the existing 60-second public snapshot/coalescing path; that path skips historical-index upserts and verification-timestamp writes. Authorized settlement discovery retains existing reconciliation. This cache is an opportunistic per-instance optimization, **not** a durable cross-worker limiter. Cold-worker amplification remains a residual risk; no custom limiter/schema was added.
- Banner styling unchanged. Regression script waits for observable reduced-motion hydration, eliminating cold-compilation timing failure.

## Exact original production advisory disposition
Initial scanner: **71 direct packages checked, 2 high + 11 moderate rows**, representing 8 unique GHSAs (transitive parents cause repeated rows). Bun 1.4.4 all-scope audit includes additional low/dev rows. Raw advisory snapshots accompany this report.

| Advisory ID | Vulnerable package / original parent rows | Scope / practical reachability | Disposition |
|---|---|---|---|
| GHSA-mrhx-c7xc-m3w5 | zod 3.22.4 / WalletConnect provider (1 high row) | @reown/appkit-wallet pins v3; remote provider collections are the relevant surface. App APIs use patched zod 4.6.6. Constrained collection exhaustion at this particular wallet surface is not demonstrated; no blanket non-exploitable assertion. | **HOLD**, forcing v4 across v3 consumers risks compatibility. WalletConnect default-OFF fail-closed gate preserved. |
| GHSA-mrwp-f3q8-3g9p | follow-redirects 1.16.1 / WalletConnect (1 high) | Axios Node redirect adapter; browser fetch/XHR does not use this Node path. Cross-realm custom credential redirect leakage not demonstrated in app. | Fixed 1.16.3 |
| GHSA-rmxm-3fg6-px4f | @hono/node-server / mcp-js + accounts (2 moderate) | Node static-file double decoding; app MCP uses TanStack HTTP handler, no app serveStatic use found. Not proof all vendor paths unreachable. | Fixed 2.1.6 |
| GHSA-6pq8-jhm2-2vcw | qs / mcp-js (1 moderate) | Own non-callable toString in comma stringify; no app comma-mode call found. | Fixed 6.17.1 |
| GHSA-f86p-h4j2-7qgj | seroval / router + start + router-plugin (3 moderate) | Runtime SSR/server-function serialization; attacker-controlled custom typed-array constructor can inject code. Ordinary app JSON does not establish such an object; serialization is nevertheless production-relevant. | Fixed 1.6.11 |
| GHSA-9wx9-5pv9-3349 | seroval / same three parents (3 moderate) | RegExp serialization/script context is runtime-relevant. Untrusted RegExp serialization not demonstrated. | Fixed 1.6.11 |
| GHSA-3g3m-2fjr-6pw4 | glob / react-email (1 moderate) | Email CLI filesystem traversal/cancellation, not render API or published app handler. | Fixed 14.0.4; CLI major compatibility not fully exercised |
| GHSA-g3hv-75wg-m249 | minimatch / react-email (1 moderate) | CLI glob pattern amplification, no production user-supplied filesystem glob found. | Production path fixed 11.0.5; dev typescript-eslint still uses 10.2.4, **not suppressed** |

Final production dependency tool: **1 high / 0 moderate rows**, still Zod/WalletConnect. Final all-scope `bun audit --json`: Zod high above, dev minimatch moderate above, and **GHSA-gcqx-w48m-w2h4 deepmerge 4.3.1 low** via html-to-text/React Email render. No patched deepmerge published (latest 4.3.1); render uses fixed application options rather than caller-supplied merge options, but no exhaustive exploitability certification. Retained without suppression. Direct TanStack/Wagmi/WalletConnect versions unchanged. Legacy `package-lock.json` predates current project dependency inventory and remains unchanged/non-authoritative; `npm audit` cannot run because inherited direct launch-editor/override ranges conflict. Use Bun, not that stale lock. Bun lock SHA-256: `e82dc7f956a6f4b2038f9c7ae043bd198144312479bd9147b8920b621b98bd4c`.

## Fresh security work and unavailable checks
- Fresh stateless hosted scan **2026-11-10T04:47:28.525502385Z**: lov_pgscan **0.2.1**, app_mcp **1.0**, no new actionable findings. Existing user-ignored findings left untouched and not reclassified. Wiz **1.0 skipped: connector_not_configured**.
- Fresh independent read-only source review (capable agent) audited SIWE/binding, claim freshness, public round discovery, Adventure gate, promotions transport and credential boundaries. **81 API files / 81 declared paths; 118 explicit method keys** inventoried, not equivalent to comprehensive authorization certification. Three actionable categories above remediated; no concrete session forgery, immutable-binding bypass or credential leak established in scoped inspection.
- Persisted **agent_security_v2 1.92** and **app_mcp_deep 1.1** remain stale at **2026-10-25T10:15:17.763641065Z**. Available tools/CLI cannot start these deeper engines; no saved pentest exists. Fresh manual review is **not a substitute PASS** for those engines. Persisted supply_chain **2.2.1** is stale (Nov 2); live dependency tool/Bun audit were freshly rerun instead.

## Acceptance actually run
- Full Vitest **4.1.12** suite: **2,464 tests / 243 files passed; zero failed**. Focused wallet/SIWE/claim/presentation/public API suite: **166 tests / 20 files passed**. Local signatures in pre-existing test fixtures are software-only, with public disposable test keys; no physical wallet, real signing popup or real account session created.
- Automatic preview compiler/type gate latest observed **2026-11-10T04:47:15Z: build OK**, Vite **8.3.4**, Node **22.23.4**. No manual build/typecheck, as platform owns these. Hosted preview status during work still identifies prior committed b59dc720; final-commit hosted pipeline must finish before claiming hosted latest-code acceptance.
- Disposable PostgreSQL identity harness: first bind, immutable email/history, privileged bypass negatives, replay, **8-way competing-account race yields one owner**, expiry/revoke/one-use recovery and private table/RPC access passed. No hosted mutation.
- Disposable Adventure harness: OFF/auth negatives, once-only bind, quiz verification, fixed cosmetic daily/weekly awards, 8-way sync, duplicate tx exclusion, economic rows unchanged and audited local pause passed. No live activation.
- Banner: **26 behavior checks** passed at **320/390/430/1280**, reduced motion, every slide screenshots, keyboard/swipe and pause/resume; screenshots visually inspected. Tiny internal dots, 24px subtle playback control, no external pagination band. Initial cold-start test failed before hydration; state-based wait and rerun passed, no style workaround.
- Real public Rewards at all four widths: no overflow/runtime errors. Actual claim card mounted with read-only synthetic provider at four widths: no entitlement → Claim disabled. Actual card with isolated **read fixture** at four widths: read-failure disabled, exact full-recipient review, changed selection closes review and disables Claim; screenshot inspected. Fixture is **not canonical on-chain eligibility evidence**, never clicked Continue, no wallet transaction/signature or session.
- Existing tests cover signature rejection/account changes/origin/signature tampering, atomic nonce replay, verified email/account checks, root forgery/underfunding/paused/unpublished/claimed rounds, pending/reverted/rejected outcomes and canonical reload skips. New tests cover receipt timeout hash retention, failed post-receipt read, fresh preflight rejection and public per-wallet leaf filtering.
- End-to-end physical wallet sign-in and real eligible claim/reload recovery **not performed**. No authenticated live account restored this gate. Wallet-B delayed-response and physical disconnect timing remain unverified in a real device, despite code guards and isolated state checks.
- Unique content metadata in index/Home/Trade/Earn/Rewards/Adventure inspected and preserved; no content route or public private-page listing added. Whitespace check passed.

## Reproduction
```text
bun install --frozen-lockfile --ignore-scripts
bun audit --json
bunx vitest run
python3 scripts/identity/permanent-binding-concurrency.py
python3 scripts/adventure-safety.py
python3 scripts/banner-carousel-check.py
python3 scripts/release/claim-disabled-check.py
python3 scripts/release/claim-review-check.py
```
Browser fixtures use localhost:8080, forbid wallet sends/signatures, retain screenshots under /tmp/browser/release-gate. DB harnesses require local PostgreSQL and create/drop disposable instances only.

## Remaining gates
1. Patch compatible wallet Zod3 path/upstream rather than forcing an unsafe major; disposition of additional deepmerge low and dev minimatch moderate.
2. Fresh platform deep engines (above) and full production Worker/module-graph certification; email CLI major-override acceptance.
3. Physical TokenPocket/injected wallet and WalletConnect (only if separately enabled) sign-in success, cancellation, account/chain switch, reload and single-use session evidence; real entitled financial flow requires separate authorization and was deliberately not attempted.
4. Cross-worker public discovery abuse budget, and automated delayed-wallet hook/review expiry coverage beyond current guards/fixture checks.
5. Hosted pipeline acceptance for the final commit; production publishing and Adventure activation remain explicitly unauthorized.

Preview: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app