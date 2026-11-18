# FlowBridge BNB Trading V1.8 — 0x Indicative Price Adapter Acceptance (2026-11-18)

Status: **PREVIEW ONLY · HOLD**. Not an independent audit. No deploy, signing, swap, publish, fee, fee recipient, DB or rewards change. RWA BLOCKED. BOT Router V4 untouched. V1.6 candidate frozen (6 Slither HIGH triaged false-positive but still open for auditor), 9 dependency advisories open.

## Key status
- Initial V1.8 run: key absent; all provider rows blocked. This historical outcome is superseded by the follow-up below, not by mock data.
- **2026-11-18 saved-key follow-up: SET**, confirmed through the secret-name listing and successful real provider responses. Value never displayed or recorded; used only by existing server transport.
- Comparison collector: 20 rows, **18 indicative-success rows (including cached reuse) and 2 provider HTTP 429 rows**. The two $500 directions subsequently returned real indicative prices in separately recorded retries. All ten size/direction combinations have successful observations; row count is not a count of independent provider requests.
- Authenticated admin endpoint verified with the requesting user's session and canonical bound-wallet context: HTTP 200, `cache-control: no-store`, `INDICATIVE_UNEXECUTABLE`, `executable: false`. No wallet signing or transaction occurred.
- Evidence: `BNB_SWAP_V1_8_0X_COMPARISON_20261118.json` and `BNB_SWAP_V1_8_0X_KEY_VERIFICATION_20261118.json`. Real 0x blocks started at 134245436; authenticated probe block 134245557. Test fixtures remain synthetic and separate.
- Observed USDT-selling responses charge **0.15% in sell-token USDT** (e.g. 0.0075 USDT for 5 USDT); WBNB-selling responses report a buy-token USDT fee consistent with 15 bps on output before that fee. This is evidence for these requests, not a contractual fee guarantee or approval of a FlowBridge fee. Integrator fee was null.
- Fresh verification: `bunx vitest run src/lib/bnb/zeroExPrice.test.ts src/lib/bnb/quoteAdapter.test.ts src/lib/bnb/routeEconomics.test.ts`: **101/101 tests, 3/3 files**. Full suite and layout checks below are the earlier V1.8 results, not rerun in this key-only follow-up. No application code or screen changed.

## What was built
| File | Role |
|---|---|
| `src/lib/bnb/zeroExPrice.ts` | Pure: request gate, fixed URL builder, strict response parser, public DTO, cache/rate limiter |
| `src/lib/bnb/zeroExPrice.server.ts` | Server transport: key from env inside call, header-only, 4 s timeout, `redirect: manual`, 200 KB cap |
| `src/routes/api/admin.bnb-0x-price.ts` | POST, existing `requireAdmin` gate (verified email + admin list + bound wallet), `no-store` |
| `scripts/bnb-v18-0x-comparison.ts` | Pancake vs 0x table → `BNB_SWAP_V1_8_0X_COMPARISON_20261118.json` |

Controls: only `GET https://api.0x.org/swap/allowance-holder/price` with `chainId=56,sellToken,buyToken,sellAmount`; headers `0x-api-key`, `0x-version: v2`. No `/quote`, no taker, no fee recipient/`swapFeeBps`, no slippage. Body must be exactly `{direction, sellAmount}`; directions WBNB→USDT / USDT→WBNB; sell amount integer 1…1.2e21 wei. Cache 15 s (successes only) with `invalidate()`; limits 12/min/admin, 30/min global, 2 in flight — per worker isolate, best effort (not global across isolates). Max age 30 s, max block lag 40.

Response rules (fail closed): `liquidityAvailable` must be true; chainId if present = 56; buy/sell tokens exact; sellAmount echo exact; buy/min/gas/gasPrice positive decimal-string uint256; min ≤ buy; gas ≤ 10M; `totalNetworkFee` must equal gas×gasPrice (double-count guard); fees each in buy/sell token, never ≥ output; any non-zero integrator fee rejected (none configured). Output keeps only amounts, fees, gas, block, source names, time, latency, `executable:false`. Stripped: `transaction`, `issues.allowance.spender`, `permit2`, `zid`, route addresses, provider error bodies, key.

## Tests (exact)
- New `zeroExPrice.test.ts`: **49/49** (secret absent never fetches; key header-only and absent from URL/result; 401/403/429/500/503/302; timeout; connection reset; non-JSON; wrong chain; XAUt and swapped tokens; overflow 2^256; decimal/negative/number amounts; min>buy; bad/foreign/oversize/integrator fees; gas double count; missing block/liquidity; stale age and block lag; cache/TTL/invalidate/no failure cache; per-caller/global/in-flight limits; leak regex over output).
- BNB folder: 123/123. Full suite: **2,815/2,815, 259 files** (single fresh run).
- Typecheck `tsgo -b --noEmit`: 0 errors. Build: OK.
- Swap selector: **640 assertions / 20 cases PASS** (320/360/390/430/1280, dark/light, reduced motion, 32 px one-row header).
- Dock/nav/ad: **3,786 assertions PASS**. No UI changed.

## Comparison (Pancake from V1.7 read-only evidence, block 134115821, 2026-11-17 12:00:26 UTC; not re-sampled)
The following table records the initial no-key run. Current real 0x results are in the follow-up JSON evidence. Pancake data is historical and 0x data is from November 18: **do not rank providers or infer revenue superiority from these non-contemporaneous observations**. WBNB quotes also exclude native wrapping/unwrapping overhead; no native execution is verified by this key check.

| Dir | $ | 0.05% net | 0.25% net | 0x |
|---|---|---|---|---|
| BNB→USDT | 5 | 4.99446 USDT | 4.97219 | BLOCKED_NO_CREDENTIALS |
| BNB→USDT | 100 | 99.99503 | 99.51680 | BLOCKED_NO_CREDENTIALS |
| BNB→USDT | 1000 | 999.98945 | 992.66437 | BLOCKED_NO_CREDENTIALS |
| USDT→BNB | 5 | 0.0083956 BNB | 0.0083992 | BLOCKED_NO_CREDENTIALS |
| USDT→BNB | 1000 | 1.6809749 | 1.6760418 | BLOCKED_NO_CREDENTIALS |
All 20 rows in the JSON. Net = gross minus gas once. Latency/block disparity for 0x: not measurable without a key.

## Owner onboarding (only if you choose to test 0x)
1. Create an account and key at https://dashboard.0x.org (check whether BNB/USDT is a 0.15% "select pair" on your tier).
2. Add it in Lovable Project Settings → Secrets as `ZEROX_API_KEY`. Never paste it in chat.
3. Ask for the read-only comparison rerun. No fee/recipient is set by this.

Sources: docs.0x.org supported-chains, allowanceholder-getprice, core-concepts/contracts, monetize guide; 0x.org/pricing; help.0x.org account tiers.

## Remaining gates
Contemporaneous Pancake/0x net economics and native overhead; contractual 0x fee/terms/legal review (15 bps observed, not guaranteed); independent audit of V1.6 or 0x integration; fee rate + recipient; slippage policy; phone-wallet signing; cross-isolate rate limit if ever public; dependency advisories; RWA (XAUt freeze/burn/upgrade) BLOCKED. Key access is verified; no trading readiness, activation, publication or financial authority follows from it.
