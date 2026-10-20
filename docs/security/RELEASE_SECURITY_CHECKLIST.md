# Release Security Checklist (reusable, every release)

Run every item and record evidence before any production publish. Wiz is not required when this documented equivalent coverage passes and, for any listed limitation, the authorized security owner has given explicit written acceptance.

## 1. Dependencies and supply chain
- [ ] Full audit with the project package manager (`bun audit`): 0 critical / 0 high, or each remaining advisory documented with exposure analysis.
- [ ] Production-scope dependency scan (platform security dependency scan): 0 critical / 0 high.
- [ ] Lockfile integrity: `bun install --frozen-lockfile` passes; no unrelated version drift.
- [ ] bunfig minimumReleaseAge guard intact; any exclude-list addition owner-confirmed.

## 2. Backend and data exposure
- [ ] Fresh platform backend security scan: 0 new active findings (owner-ignored findings listed, not re-litigated).
- [ ] Every new public table has RLS enabled, policies and GRANTs.
- [ ] /api/public/* routes enumerated; each returns only data intended for anonymous callers.

## 3. Identity and access
- [ ] Admin/publisher routes verified behind the server-side admin gate (bearer + verified email + bound wallet) with tests.
- [ ] Automation policies read back from the database: automatic funding/signing state matches the intended release state.

## 4. Secrets and artifacts
- [ ] Client-exposed env vars limited to publishable values; server-only vars contain no credentials beyond publishable keys.
- [ ] Deployed production bundles downloaded and grep-scanned for secret patterns (`sb_secret`, `service_role`, private-key PEMs, gateway key headers); hits triaged.
- [ ] Source tree scanned for hardcoded secrets.

## 5. Transport and headers
- [ ] Live TLS cert valid, HSTS present.
- [ ] After publish: CSP report-only and clickjacking headers verified on the live production host (they only apply to production hosts).

## 6. Functional gates (project-specific)
- [ ] Typecheck and production build pass; full regression suite passes.
- [ ] Publisher recovery: concurrency, cancellation, reconciliation and single-audit-confirmation tests pass.
- [ ] Pending reward rounds revalidated fresh from database and chain before any signing.

## 7. Residual risk
- [ ] Every unavailable check listed with exact limitation, impact and compensating controls in a coverage matrix.
- [ ] Any residual risk accepted in writing by the authorized security owner — never auto-approved.
