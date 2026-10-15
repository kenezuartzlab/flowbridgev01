# Accepted security findings (V36.1, scan 2026-10-15 01:35 UTC)

## 1. Public read on `proposals` — scanner level: error (assessed: low)
- Why accepted: governance proposals are public by design; anyone may read them.
- Mitigations: read-only for visitors; creating and voting require sign-in and go through server endpoints; no emails, wallets or private fields stored in the table.
- Residual risk: anything later added to this table becomes public. Rule: never store private data in `proposals`.

## 2. Public MCP server without auth — scanner level: warn (assessed: low)
- Why accepted: exposes three read-only tools (supported chains, public contract registry, route description) that mirror public pages.
- Mitigations: no writes, no signing, no user data, no private application materials.
- Residual risk: scraping/load on public data. Any future tool touching user or private data must require OAuth first.
