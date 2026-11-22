# FlowBridge BNB V1.11 — Custom Candidate and Branding Acceptance

Date: 2026-11-22 UTC. Base: 12ec35fdd9915ee5c6128703de4fc11b2d975cde.

**OWNER_PREFERRED_ARCHITECTURE_PENDING_APPROVALS. PREVIEW / LOCAL TEST ONLY. RELEASE HOLD. INDEPENDENT AUDIT NOT DONE.**

## Completed evidence vs authorization

| Item | Observed result | Gate |
|---|---|---|
| Official BNB symbol | Original first-party 96x96 SVG; yellow #F0B90B, official black #0B0E11 in light theme | Logo-use permission NOT OBTAINED; public launch HOLD |
| Compact UI | 32px heading, 16px mark; shared native/wrapped token artwork; BOT artwork unchanged | No BNB execution controls added |
| New candidate | Fixed chain 56 WBNB/USDT/Pancake V3, only 500/2500; immutable guardian pause | Not deployed/registered/approved |
| Frozen predecessors | V1.4/V1.5/V1.6 unchanged; V1.6 source SHA256 8ae401a74dce1e6aa7990b7fc5ca0755ac6789b14f6d087021f812f669a7a61a | Six inherited HIGH findings OPEN |
| Full tests | **2,944 / 2,944 PASS**, 268 files; 44 new EVM tests +15 preview tests +2 identity tests | Not professional audit |
| Local fork | **15 successful local-only transactions**, both directions and both tiers | ZERO mainnet transactions, real signatures or real fees |
| Static analysis | Slither: 18 rows, **6 HIGH reentrancy-balance OPEN**, 4 LOW timestamp, 2 LOW reentrancy-events, 6 informational | Independent audit NOT DONE |
| Production dependency scan | Fresh 9 rows: **1 HIGH Zod/WalletConnect, 8 moderate Hono** | Not fixed; release HOLD |
| bun audit | 7 advisory objects: 1 high, 5 moderate, 1 low (includes development dependencies) | Different counting/scope, not prior 12-row assumption |
| Browser QA | 640 selector, 3,786 nav/ad, 288 RWA assertions PASS; 201 logo checks in 20 cases plus fallback PASS | Physical mobile-wallet proof NOT DONE |
| Automatic preview build | Latest observed build OK, 2026-11-22 06:42:21Z | Standalone typecheck NOT RUN: harness-owned, no separate success claim |

## Official artwork and branding gate

Source: https://www.bnbchain.org/en/brand-guidelines . Original yellow/black symbol downloads and SHA256/viewBox/path evidence are in BNB_SWAP_V1_11_BRANDING_PROVENANCE_20261122.json. Media is project-owned asset-pointer storage, not an external hotlink. No symbol tracing, color edits, outline, shadow, stretching or endorsement. Official black is used for contrast on pale light surfaces; yellow remains unchanged on dark surfaces. Symbols are 16px in the chip (minimum 15px); no horizontal wordmark is used. Accessible identity: BNB Chain, chain 56. Native BNB and WBNB retain their token labels; neither is confused with BOT.

BnbChainMark owns picker/token artwork and stable failure fallback. Registry rejects generic/admin BNB artwork replacement. Existing RWA badges are textual labels, not incorrect logos; no marketing/public partnership claim was added. Permission must be sought using the proposed distribution/screenshots before public release. Website-brand-research informed source verification.

## Frozen auditor target

Directory: contracts/candidates/bnb-swap-adapter-v1-11 . solc 0.8.38+commit.1835d247, optimizer 200, Cancun; runtime **6446 bytes**. Source Keccak **0xba6803f62aee20a030aea1bc963ab859f15a822eade21c3a556f9082b020bc67**. Creation bytecode Keccak **0xe332ecacc0680b6f81e745b4f75d7d8d199ab6859856ef7f8e596c08c81d7ab1**. Runtime is immutable-patched at constructor deployment; compare linked code only against exact fixtures. ABI comes from compiled artifact, with parity asserted. Full Standard JSON, source hashes, creation/runtime, immutable offsets and all six HIGH traces are in BNB_SWAP_V1_11_AUDITOR_HANDOFF_20261122.json; regenerate with scripts/bnb-v111-audit-handoff.mjs.

Constants: WBNB 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c; USDT 0x55d398326f99059fF775485246999027B3197955; **verified V3 router 0x1b81D678ffb9C0263b24A97847620C99d213eB14**. An initial draft mistakenly pinned a different Pancake router; the local fork correctly rejected its snapshot. Corrected before final freeze; never deployed remotely. Router ABI must remain the V3 deadline-bearing exactInputSingle, not SmartRouter substitution.

Only guardian, fee recipient and 0/5/10bps illustrative fee are constructor fixtures. No arbitrary token/router/caller/recipient/calldata/fee input, mutable treasury, sweep, upgrade, owner role or RWA path. No live guardian/treasury chosen. Constructor supports contract guardian/treasury for future independently verified multisig compatibility, not role setup.

## Snapshot and settlement threat model

- Caller, chain, fixed tokens/router, tier, input, min NET, deadline, quote timestamp and recent canonical block hash are checked. Only 500/2500; age <=30s; quote block must precede transaction block, lag <=100, hash nonzero/canonical. Deadline <=120s is ceiling, not a promise of 120s quote validity.
- Snapshot is **not a signed oracle, nonce or single-use quote**. Users can create new context or intentionally resend with remaining allowance; it grants no third-party spending rights. A future wallet preview must invalidate on wallet/chain/amount/block/fee changes and recheck canonical state. Tests reject response reuse with changed amount, stale/reorg/missing gas, wrong chain, XAUt and foreign router.
- Router approval exact input only, cleared/consumed to zero; input/output deltas reject fee-on-transfer/missing/overpaid output. Final min is NET after fee, all transfers revert atomically on failure. Wrapped BNB is controlled by adapter; USDT->BNB fee stays WBNB, only net is unwrapped. Native receive accepts WBNB only.
- `locked` blocks router/payout callbacks and pause mutation during settlement. Six balance snapshot/call/use traces remain HIGH OPEN: BNB deposit->WBNB snapshot; BNB deposit->USDT delta; BNB router->USDT delta; USDT transferFrom->USDT delta; USDT transferFrom->WBNB snapshot; USDT router->WBNB delta. Their exact descriptions/line mappings are in handoff; tests/automated triage do not clear them.
- Guardian can pause AND unpause only; no custody or economic mutation. Tradeoff: censorship, compromised/lost immutable guardian can halt service or resume prematurely; no rotation/recovery. Owner must approve emergency governance or request a NEW candidate. V1.6 no-admin/no-pause alternative remains frozen, but cannot stop direct callers through UI kill switch.
- Donations and forced BNB remain stranded, intentionally excluded from per-call deltas; no guardian sweep. Token issuer blacklist/mint/legal powers remain outside adapter control. MEV/sandwich protection still requires meaningful owner-approved slippage, limits and transport; fresh block hash alone is not MEV defense.

## Real deployed-bytecode LOCAL fork

Final fork block **135032507**, hash 0xd6332e48770aa2f4432a27df74ef4075a9f940d312561354ef76a6a65b30a82e, timestamp 1795329527; upstream fixed https://bsc-dataseed.bnbchain.org, local-only http://127.0.0.1:8547. Upstream is NOT an independent quorum. Factory identity at pinned state: 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865; fee500 pool 0x36696169C63e42cd08ce11f5deeBbCeBae652050, fee2500 pool 0x1401ff943D08a7E098328C1d3a9d388923B115D2; exact tokens, tier, nonzero liquidity and code hashes checked. Prior V1.4/1.5/1.6 source evidence remains source baseline, not a new independent source audit.

Anvil unlocked synthetic accounts only; no private keys read. USDT balances/allowances and forced-donation balances are local storage fixtures, not acquired/funded real assets. Real WBNB/USDT/router code is fetched and hashed. Candidate and rejecting recipient deployed locally. Both tiers/directions settle with fee/net equality and zero post-call residual/allowance deltas. Tests cover exact net/+1, real pool movement, cross-wallet, wrong snapshot chain/router/token/tier, 31s age, mismatched block hash, pause/unpause authorization, native payout rollback, donations. Mock suite additionally covers malicious router/recipient reentry, input over/underpull, output mismatch, fee-on-transfer, wrong runtime chain, fee cap and 128 seeded alternating swaps. No broad historical archive guarantee: pinned recent state available; future pruned reproduction must report BLOCKED.

Commands: `nix shell nixpkgs#foundry -c bun scripts/bnb-v111-fork-rehearsal.ts`; pinned reproduction `BNB_FORK_BLOCK=135032507 nix shell nixpkgs#foundry -c bun scripts/bnb-v111-fork-rehearsal.ts`. Mainnet transport is fixed read-only; all send/storage methods target 127.0.0.1. No app signer/CTA added.

## Economics: simulations, NOT current user offers

Same-state 0.001 BNB: direct 0.540100606782343198 USDT; candidate 0.539830556478952027 USDT; **unapproved illustrative 5bps** = 0.000270050303391171 USDT. Receipt gas direct 160122, adapter 228806, **+68684 gas**. This differs from earlier +94k estimates because state/warmness/context differ; no universal cost guarantee.

Offline diagnostics compare whole-swap gas once and net after proposal fee for both verified tiers. Pool fees are already in gross Quoter output, never deducted again. The test selected tier500 at this snapshot; tier2500 winning/tie/missing-gas cases are independently tested. **Anvil getGasPrice is a local fork gas-price fixture, not measured contemporary network gas cost**; normalized cost figures in offlineTierPreview must be read as local simulation, never live savings or readiness. No 0x calls/quota purchases; existing admin-only diagnostic preserved. Preview remains offline/admin research, not public quote integration. Proposed fee adds user cost vs no-platform-fee direct, even if selecting better pool; owner has not selected 0/5/10bps.

## Mobile evidence and honest limitations

320/360/390/430/1280, dark/light, reduced/default motion: heading unchanged 32px, mark square16px, original asset SHA256, readable BNB, no overflow/sign/approve/swap controls, BOT remount clears draft. Logo fallback uses BNB text in same footprint. Screenshots under /tmp/browser/bnb-v111/qa; reproducible script scripts/qa/bnb-v111-logo-check.py. Actual inspected 320 dark/light and 1280 dark plus fallback; broader geometry asserted. Existing ad/nav tests preserve dock/flat nav. An early parallel picker run timed out while loading; isolated rerun passed 640/640. No product fix inferred from test timeout. Desktop full-page screenshot caught an existing banner transition/loading color; logo/heading crops and subsequent selector screenshots verify geometry, not ad asset changes. Physical-wallet rejection/signing and entitled financial flow intentionally NOT exercised.

## Owner decision matrix — all HOLD

| Required approval | Decision needed |
|---|---|
| Audit scope | Engage independent third-party auditor for V1.11, all six HIGH traces, fixes in new frozen version and re-audit |
| Guardian | Exact guardian/multisig, pause AND unpause policy, loss/compromise/censorship response; no address selected |
| Economics | Choose 0/5/10bps or another separately reviewed design, exact recipient/multisig; verify addresses independently |
| Execution policy | Slippage/min NET, quote TTL/block lag/deadline, max/min sizes and MEV approach; current ceilings are proposals |
| Legal/token/liquidity | USDT issuer/legal risk, sustained both-pool liquidity and independent RPC quorum |
| Dependencies | Resolve/risk-review high Zod and Hono advisory paths; no dependency changes in this scope |
| Branding | Seek BNB logo-use permission with proposed use/distribution; no endorsement |
| Wallet rehearsal | Physical mobile wallets, rejection/recovery; separately authorize testnet/funded capped rehearsal |
| Deployment/canary | Separate explicit mainnet deployment and multisig verification, funding/signing/canary approval |
| Public release | Completed gates plus explicit publish consent; NOT authorized here |

No production deployment, on-chain write, real swap/approval/signature, admin permission, migration, fees, reward/identity/payout changes, BNB/RWA activation or publication. BOT execution unchanged in source and regression coverage; live funded BOT swap is not newly proven here. No independent audit claimed.
