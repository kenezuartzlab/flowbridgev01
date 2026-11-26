# FlowBridge AutoTrade V1 — Ops/Admin only (paper mode) — 2026-11-26

Status: **PAPER ONLY. Live trading OFF (`AUTOTRADE_LIVE_ENABLED=false`), public OFF.** No contract deployed, no registry change, no transaction, no signature, no key stored.

## 1. Deployed Router V4 (BOT Mainnet 677), read-only
Evidence: `autotrade-v1/router_v4_readonly_20261126.json` (block 31,625,366).
- Router V4 `0x7965…fc61`, 21,838-byte runtime (matches README size), owner EOA `0x524D…98c5` (ownership accepted, no pending owner), not paused, activation delay 0.
- **Registry already exists** (`registerRouter`/`setRouterActive`, V2+V3 types, `swapMultiHopSafe` mixed V2 hops). No replacement contract is needed; deployed code is not edited.
- Only routerId 0 = BDEX V3 SwapRouter is registered. Router input fee 1 bp (floor), as in `_fee`.

## 2. Venue parity
| Pair | Route used | Live both directions |
|---|---|---|
| CA/BOT | BDEX V3 CA/WBOT 1% (native BOT via `swapNativeToTokenV3MultiSafe`/`swapTokenToNativeV3MultiSafe`) | yes |
| CA/USDT | BDEX V3 CA→WBOT(1%)→USDT(0.3%), one atomic `swapV3MultiSafe` | yes |
| BOT/USDT | BDEX V3 WBOT/USDT 0.3% | yes |
| FLOW/USDT | BDEX V3 FLOW/USDT 1% | yes |

Quotes, two-block cross-check and impact: `autotrade-v1/live_quotes_20261126.txt` (all guards passed).
- **CaSwap V2: not usable.** Not registered; its pairs use caWBOT (`0x68ca…`, not WBOT), `WETH()` reverts, CA/caWBOT gives 1 CA → 0.0000166 caWBOT; no CA→WBOT or CA→USDT path. A CaSwap CA/BOT or CA→WBOT→USDT atomic route cannot be built without new liquidity. Registering it would add risk with no executable benefit, so V1 excludes it.
- **BDEX V2:** only WBOT/USDT (≈12.67 USDT/BOT vs V3 ≈12.72). Not registered; registration optional (owner `registerRouter(0x1414…6e76, V2, WBOT, …)`), not needed for V1.
- "Best net executable quote" in V1 = best registered route (BDEX V3); CaSwap/V2 are documented exclusions, not compared silently.

## 3. What was built
- `src/lib/autotrade/config.ts` — pairs, decimals, routes, switches, guard limits.
- `src/lib/autotrade/engine.ts` — exact bigint price bounds → `minOut` (buy: budget/maxPrice, sell: acquired×minPrice, decimals, router fee inside the bound, rounded up), slippage floor, quote guards (age 15 s, ≤3 block lag, cross-check deviation ≤50 bps, impact ≤300 bps, zero liquidity, gas cap), stop with loss limit, idempotent state machine (one leg in flight, unique leg keys, 6 confirmations, reorg returns to pending without resubmitting, revert → FAILED/resume, pause/resume/cancel/expire), paper fills. Sell always uses the confirmed acquired amount. Repeat rejected in V1; sell min below buy max rejected (no planned round-trip loss / wash pattern).
- `src/lib/autotrade/quotes.server.ts` — read-only BDEX V3 `quoteExactInput`; cross-check is previous block, or `AUTOTRADE_SECONDARY_RPC` when set.
- `src/lib/autotrade/store.server.ts` + tables `autotrade_orders`/`autotrade_events` (service-role only, RLS on, no policies, optimistic version, unique event per version).
- `/api/admin/autotrade` — `requireAdmin` (verified email + admin row + bound wallet); writes super-admin only; orders forced to `paper`; audit row on create.
- Ops → **AutoTrade** tab: create paper order, Check now, pause/resume/cancel.

## 4. Tests
`bunx vitest run src/lib/autotrade` — 24/24 pass (switches, decimals/fee math, validation, every quote rejection, gas limit, full buy→sell, stop/loss, duplicate/in-flight/finality/min-output, reorg, pause/revert/cancel, expiry). Full-suite result in the commit report.

## 5. Not done / blockers (exact)
1. **No worker.** Paper checks are operator-triggered ("Check now"). A persistent monitor needs a scheduled job; it must fail closed (no quote → no action). Not created.
2. **No trading account / signer.** Live needs a separate limited EOA funded only with the canary budget, key held as server secret by explicit owner approval, never the main/treasury/rewards wallets. Not created, not requested.
3. **Independent second RPC** for live cross-check not configured (only `rpc.botchain.ai` known).
4. No fork/testnet execution of AutoTrade legs yet (BDEX V3 V4 swaps were previously proven on mainnet canaries, not via this engine).
5. Nonce manager and receipt reconciler for live mode are modelled in the state machine but have no transport.

## 6. Deployment / first live buy-sell procedure (requires explicit signer approval at each step)
1. Owner approves creating a dedicated AutoTrade EOA and a canary cap (e.g. ≤ 5 USDT). Add its key as a secret; never reuse other wallets.
2. Add second RPC; run engine against a local BOT fork (anvil `--fork-url`) for buy+sell on BOT/USDT; record receipts.
3. Code change: enable `live` only for a super-admin, one order, canary cap, `AUTOTRADE_LIVE_ENABLED=true` in preview only.
4. Exact USDT approval to Router V4 for the budget (signed by the trading EOA, approved by owner).
5. Buy: `swapV3MultiSafe(0, USDT, WBOT, path, swapAmount, minOut, tradingEOA, now+120, fee)` → wait 6 confirmations → record actual WBOT/BOT delta.
6. Sell exactly that amount with `minOut = sellFloor`; confirm; verify router residual balances and allowances are 0.
7. Review evidence before any wider use. Public feature stays OFF.

No registry role is needed: routerId 0 is already active. Owner `0x524D…98c5` action is only required if CaSwap/BDEX V2 are ever added.
