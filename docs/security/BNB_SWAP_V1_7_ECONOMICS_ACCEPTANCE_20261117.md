# FlowBridge BNB Trading V1.7 — Route Economics, Provider Access & Revenue (Acceptance)

Status: **HOLD**. Preview/source only. No deployment, signing, swap, fee configuration, key, migration or publish.
This is automated self-review, **not an independent audit**. V1.6 candidate unchanged (frozen); Slither 6 HIGH reentrancy-balance warnings remain OPEN pending audit; 9 inherited dependency advisories unchanged.

## 1. Evidence (A) — read-only sampler
- Command: `bun scripts/bnb-v17-economics-sampler.ts` → `docs/security/BNB_SWAP_V1_7_ECONOMICS_EVIDENCE_20261117.json`
- Block **134115821**, hash `0x0296199c…881c`, time **2026-11-17T12:00:26Z**; peer endpoint same hash. Endpoints `bsc-dataseed.bnbchain.org`, `bsc-dataseed1.bnbchain.org` (same operator — **not** independent quorum).
- 38 RPC calls, 0 failures. Methods allowlisted: chainId, blockNumber, getBlockByNumber, getCode, eth_call, eth_gasPrice, eth_feeHistory. Fixed targets only (WBNB, USDT, Pancake V3 factory/quoter/router, two pools); eth_call rejects any `from`/`value`/state override.
- Pools verified via factory `getPool`: 0.05% `0x36696169…2050` (liquidity 3.346e24) and 0.25% `0x1401ff94…15D2` (1.173e22); both factoryMatch=true.
- Reference price: 1 WBNB → **594.2832 USDT** (QuoterV2, 0.05% pool, same block). No external USD spot used.
- Gas price `eth_gasPrice` = **0.05 gwei** (feeHistory recorded in JSON).
- Gas units: direct 187,814 vs adapter 282,089 (**+94,275**) — from V1.6 `eth_estimateGas` under state overrides at one block; **not per-size, not receipts**.
- Evidence classes: execution receipts **NONE**; transaction gas = eth_estimateGas simulation (V1.6); quotes = QuoterV2 eth_call (no overrides).

## 2. Results — net to user after AMM fee (inside quote), platform fee, and gas (counted once)
Extra adapter gas = 0.00000471375 BNB ≈ **0.0028 USDT**. Break-even (fee ≥ user's extra gas): **5.60 USDT** at 5 bps, **2.80 USDT** at 10 bps.

Cost vs direct (bps of gross output, fee + extra gas), identical for both directions/pools within 0.02 bps:

| Size (USDT eq.) | 5 bps | 10 bps |
|---|---|---|
| 5 | 10.60 | 15.60 |
| 25 | 6.12 | 11.12 |
| 100 | 5.28 | 10.28 |
| 500 | 5.05 | 10.05 |
| 1000 | 5.02 | 10.02 |

Pool choice dominates: BNB→USDT 1000 USDT-eq. grosses 999.995 USDT at 0.05% vs 992.670 at 0.25% (≈73 bps worse). For USDT→BNB the 0.25% pool was marginally better at ≤100 USDT at this block — router must compare pools per quote; no static choice. Full per-row numbers in the JSON.

Volume sensitivity (illustrative, not a forecast): platform gross = volume × bps, e.g. 100,000 USDT/month → 50 USDT (5 bps) / 100 USDT (10 bps); gas share is paid by users, not FlowBridge. At current 0.05 gwei gas is negligible ≥25 USDT; a 10× gas price moves break-even to 56/28 USDT.

## 3. Provider matrix (B) — fetched 2026-11-17 ~12:00Z
| Provider | Chain 56 | Access | Fee mechanism | Provider charges | Status |
|---|---|---|---|---|---|
| Pancake V3 direct | yes (verified on-chain) | public | none for integrator via router; FlowBridge fee impossible without own contract | pool fee only | MEASURED |
| V1.6 fee adapter | yes (simulated) | not deployed, unaudited | fee from output, immutable recipient/bps | +94k gas | BLOCKED (audit, owner approvals) |
| 0x Swap API | yes — https://docs.0x.org/docs/introduction/supported-chains ("BNB Smart Chain 56 ✅") | API key from dashboard required (https://0x.org/pricing); **no key in environment** | `swapFeeRecipient`, `swapFeeBps` (0–1000) or `swapFeePpm`, `swapFeeToken` = buy/sell token; `tradeSurplusRecipient` (https://docs.0x.org/docs/0x-swap-api/guides/monetize-your-app-using-swap) | Standard plan: 0.15% on "select token pairs"; 0x collects trade surplus on Standard unless custom plan (pricing page) | **BLOCKED_NO_CREDENTIALS** — no quote fetched, no net-rate claim |
| PancakeSwapX RFQ | unverified | permissioned | unknown | unknown | UNVERIFIED |

Code: `providerQuoteStatus()` in `src/lib/bnb/routeEconomics.ts` returns BLOCKED unless access is AVAILABLE and an integer buyAmount exists; even then `executable:false`.

0x key onboarding (not done): owner creates key at dashboard.0x.org → adds it as a server secret via the Lovable project secrets editor (never chat, never `VITE_`) → server-only function calls the price endpoint with fixed host, chain 56, fixed token pair and size caps → quotes archived as display evidence. Spender (AllowanceHolder/Permit2 per 0x response) must be verified against 0x's published addresses before any approval UI is considered.

## 4. Architecture comparison (C)
1. **Direct Pancake, no fee** — best user net, lowest gas, no new trust; FlowBridge revenue 0.
2. **0x with integrator fee** — no FlowBridge contract to audit; fee disclosed in API response; but if the pair is 0x-fee-eligible the user also pays 0x's 0.15% (≈ 3× a 5 bps FlowBridge fee), Standard plan surplus goes to 0x, rate limits apply, users approve a 0x spender. Net-rate superiority **unproven** until authenticated quotes.
3. **V1.6 adapter** — fee 5/10 bps fully kept, transparent, self-custodial; costs +94k gas (≈0.0028 USDT now), requires professional audit, deployment approval and immutable fee recipient.

Conditional recommendation: keep (1) as the only live-ready option. Obtain 0x quotes (2) first because it is cheaper to validate than an audit; prefer (2) only if authenticated quotes for BNB↔USDT show user net ≥ direct-minus-FlowBridge-fee and 0x's own fee is 0 for this pair; otherwise (3) after audit, with a minimum order size ≥ break-even ×3 at the then-current gas price. Never conceal fees. XAUt/RWA stays BLOCKED from every generic BNB path; DEX listing is not execution permission.

## 5. Tests (E)
- `bunx vitest run src/lib/bnb/routeEconomics.test.ts` — 9/9 (fee floor precision, dust, bps bounds, gas counted once, break-even, 0x fail-closed).
- Full suite, selector and layout checks: see §7.

## 6. Risk register (open)
HIGH: no independent audit; Slither 6 reentrancy-balance open; XAUt freeze/burn/upgrade + RWA eligibility. MEDIUM: USDT issuer mint/legal; 0x terms/fee eligibility unverified for this pair; same-operator RPC; gas measured at one block only; slippage/TTL policy; phone-wallet signing untested; 9 dependency advisories.

## 7. Verification run
(filled below)
- Full suite `bunx vitest run`: **258 files, 2,766/2,766 passed, 0 failed** (log `BNB_SWAP_V1_7_FULL_SUITE_20261117.log`; +9 new economics tests vs V1.6 2,757).
- `python3 scripts/swap-chain-selector-check.py`: **PASS 640 assertions / 20 cases** (320/360/390/430/1280, 32px one-line Swap header, themes, reduced motion).
- `python3 scripts/compact-ad-fixed-check.py`: **3,786 assertions PASS** (bottom nav/ad bar).
- `oj typecheck -b --noEmit`: exit 0. Preview build: OK.
- Not run: hosted release pipeline, physical phone wallet, authenticated 0x quotes (no key), local fork deployment.
- No app UI added (no admin panel needed; evidence is report-first). V1.4/V1.5/V1.6 candidate directories unchanged.

## 8. Next gate
Owner decisions 1–4 (fee strategy, recipient, provider, 0x key via secrets editor) → authenticated 0x BNB↔USDT quote comparison (read-only) → independent audit of V1.6 if adapter path chosen. Release remains HOLD.
