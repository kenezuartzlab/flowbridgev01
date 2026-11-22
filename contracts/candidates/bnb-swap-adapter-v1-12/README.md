# V1.12 — frozen local remediation candidate; not deployed or independently audited

Preserves the V1.11 fixed BNB56 pair/router, 500/2500 tiers, caller-bound recent snapshot, immutable guardian, exact allowance, measured input/output deltas and net-minimum settlement. No production imports or registry entry.

Two narrowly scoped changes: reject an adapter-as-guardian configuration (unusable pause authority); pass the smallest fee-aware gross minimum to the router instead of one wei. The final measured-delta/net-floor checks remain authoritative. The gross floor is `floor((net - 1) * 10000 / (10000 - feeBps)) + 1`, including fee rounding. Oversized arithmetic fails closed. These are configuration/defense-in-depth fixes, not a claimed reentrancy exploit repair.

Six HIGH Slither balance-snapshot traces remain OPEN for independent review. No exploit reproduced under real immutable target assumptions. Do not remove snapshot checks or suppress detectors. New tests attempt both swap entry points and pause during deposit, withdrawal, approval, input transfer and output transfer, plus router and recipient callbacks. Mock callback behavior is adversarial, not claimed native behavior of the real tokens.

Reproduce: `bun contracts/candidates/bnb-swap-adapter-v1-12/scripts/compile.mjs`; `bunx vitest run`; `nix shell nixpkgs#foundry -c bun scripts/bnb-v112-fork-rehearsal.ts`; `bun scripts/bnb-v112-audit-handoff.mjs`.

No owner guardian/treasury or fee choice. Fixtures 0/5/10 bps are proposals only. User-supplied snapshots are not an oracle, nonce or MEV protection; meaningful minimum output is still essential. Trusted guardian can censor/pause, not seize assets. Forced native/token donations remain stranded by design. No deployment, real funds, wallet signing, activation, publication or reward changes.