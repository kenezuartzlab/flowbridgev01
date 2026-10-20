# V36.10.2 release gate — 2026-10-20

Status: HOLD pending release-specific residual-risk approval. Production has not been updated in this turn.

## Verified evidence
- Full regression rerun after final display correction: 1,844 tests / 173 files PASS.
- Automatic build/type validation: build OK at 18:03:26 UTC. No separate manual production build or typecheck was run; the environment prohibits those commands. Hosted status still references successful run br_16d08dd8-9f2b-4b7c-8ef3-ea6e2ee7789f for revision 83c077e1225c7e6976591db4871a4a4c4651929c, so it is not proof of a hosted final-revision deployment.
- Authenticated authorized Ops preview: stored Round #3 and funded-only draft both display one wallet / 1,122 FLOW; draft excludedUnfundedPoints=74. Settlement READY_FOR_PUBLISHER_REVIEW, every validation check and live unsigned eth_call simulation PASS.
- Stored round label formerly truncated exponent-form JSON numeric values to zero. Display conversion corrected only; no stored batch, eligibility, calldata or transaction code changed.
- Wallet rejection and nested rejection permit safe retry; disconnect/timeout/closed wallet/invalid hash remain fenced through remount; rechecking never resends; delayed confirmation yields one audit; reverted reconciliation permits retry. Publisher review layouts 320/390/430/1280 PASS. Test APIs are mocked, not production writes.
- Fresh read-only records: Round #3 total 1122000000000000000000 wei, one leaf; root and fingerprint unchanged. Funded Core Swap 1,022 plus funded signup 100. Additional 74 Core Swap Points UNFUNDED, no reservation. Zero publish attempts; live epochCount=2; auto-funding OFF; autonomous signing unchanged OFF. Historical exclusion validation PASS; no funding, reward, hold, contract or treasury write performed.
- Full Bun audit and production dependency scanner: zero critical / zero high. Remaining full audit: esbuild moderate GHSA-67mh-4wv8-2f99 and low GHSA-g7r4-m6w7-qqqr; Hono moderate GHSA-5r4p-p66f-jhc7 (4.13.7; fix 4.13.11). Hono advisory concerns serveStatic double decoding; application source and MCP TanStack adapter do not use serveStatic. No active exploit test performed, no advisory suppressed, no dependency changes made for this Ops-only release.
- Fresh backend scan 17:58:19 UTC: no new active findings. Wiz skipped because connector not configured. Deep code/MCP scans remain dated October 13; changed reporting/display paths reviewed directly, not claimed freshly deep-scanned.
- Live existing release security headers checked: HSTS, report-only CSP, enforced frame-ancestors self, X-Frame-Options SAMEORIGIN and Permissions-Policy present.

## Mandatory approval boundary
The V36.10.1 matrix explicitly restricts its managed-provider cloud/IAM residual-risk acceptance to that release only. It cannot automatically authorize V36.10.2. Current authorization permits deployment of the Ops correction but does not explicitly renew acceptance of the unavailable cloud/IAM assurance. Request explicit security-owner acceptance of the same narrowly scoped managed-provider limitation for V36.10.2, with no extension to later releases. No claim of provider-native equivalence is made.

## Deployment verification pending
Last verified production Ops asset: /assets/ops-BY_X2BlX.js, SHA-256 b1a7179f93d6a798042a94c03286be83ee9e707887d32cf637780bbfd61da4bd. New release fingerprint and authenticated production acceptance remain pending; no production success claimed.