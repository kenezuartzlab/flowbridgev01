# FlowBridge BNB RWA V1.1 — exact-pool and two-way quote acceptance

**17 November 2026 UTC · PREVIEW ONLY · Release HOLD · Execution OFF**

## Conclusion
The reported existing XAUt/USDT PancakeSwap V3 0.05% pool has **genuine pinned-block on-chain identity evidence**, and modest two-way **read-only QuoterV2 simulations work** at all five requested sizes. This is a successful local simulation gate, **not live provider-authorized trading readiness**. No swap, approval, signature, nonce, transaction, wallet connection, database/config write, key, deployment, role, fee, reward or ad activation/publication was performed. Pool creation/funding, token issuance, mint/redemption marketplaces and issuer partnerships remain excluded.

## Reproduce / evidence boundary
`bun scripts/rwa-pool-acceptance.ts /tmp/rwa-v11/recheck.json` performs allowlisted reads only; it does not regenerate the preview snapshot automatically. `BNB_RWA_V1_1_RPC_EVIDENCE_20261117.json` is the committed genuine raw request/result transcript: **66 RPC reads** including **20 Quoter calls** (5 sizes × exact-input and exact-output × 2 directions). JSON contains only public contract/block data, no identities of users. `quoteSnapshot.ts` is a reduced archived copy for the development-only `/campaigns/rwa` panel. No browser RPC, server endpoint, external provider API or wallet execution path was added. Registry release readiness remains pending; the independent evidence panel does not manufacture a current executable-provider quote.

## First-party provenance
Fetched fresh in this review:
- https://developer.pancakeswap.finance/contracts/v3/addresses — exact factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`, QuoterV2 `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`, V3 router `0x1b81D678ffb9C0263b24A97847620C99d213eB14`.
- https://docs.pancakeswap.finance/trading-tools/building-trading-agents-on-pancakeswap-v3 — V3 fee tier 500 = 0.05%, pool selected by tokens and fee.
- https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/ — current official Mainnet docs list `https://bsc-dataseed.bnbchain.org`, chain 56. The second fixed endpoint `https://bsc-dataseed1.bnbchain.org` is under the same official operator domain and returned matching pinned data, but is **not separately listed in this current page**. These are two endpoints, **not two independent operators** or an assurance against shared upstream compromise. Initial obsolete documentation paths returned 404; the current path was located via the official sitemap. No arbitrary endpoint is accepted.
- https://raw.githubusercontent.com/pancakeswap/pancake-v3-contracts/main/projects/v3-periphery/contracts/interfaces/IQuoterV2.sol — correct exact-input tuple order `(tokenIn,tokenOut,amountIn,fee,sqrtPriceLimitX96)`; exact-output uses `amount` before fee. Non-view quoter uses revert-based computation; `eth_call` discards state. No EOA `from`, value or wallet data supplied.
- The Tether issuer-confirmed XAUt identity and third-party listing provenance remain documented in the V1 report. USDT identity is the requested BSC contract and matches pool metadata; full issuer/legal/transfer review is not inferred from symbol.

## A — genuine chain-side results
- Chain ID: **56** on both endpoints.
- Pinned block: **134073409**, hash `0x8a570a73d7a619dae6231e47affc67aa12fbd0f7f7533ba76729de610a507f38`.
- Block timestamp: **2026-11-17T06:42:14.000Z**; completed observation **2026-11-17T06:42:16.376Z**.
- Both endpoints returned the same block hash, code fingerprints, factory relation, pool fields and token metadata. Final primary block-hash reread matched; no observed reorg during this read. This is not persistent finality monitoring or proof of finalized status.
- `factory.getPool(XAUt,USDT,500)` → `0x83A0A8A723262651Ae9C54BBbA929F167443bC59`.
- `pool.factory()` → exact official factory; `token0()` → XAUt `0x21cAef8A43163Eea865baeE23b9C2E327696A3bf`; `token1()` → USDT `0x55d398326f99059fF775485246999027B3197955`.
- `fee()` = **500**, `tickSpacing()` = **10**, `liquidity()` = **115170479745104215** (active V3 liquidity units, not USD TVL/reserves).
- `slot0()` = `['4922986951890183780785378912683352339', 358914, 1748, 1800, 1800, 222825800, True]`: sqrtPriceX96, tick, observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked. Pool unlocked = true. Observation ring counts do not prove oracle reliability or liquidity history.
- `decimals()/symbol()/totalSupply()`: XAUt **6 / XAUt / 14735095405 raw**, USDT **18 / USDT / 9184991536508259764116723649 raw**. Supply is not custody/reserve proof. No transfer/approval/blacklist probe requiring an account was attempted.

`eth_getCode` observations (both endpoints agree; fingerprints are observations, **not reproducible source verification or proxy implementation approval**):

| Target | Runtime bytes | Keccak256 runtime |
|---|---:|---|
| `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | 5151 | `0x8191d3ab1d55d3da9822199f28865415c99566b6f1aee4a4b16713f57930678c` |
| `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997` | 8331 | `0x2734833b7d2a656d4797f4a7d959314654749a7424ec473267613ff26424138a` |
| `0x83A0A8A723262651Ae9C54BBbA929F167443bC59` | 22962 | `0xa8266b511a322fc06b253dabea69602f4ec9255a250ea03f15d2577b765037d2` |
| `0x21cAef8A43163Eea865baeE23b9C2E327696A3bf` | 2227 | `0x4d9be648c5bf39973670d9f8b481d5d0b971e6a2db2deccc6b98cde21c5dd83e` |
| `0x55d398326f99059fF775485246999027B3197955` | 4413 | `0x97a48aa4c129657440dafdacd4c836389734d28cc4a0ca7403e68da660a74a59` |
| `0x1b81D678ffb9C0263b24A97847620C99d213eB14` | 12154 | `0x61002a11263b2c38ff8d5ded90a655987ed98f171a31840ee0014dd7052bccda` |

Factory, Quoter, router and Permit2 are never conflated: router only receives a code read; no router eth_call is accepted, and Permit2 is not used or configured. BNB MultiSend remains unrelated and excluded from observation call targets.

## B / C — genuine two-way quote measurements
Pinned `eth_call quoteExactInputSingle` uses `sqrtPriceLimitX96=0`, fee 500. Buy input is **5/25/100/500/1000 USDT units, not guaranteed USD value**. Sell input is exactly the XAUt buy output for that size. Each direction starts from the same original pinned pool state: **round-trip indicative loss is a comparison of independent quotes, not a sequential swap simulation**. No price scraped from GeckoTerminal/DEX Screener is used.

| USDT input size | USDT→XAUt output | Matching XAUt→USDT output | Buy / sell quoter gas | Buy / sell spot deviation bps | Round-trip indicative loss bps | Indicative spread bps |
|---:|---:|---:|---:|---:|---:|---:|
| 5 | 0.001294 | 4.992251128585119814 | 95977 / 89599 | 7.7748 / 7.7349 | 15.4977 | 15.5098 |
| 25 | 0.006471 | 24.968907908964151968 | 104970 / 94994 | 6.2283 / 6.2163 | 12.4368 | 12.4446 |
| 100 | 0.025886 | 99.893890618579157877 | 104970 / 94994 | 5.4552 / 5.1615 | 10.6109 | 10.6166 |
| 500 | 0.129426 | 499.426124849208691017 | 104980 / 103671 | 5.7644 / 5.7197 | 11.4775 | 11.4841 |
| 1000 | 0.258835 | 998.716928186845598215 | 103980 / 103687 | 6.4216 / 6.4174 | 12.8307 | 12.8390 |

All 10 exact-input calls succeeded with **1 initialized tick crossed** each. All 10 exact-output probes also succeeded:

| Reference size | Buy exact output cost | Sell exact output cost |
|---:|---|---|
| 5 | 4.998618394142582033 USDT for 0.001294 XAUt | 0.001297 XAUt for 5 USDT |
| 25 | 24.997024709821554108 USDT for 0.006471 XAUt | 0.00648 XAUt for 25 USDT |
| 100 | 99.996872150613897828 USDT for 0.025886 XAUt | 0.025914 XAUt for 100 USDT |
| 500 | 499.996840056498509755 USDT for 0.129426 XAUt | 0.129575 XAUt for 500 USDT |
| 1000 | 999.997829462366658683 USDT for 0.258835 XAUt | 0.259168 XAUt for 1000 USDT |

Slot0-derived mid rate = **3860.9857781743 USDT/XAUt** using `(sqrtPriceX96 / 2^96)^2 × 10^(6−18)`. It is an instantaneous pool rate, **not underlying gold value, oracle fairness or a USD quote**. Ask = USDT input / XAUt output; bid = USDT sell output / matching XAUt input. Spread = `(ask−bid)/((ask+bid)/2) × 10000`; loss = `(1−sellOutput/buyInput) × 10000`. Buy deviation = `(ask/mid−1) × 10000`, sell deviation = `(1−bid/mid) × 10000`, floored at zero. These include pool fees and 6-decimal quantization; they are conservative spot deviations, **not pure curve-only price impact**. Number conversion is used only for indicative display/metrics, never transaction amounts; encoded amounts are bigint with observed decimals.

### Proposed health policy — NOT approved economics or execution
- Quote TTL **60 s**, block age **≤30 s**, reject malformed/future timestamps; snapshot was fresh at collection completion and is permanently labeled **archived/not fresh** in UI. No stale sample may be presented as a live offer.
- Exact chain/factory/pool/tokens, fee 500, tick spacing 10, decimals 6/18, nonempty code, peer consistency, canonical hash reread, unlocked pool and positive active liquidity required before collecting quotes. Any drift, zero liquidity, missing code, decimals mismatch or RPC failure blocks collection; no mock substitutes.
- Proposed per-size spot deviation **≤100 bps**, round-trip loss **0–100 bps**, initialized ticks crossed **≤10**, quoter gas **≤1,000,000**. All five measured samples are inside these **proposed** bounds. These intentionally conservative review caps are not a sufficient health certificate or approved trade sizes; tests assert boundaries independently.
- Quoter gas excludes actual EOA transaction, approvals, gas price, future adapter fee work and network costs. No BNB fee estimate or profitability claim is made.
- **Overall pool health remains UNVERIFIED**: active liquidity alone is not full depth. Dense tick distribution, wide-range/repeated/time-series depth, concentration/LP withdrawal resilience, TWAP manipulation, finalized/reorg handling, stablecoin peg and full token behavior need independent review. XAUt has a small observed runtime that may delegate; implementation lineage/upgrades/pausing/freeze/blacklist/fee-on-transfer/custody proof remain unverified. No account-based eligibility or unsafe token probes were invented. Any unknown behavior must keep execution blocked; Quoter can omit actual token transfer restrictions.

## Integrator fees / route feasibility — no fee approval
Official `SwapRouter.sol` and `interfaces/ISwapRouter.sol` show `exactInputSingle` has a **pool fee tier**, not an integrator-fee field. The official router class inherits `PeripheryPaymentsWithFee`; fresh source `base/PeripheryPaymentsWithFee.sol` exposes `sweepTokenWithFee` / `unwrapWETH9WithFee` and source-level `feeBips > 0 && feeBips <= 100`, based on the router-held token balance. This makes fee-sweep mechanics **technically plausible at source level**, not confirmed safe/canonical deployed parity, token compatibility, service permission or FlowBridge integration support. No fee method was called. Upstream `main` is mutable, not a frozen deployed artifact.

Future design must remain **FlowBridge-owned fee-preserving execution**, not a direct user Pancake router call bypassing platform fees: separately reviewed BNB adapter, exact chain/token/factory/pool/spender/target/selector and frozen code allowlists; controlled exact allowance and callback validation; output/net-minimum and deadline binding; quote invalidation on every context or code change; no residual shared router-balance sweep, arbitrary recipients/targets/calldata, generic RWA bypass or unlimited approval. If source-level sweeps are used, isolation and post-fee net-output correctness require dedicated security review; alternatively an approved FlowBridge adapter collects fees atomically. Separate owner fee authorization and provider/issuer terms are prerequisites. **No integrator fee, 5–10 bps hypothesis or profitability is approved or applied here.** BOT Router V4 and BNB MultiSend cannot supply this adapter.

0x / 1inch / Pancake provider RFQ availability = **UNVERIFIED**: no current usable authorized provider API was available/configured, no API keys or quote requests were invented. An AMM Quoter simulation does not confer provider integration permission, RWA eligibility or bypass a permissioned RFQ restriction. Region/issuer gates remain closed.

## D / E — preview, isolation and acceptance
- Preview-only RWA route retains DEV guard, noindex/nofollow and sitemap exclusion. New read-only archived panel displays exact source/block/time, direct-pool class, both directions, five sizes, metrics and honest **Blocked / Unverified** limitations. No Buy/Swap/Approve/send control. No new content route or public endpoint. The existing leaf head has its own app-specific title/description/OG/type/twitter; no relative image social tags. No other content routes changed.
- Collector RPC method whitelist: `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode`, `eth_call`. Fixed official-domain endpoints only. Call decoding restricts factory/pool/token/quoter selectors, exact token pair and fee; quoter amounts bounded to ≤1000 USDT or ≤1 XAUt safety ceiling, positive amounts, no arbitrary price-limit/EOA/value. Send/sign/nonce/estimate methods, router calls, approvals, arbitrary tokens/endpoints and MultiSend are rejected. **Zero transactions/signatures** follows the actual call whitelist/transcript, not a fabricated mock counter.
- Existing BOT execution resolver tests continue to reject BNB 56/97; no adapter, sender, token-list import, approval or network switch was added. No rewards, contracts, ads/nav, permissions or live settings were edited. No user-specific data or new telemetry is collected.
- **Synthetic tests:** 28 new `quoteReadiness.test.ts` tests, explicitly labeled mocks/fixtures; exact identity, independent mismatches, zero liquidity, code/canonical/peer drift, metadata, timestamp freshness, invalid amounts/metrics, impact/loss/tick/gas caps, no generic targets, no sends/nonces/signatures, oversized quotes or approvals. They are not live evidence.
- **Full regression:** `bunx vitest run` **250 files / 2,586 tests PASS**.
- **Genuine browser preview:** quote panel **288**, catalog/navigation **392**, fixed-dock/nav **3,786**, page placement **560** assertions PASS = **5,026 browser assertions**. 320/390/430/1280 × light/dark × reduced/normal motion for quote/catalog; existing ad suites retain their established viewport/motion matrices and local-only fixture settings. Direction output, source disclosure, archived status, zero browser RPC, no write buttons/overflow/runtime errors, Trade selection and flat nav verified. Screenshots `/tmp/browser/rwa-quotes` visually inspected at mobile light and desktop dark. Early browser attempts saw buffered development updates; independent reruns passed without application interaction changes. No physical wallet was connected or required for the public read-only panel.
- Automatic preview compile **build OK** (latest checked 2026-11-17T06:47:00Z). Manual build/type commands were not run because the harness owns them; standalone full typecheck and final hosted production pipeline remain unverified. Existing wallet/dependency HOLD is unchanged; no dependency upgrade or advisory suppression attempted.

## Next safe gate / HOLD
**Next safe gate: read-only token implementation/transfer-restriction provenance and sustained pool-depth/finality monitoring**, plus legal/provider eligibility/integration/fee review. Determine verified proxy lineage, canonical source/artifact parity and token freeze/blacklist/FOT rules without wallet/PII probes; repeat bounded finalized-block quotes across time and adverse depth; separately decide intended launch markets, issuer/provider permission and owner-approved fee-preserving adapter design. Do not build/send a swap or activate RWA while any of these remain unknown. Physical-phone/wallet signing/rejection/receipt recovery and financial canaries require later explicit authorization; this gate does not request a transaction.

**All releases HOLD. No production publication, RWA/BNB activation, contract changes, signed transaction, funding, fees/rewards/budgets or live config changes.**
