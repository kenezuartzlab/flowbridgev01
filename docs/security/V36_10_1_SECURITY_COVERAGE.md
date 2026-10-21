# V36.10.1 Security Coverage Matrix (2026-10-20, fresh)

Scope: publisher recovery hotfix release gate. Wiz remains unconfigured; this matrix records the equivalent checks actually executed and the exact residual gap.

## Production infrastructure (verified, not assumed)

- Hosting/edge: Cloudflare edge (`server: cloudflare`, cf-ray) in front of Lovable hosting; DNS A 185.158.133.1 for flowbridge.space and www.
- TLS: Google Trust Services cert for CN=flowbridge.space, valid 2026-08-22 → 2026-11-20; HSTS `max-age=31536000; includeSubDomains`.
- Backend: Lovable Cloud managed database/auth (single instance serving preview and published app); server logic via TanStack Start server functions and /api routes on the same deployment.
- Secrets: server-only env vars limited to project ID, URL and publishable key (all non-secret); no service-role key present anywhere in the project.
- CI/CD: build and deploy are platform-managed; supply-chain guard via bunfig minimumReleaseAge (24h) with a narrow exclude list.

| Required assurance | Tool or inspection used | PASS/FAIL | Evidence |
| --- | --- | --- | --- |
| Cloud configuration | Platform security scan (lov_pgscan, app_mcp) + DNS/TLS/edge inspection | PASS (with limitation A) | Fresh scan 2026-10-20: 0 new findings; TLS/HSTS/edge verified live |
| Identity permissions | Admin gate code review (requireAdmin: bearer + verified email in app_admins + bound-wallet match), publisher authorization tests, fresh RLS scan | PASS (with limitation A) | 5 publisherAuthorization tests in 1,841-test suite; reward_automation_policy rows: auto_funding_enabled=false on all programs |
| Public exposure | Enumerated /api/public routes; reward-rounds returns only the caller-queried wallet's own leaf for on-chain-verified rounds; admin routes behind requireAdmin; signed-out Ops API 401 | PASS | Route source review; prior acceptance evidence |
| Secrets in artifacts | Downloaded all 12 deployed production bundles and grep-scanned for sb_secret_, service_role, private-key PEMs, gateway key headers; source-tree scan | PASS | One hit = Supabase JS library prefix check `startsWith('sb_secret_')`, false positive, no key material |
| Supply chain | Full bun audit + production-scope dependency scan; lockfile integrity | PASS | 0 critical / 0 high both scopes; remaining esbuild moderate/low are dev-server-only (documented in V36_10_1_DEPENDENCY_AUDIT.md) |
| Backend security | Fresh platform backend scan | PASS | 2 findings, both previously ignored by owner (proposals public read; public unauthenticated MCP); 0 new |

## Round #3 fresh revalidation (2026-10-20)

- reward_settlement_batches: epoch 3, leaf_count 1, total 1122e18 wei = 1,122 FLOW, root present. Epochs 1–2 unchanged.
- reward_publish_attempts: 0 rows — no broadcast ever attempted.
- reward_automation_policy: auto_funding_enabled=false, caps 0 on REFERRAL_MILESTONE, SIGNUP_BONUS, CORE_SWAP. Automatic signing OFF.
- On-chain (read-only, rpc.botchain.ai, chainId 677): distributor epochCount = 2 → Round #3 unpublished.

## Limitations

A. **Provider-native cloud/IAM configuration audit is unavailable.** Hosting, edge and database are Lovable-managed; there is no customer-accessible cloud console or IAM graph to inspect, and Wiz is unconfigured. Compensating controls: platform-managed infrastructure with the platform security scan clean, least-privilege enforced in application code (admin gate, RLS), no cloud credentials stored in the project. Residual risk: a misconfiguration inside the managed platform itself would not be detected by these checks.
B. **CSP report-only and clickjacking headers are verified by tests (src/lib/securityHeaders.test.ts) but not yet live on production** because production still serves the pre-hotfix deployment. They activate with this release and will be re-verified against the live bundle post-publish.
C. **Deployed-artifact secret scan covered the currently deployed (old) bundles.** The new bundle will be scanned the same way immediately after publish, before the release is considered verified.

## Decision required

Coverage is complete except limitation A. Per the release gate, this requires the authorized security owner's explicit decision: accept the documented residual risk for limitation A and publish, or hold.

## Owner decision (2026-10-20)

The authorized security owner reviewed this matrix and formally ACCEPTED the residual risk described in limitation A (provider-native cloud/IAM audit unavailable on managed hosting; compensating controls documented above) and authorized publication of V36.10.1. Scope of acceptance: this release only; the acceptance does not waive future releases from this checklist.

## Owner renewal for V36.10.2 (2026-10-21T00:00:00Z)

The authorized security owner explicitly renewed acceptance of limitation A for V36.10.2 only. Scope: the existing Wiz/cloud-IAM coverage gap, unchanged compensating controls. Duration: 30 days from the approval timestamp, expiring 2026-11-20T00:00:00Z; the provider-native cloud-security assessment must be scheduled before expiry. The renewal does not cover new vulnerabilities or payout publishing defects and does not extend to any later release.
