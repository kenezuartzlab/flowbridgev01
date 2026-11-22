# V1.11 — local audit candidate, NOT deployed or independently audited

Fixed BNB56 WBNB/USDT/Pancake router. Only fee tiers 500/2500; quote caller, amounts, tokens, router, chain, recent block hash and 30-second age are fenced. Immutable guardian can pause/unpause, not sweep or change economics. Illustrative 0/5/10bps constructor values are NOT approved fees. Guardian and recipient in tests are synthetic, never owner selections.

Reproduce: `bun contracts/candidates/bnb-swap-adapter-v1-11/scripts/compile.mjs`; `bunx vitest run contracts/candidates/bnb-swap-adapter-v1-11/test`; `nix shell nixpkgs#foundry -c bun scripts/bnb-v111-fork-rehearsal.ts` (local-only fork).

Direct users remain responsible for a meaningful min NET output; snapshots are context/age/reorg guards, not an authenticated quote oracle or MEV protection. Pause introduces guardian availability/censorship risk. Donations/forced balances remain permanently stranded. No live role, fee, trading, deployment or release is authorized. V1.4/1.5/1.6 remain untouched.