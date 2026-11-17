# FlowBridge BNB V1.3 — Sustained read-only evidence, token safety and execution architecture proposal

Date: 2026-11-17 · Base commit: 9e0bce41 · Status: **HOLD** (preview only; nothing approved, activated or published)

## Result summary
| Area | Result |
|---|---|
| A. Sustained observation harness (`scripts/bnb-sustained-observation.ts`) | **PASS (live window)** / **UNKNOWN (history)** |
| B. Token & transfer safety | **UNKNOWN → fail closed** (no token approved) |
| C. Provider & fee matrix / architecture | **Proposal only**; 0x and PancakeSwapX access **UNVERIFIED** |
| D. RWA restriction preserved, no new UI rows | **PASS** (no UI change; XAUt remains "trading pending") |
| E. Tests / browser / build | **PASS** (counts below); standalone type/hosted pipeline UNVERIFIED |

## A. Sustained observation — genuine on-chain evidence
Archive: `docs/security/BNB_SWAP_V1_3_SUSTAINED_RPC_EVIDENCE_20261117.json` (214 allowlisted read calls, 5 failed = 3 historical probes + expected unsupported `owner()/paused()` reads). Collected 10:29:30Z–10:30:18Z from `bsc-dataseed.bnbchain.org` + `bsc-dataseed1.bnbchain.org` (same operator — **not an independent quorum**).

Methods allowed: `eth_chainId, eth_blockNumber, eth_getBlockByNumber, eth_getCode, eth_call, eth_getStorageAt` (EIP-1967 slots on WBNB/USDT/XAUt only). Fixed targets; quoter calls restricted to fee 500, zero price limit, ≤100 USDT / ≤1 WBNB / ≤0.05 XAUt. No `from`/`value`, no send/sign/nonce. Identity mismatch (chain, code, factory, tokens, fee) aborts the run.

**Historical blocks (head−200, −2000, −50000): UNKNOWN** — `RPC -32000: missing trie node`; official endpoints are not archive nodes. No historical data was invented.

**Six distinct successive live blocks** (≈9 s apart, 47 s span), peer block hash equal on both endpoints and final-hash recheck equal (no observable reorg):
134103700 (10:29:30Z), 134103721 (10:29:39Z), 134103742 (10:29:48Z), 134103763 (10:29:58Z), 134103784 (10:30:07Z), 134103805 (10:30:17Z).

| Pool (fee 0.05%) | Buy rate USDT/unit (10 USDT) | Directional spread (buy vs sell) | Marginal impact 10→100 USDT | Round-trip loss 100 USDT | Ticks | Max gas | Drift over window |
|---|---|---|---|---|---|---|---|
| WBNB/USDT 0x3669…2050 | 588.538 → 588.550 | 10.01 bps | 0.01 bps | 10.02 bps | 1 | 115,123 | 0.20 bps |
| XAUt/USDT 0x83A0…bC59 (RWA) | 3846.15* | 12.64–12.70 bps | −2.31 bps* | 10.83–10.89 bps | 0 | 105,058 | 0.00 bps* |

\* XAUt has 6 decimals; 10 USDT buys 0.0026 XAUt, so small-size rates are quantized — negative impact and zero drift are rounding artefacts, not depth proof. Liquidity was constant across the window (WBNB pool 3.34e24, XAUt pool 1.135e17 raw L).
Spread/loss are pre-gas, pre-platform-fee quoter simulations at each block's state; ≈10 bps is mostly the two 5 bps pool fees. Not a USD gold price and not a sequential round trip.

Proposed criteria (`src/lib/bnb/sustainedCriteria.ts`, **proposal, not policy**): ≥5 distinct blocks, ≥30 s span, peer+final hash agreement, stable bytecode, liquidity>0 & unlocked, drift ≤150 bps, round-trip ≤100 bps, marginal impact ≤100 bps, ticks ≤10, gas ≤1M. Both pools **PASS** for this 47 s window only. Missing: hours/days time series, deeper sizes, tick-depth map, concentration/LP ownership, finality-depth sampling, independent RPC operator.

**Native BNB:** only the WBNB ERC-20 pool was observed. Native BNB wrap/unwrap execution is **not simulated** and remains a separate execution requirement.

## B. Token & transfer safety (read-only facts at block 134103805)
| Token | Code | EIP-1967 proxy | owner() | paused() | Bytecode selector heuristic | Classification |
|---|---|---|---|---|---|---|
| USDT 0x55d3…7955 | 4,413 B | none | 0xF68a…f62d | not exposed | burn, transferOwnership | UNKNOWN |
| XAUt 0x21cA…A3bf | 2,227 B proxy | impl 0x9151…ecc5 (17,861 B), admin 0xedab…b027 | 0x4DFF…0bf8 | not exposed | mint, transferOwnership | UNKNOWN |
| WBNB 0xbb4C…095c | 3,124 B | none | none | not exposed | none | UNKNOWN |

Provable read-only: code presence/hash, proxy slots, owner, implementation hash. **Not provable read-only:** verified-source semantics, hidden fee-on-transfer, blacklist/freeze lists (selectors are heuristic only), upgrade timelock/admin governance, issuer legal transfer restrictions. XAUt is **upgradeable by its admin** — its behaviour can change after any review. `classifyTokenSafety` never returns an approved state; without source and legal review all tokens are UNKNOWN and execution stays fail-closed. No transfers or funded tests were performed.

## C. Provider & fee capability matrix
Sources archived: `docs/security/BNB_SWAP_V1_3_SOURCE_ARCHIVE_20261117.json` (fetched 10:31Z).
| Provider | Class | Access | Fee facts (public docs) | Status |
|---|---|---|---|---|
| PancakeSwap V3 | AMM (direct pools) | Public RPC read | Router fee-taking only via router `*WithFee` helpers; no FlowBridge permission | Read-only simulation VERIFIED; execution not built |
| 0x Swap API | Aggregation | **No API key / dashboard account / plan configured** | 0x pricing page: Standard plan, 0.15% 0x fee on select pairs, trade surplus collected on Standard; affiliate fee params (bps/ppm, since Oct 2026) | UNVERIFIED — no calls made; BNB pair coverage, rate limits, allowance target unverified |
| PancakeSwapX | RFQ | Docs URL `developer.pancakeswap.finance/apis/pancakeswap-x` → 404 | Unknown | UNVERIFIED; no guessed endpoints |
Exact missing access: 0x dashboard API key + plan choice + written terms; PancakeSwapX endpoint/maker access/terms; any provider's RWA (XAUt) permission.

### Proposed restricted non-custodial BNB execution architecture (owner review only — not built)
- **Adapter:** new FlowBridge-owned BNB adapter, **non-upgradeable** (preferred: no admin can redirect funds; trade-off = redeploy for changes), owner can only pause and rotate fee recipient within a hard cap.
- **Allowlists:** immutable target set {Pancake V3 SwapRouter 0x1b81…eB14} plus explicitly added aggregator targets after code-hash + selector verification at build and at each review; token allowlist excludes all RWA unless a separate RWA gate passes. No arbitrary calldata, recipients or multicall.
- **Approvals:** exact-amount ERC-20 approve to the adapter only (no infinite, no Permit2 until reviewed); allowance reset/verified after trade.
- **Fee:** 5 or 10 bps proposals (25 USDT → 0.0125 / 0.025 USDT before costs); taken from output, `minOutput` enforced **net of platform fee**; owner approval required — **not configured**.
- **Safety:** reentrancy guard, balance-delta accounting (fee-on-transfer rejected), refund of unused input, no residual sweep to anyone but the user, deadline ≤ quote TTL 60 s, block age ≤30 s, chain 56 + wallet + pair context hash bound into an immutable signed review; any change invalidates. No auto-submission; user signs each tx. Pre-send `eth_call` simulation must match review.

## D. RWA / UI
XAUt stays "trading pending", RWA gate BLOCKED; generic BNB paths cannot route XAUt (V1.2 adapter tests unchanged). No UI was added; 32 px Swap heading, flat 5-tab nav and docked ads unchanged. No rewards changes.

## E. Tests (mocks separate from on-chain evidence)
- Vitest: **253 files / 2,650 tests PASS** (+17 synthetic `sustainedCriteria.test.ts`; fixtures are NOT evidence).
- Browser (localhost preview, 320/360/390/430/1280 × light/dark × normal/reduced motion): selector **640 PASS**, BNB inspection **320 PASS**, docked ad/nav geometry **3,786 PASS**, ad placement **560 PASS** = **5,306**.
- Automatic build: OK (10:48:46Z). Standalone type check / hosted pipeline: UNVERIFIED.

### Preview fixes found during verification
1. Preview bundle failed to load optional wallet libraries not installed (`@coinbase/wallet-sdk`, `@metamask/connect-evm`, `porto`). `vite.config.ts` now resolves them client-side to a stub that throws if called (the app only uses injected + WalletConnect).
2. Trade page hydration mismatch: published banners were applied on first client render. `useAppConfig` now uses `useSyncExternalStore` with defaults as the server snapshot.

## Remaining HOLD gates
Archive-node/multi-operator time series and depth maps; verified-source + legal review of USDT/XAUt (upgradeable proxy admin); native BNB wrap path; 0x key/plan/terms and PancakeSwapX access; owner fee approval and adapter security audit; RWA legal/region/issuer/market-hours; physical-wallet acceptance; inherited dependency advisories; hosted type/build. No transactions, signatures, deployments, migrations, fees or publication occurred.
