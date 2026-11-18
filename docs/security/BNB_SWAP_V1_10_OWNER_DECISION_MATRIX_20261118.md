# BNB V1.10 — Compact Owner Decision Matrix (2026-11-18)

**Current record: `OWNER_PREFERRED_ARCHITECTURE_PENDING_APPROVALS`.** Custom is the preferred prospective architecture, not production approval. Nothing below asks the owner to sign, fund or deploy.

| Decision | Current state | Next human choice required |
|---|---|---|
| Primary architecture | CUSTOM preferred; 0x remains admin-only read-only diagnostics | Confirm the audit scope; no production route change |
| Frozen review target | V1.6, source SHA-256 `8ae401a74dce1e6aa7990b7fc5ca0755ac6789b14f6d087021f812f669a7a61a` | Engage an independent third-party auditor |
| Pool design | One immutable 500 or 2500 tier per deployment; no dynamic-best claim | Choose single-tier, two separately verified instances with quote-bound selection, or a new dual-tier candidate |
| Pause/emergency policy | No on-chain pause; UI controls cannot stop direct calls | Accept immutable no-pause operations or authorize a new guardian-pause candidate for audit |
| BNB fee | 5/10 bps are test proposals only | Separately approve exact rate, or choose 0 bps/direct; no silent fee |
| Treasury | Constructor input is unapproved; no address selected | Separately approve and independently verify a chain-56 EOA/multisig |
| Execution policy | Research bounds only | Approve slippage, 60/120-second deadline policy, min/max size and MEV protection |
| Legal/market evidence | USDT issuer powers and same-operator RPC observations remain open | Obtain legal review, sustained liquidity evidence and independent RPC quorum |
| Dependencies | Fresh production scan: 12 rows, 4 high and 8 moderate | Require remediation or documented release risk acceptance |
| Rehearsal | Real-bytecode local fork passed; no physical wallet or funded test | Authorize a bounded testnet/fork rehearsal and perform mobile sign/reject checks |
| Deployment/canary | None; contract remains unregistered and app-inaccessible | After audit/re-audit, separately authorize verified chain-56 deployment, multisig checks and capped canary |
| RWA | XAUt BLOCKED; no generic token path | No activation requested; separate legal/issuer/security decision would be required |

**Recommended next approval:** choose the pool/pause audit scope and commission an independent audit. Fee, recipient, deployment and financial approvals should remain separate later decisions.
