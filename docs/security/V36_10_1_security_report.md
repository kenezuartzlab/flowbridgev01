# V36.10.1 Security Report (2026-10-20)
Status: HOLD (Wiz/cloud assessment unavailable; residual-risk decision required)

Typecheck: tsgo -p tsconfig.json, exit 0, 0 errors. Production build: vite build --mode production, exit 0.
Regression: 1,841 tests passed. Publisher recovery/lock tests: 46 passed. Eight-way PostgreSQL concurrency: PASS (last run against unchanged final migrations).
Dependencies: 0 critical / 0 high. esbuild moderate GHSA-67mh-4wv8-2f99 and low GHSA-g7r4-m6w7-qqqr (0.18.20 via drizzle-kit, 0.27.7 via mcp-js): dev-server only, no production exposure, no compatible patch without major upgrades.
SAST (Semgrep p/default + p/secrets): 1 error = plain-HTTP in localhost fork script (not shipped). 4 non-literal RegExp warnings reviewed: activityVerifyRequest (numeric constant) and bindingMessage (fixed literal keys) safe; preparationRouting (2) now escaped.
Passive baseline (ZAP unavailable: no Java/Docker; equivalent GET-only crawler, 1 req/s, /api, /ops, /admin excluded, 21 URLs + 40 JS bundles):
- Missing X-Frame-Options / CSP: REMEDIATED in code (production-host SAMEORIGIN + frame-ancestors; CSP report-only). Takes effect on next deploy.
- Cookie flag / secret-pattern hits: false positives (Cloudflare __cf_bm is Secure; "sb_secret_" is a library prefix check, no key).
CSP: report-only; enforcement NOT verified for Google OAuth, WalletConnect, TokenPocket — keep report-only.
Untested (Wiz): cloud/infra config, identity permissions, deployed artifact secret scan in registry, image/supply-chain policy, runtime exposure graph.
Acceptable alternatives: owner-provided Wiz credentials; or written acceptance of Semgrep + dependency audit + passive baseline + backend scan as equivalent.
Round #3: one wallet / 1,122 FLOW, unsigned, unpublished. Auto-signing OFF.
