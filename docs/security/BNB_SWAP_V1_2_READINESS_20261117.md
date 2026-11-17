# BNB Swap V1.2 — read-only route feasibility

17 November 2026 UTC · PREVIEW ONLY · HOLD · BNB execution OFF

## Result / boundaries
Selector acceptance completed first against f1b3a8c3ecde0ea2cf48c8af4f2a0556d31f30a6: 2,590 tests and 640 browser assertions passed. Final source tightens heading checks to **exactly 32px** and waits for settled Radix focus restoration. Final suite **252 files / 2,633 tests PASS**, including **43 synthetic BNB adapter tests**. No competitor superiority claimed.

The same Swap UI now has development-only compact **Quote readiness · Unverified** inspection inside its existing BNB unavailable form. Pair/provider choices are popovers, not extra heading rows. No fresh provider observation is supplied to the UI, so outputs are dashes, never old XAUt amounts or invented rates. BNB/USDT explicitly means **WBNB pool research**, not a native-BNB execution/wrapping promise. The original 32px heading, 48px heading-to-form offset, standard flat nav and docked ads remain unchanged. The BNB card can hold one compact inspection trigger; expanded information overlays rather than expanding the form. No Buy/Swap/Approve control.

## Interface and isolation
- `src/lib/bnb/quoteAdapter.ts`: fixed chain 56, registry IDs WBNB/USDT/XAUt, exact observed decimals 18/18/6; approved observation pairs only. Registry is separate from all executable token lists. No address imports or URL inputs.
- Providers are separated: PancakeSwap V3 **AMM simulation**, 0x **Aggregation**, PancakeSwapX **RFQ**. Only fixed official-operator RPCs are configured for local AMM collection; no REST transport configured for the other providers. API/key/permission unavailable = UNVERIFIED, not fallback to generic RWA trading.
- Deterministic UNVERIFIED / BLOCKED / STALE / READ_ONLY_QUOTE states. Freshness proposal inherited from V1.1: 60-second observation TTL and 30-second block-age cap; future/malformed timestamps rejected. Archived always STALE even if timestamps are close. Every request binds chain/provider/pair/token IDs/base-unit amount/context generation. Context and route changes invalidate old results; switching away unmounts and resets inspection.
- Exact observed pool/fee allowlist plus factory/chain/code/decimals/peer/canonical/active-liquidity evidence required. Booleans describe collector evidence, not independent authorization or cryptographic provenance; no untrusted network payload is ingested by the browser. Fresh simulation remains executionEnabled=false. No calldata, spender, allowance, signature, account, nonce or transaction fields.
- RWA gate always BLOCKED for XAUt, including AMM simulation and aggregation/RFQ providers. No self-attestation or collection of user location/identity. BOT 677/968 execution untouched; BNB 56/97 rejected by existing execution/V4 resolvers; MultiSend is not an adapter.

## Genuine RPC evidence — distinct from synthetic tests
Two same-operator official-domain endpoints, not independent security quorum. Fixed local scripts only, no client RPC/server API/key. **132 genuine RPC reads total**, all eth_chainId/eth_blockNumber/eth_getBlockByNumber/eth_getCode/eth_call. No transaction, signature, wallet or nonce request. Runtime code bytes/hashes and raw read results archived, not claimed verified-source deployment parity.

### Core WBNB/USDT
`bun scripts/bnb-route-acceptance.ts /tmp/bnb-v12/core-rpc.json`

Archive: `BNB_SWAP_V1_2_CORE_RPC_EVIDENCE_20261117.json`, 66 calls. Block **134091383**, hash `0x94046f8c0af213fa742a5ebf475828d4b782857e6dbe82bf1d738ce9cc36f03e`, block time **08:57:05Z**, collection **08:57:06.658Z**, fresh at completion only.

Fixed official Pancake V2 router `WETH()` corroborated WBNB `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`; both endpoints matched token code/18-decimal WBNB and USDT metadata. Router receives WETH read/code observation only, never execution. Factory getPool(WBNB,USDT,500/2500) found:

| Pool | Fee | 25 USDT → WBNB | Matched WBNB → USDT | Quoter gas buy/sell | Indicative round-trip loss |
|---|---:|---:|---:|---:|---:|
| 0x36696169C63e42cd08ce11f5deeBbCeBae652050 | 500 (0.05%) | 0.042210089116686699 | 24.974991444182365933 | 115793 / 115405 | 10.0034223271 bps |
| 0x1401ff943D08a7E098328C1d3a9d388923B115D2 | 2500 (0.25%) | 0.042084363084438915 | 24.871694504250297285 | 124922 / 124499 | 51.3221982999 bps |

Both endpoints matched factory, token0 USDT/token1 WBNB, fee, spacing 10/50, positive liquidity, unlocked slot0 and runtime fingerprints. Each quote crossed one initialized tick. Final pinned hash reread matched. At this size/block, 500-tier gives more output/lower quoter gas; **not global best route**, sustained depth, executable gas, finality or profitability proof. Native wrapping, other AMMs/hops and pool-concentration history not tested. Dynamic collector target is restricted to the return of fixed official factory/exact-token/fee calls, then peer/identity verified before quotes. The display interface further pins the observed exact pools.

### XAUt refresh
`bun scripts/rwa-pool-acceptance.ts /tmp/bnb-v12/xaut-rpc.json`

Archive: `BNB_SWAP_V1_2_XAUT_RPC_EVIDENCE_20261117.json`, 66 reads / 20 quoter calls. Block **134091104**, hash `0xc3617fa4772bc0557f2dfd5c52550558b22407557b9aed3e0275a30c46045e1a`, time **08:54:59Z**, collection **08:55:01.521Z**, fresh at completion only. Same exact V1.1 pool/factory/fee/tokens, matching peer/code/metadata/canonical observations.

| USDT size | USDT → XAUt | Matched XAUt → USDT | Indicative loss bps |
|---:|---:|---:|---:|
|5|0.001294|4.990287337636728625|19.4253247265|
|25|0.006474|24.970664277943702488|11.7342888225|
|100|0.025896|99.893189429407648401|10.6810570592|
|500|0.129477|499.420631448128043284|11.5873710374|
|1000|0.258937|998.711224954366090887|12.8877504563|

All two-way/exact-output probes succeeded; full gas/tick/code/raw results in archive. Separate pinned simulations start from original state, **not sequential altered-state round-trip**. USDT amounts not guaranteed USD; instantaneous pool rate not underlying gold value. Loss excludes gas/platform fees. V1.1 archived UI snapshot intentionally unchanged and permanently not fresh. All current UI outputs remain unavailable.

## Sources / provider and fee feasibility
`BNB_SWAP_V1_2_SOURCE_ARCHIVE_20261117.json` retains fetched public responses; retrieval around 08:53–08:55Z, exact chain timestamps above. References:
- https://developer.pancakeswap.finance/contracts/v3/addresses — factory/quoter/router roles confirmed.
- https://developer.pancakeswap.finance/contracts/v2/addresses — BSC router identity used for WETH observation; page does not itself list WBNB, on-chain read supplies corroboration.
- https://docs.0x.org/ and https://docs.0x.org/evm/0x-swap-api/guides/monetize-your-app-using-swap — current docs describe swapFeeRecipient/swapFeeBps/swapFeePpm/swapFeeToken and integrator-fee response; docs advertise affiliate fees on pricing plans, surplus custom-plan constraints. **No actual API entitlement, BNB pair support, quote, limits, price, SLA or contract target verified.** No paid/keyless request attempted.
- https://docs.pancakeswap.finance/trade/pancakeswapx — returned 404; RFQ service endpoint/access/current integration terms **UNVERIFIED**. No guessed API or scraped quote. Classification is deliberately distinct from AMM, not a claim of current accessible service.
- V1.1 acceptance contains official Quoter tuple and router fee-sweep source review; mutable source is not deployed artifact parity.

**Owner fee proposal — not implemented/approved:** evaluate transparent **5 and 10 bps** scenarios only after authorized same-block/provider net-output comparison, provider pricing/rate limits, native wrapping/gas, token restrictions and legal eligibility. For illustration only at 25 USDT those nominal rates represent 0.0125 / 0.025 USDT before costs (not actual platform charges/net quote). Retain FlowBridge-owned fee-preserving adapter boundary; never send directly through Pancake router to bypass platform fees. No approved BNB fee recipient/rate/contract. Fee-sweep shared-balance risks, callbacks, exact allowance, post-fee minimum, deadline, chain/pool/code allowlist and no arbitrary calldata need separate security review. 0x fee fields are documentation feasibility only; no positive-slippage capture proposal or profitability claim.

## Acceptance / missing signals
- **2,633 tests / 252 files PASS**, 43 synthetic adapter tests; mocks do not establish live observations.
- **640 selector + 320 BNB inspection + 3,786 dock/nav + 560 placement = 5,306 browser assertions PASS.** Selector/BNB matrix: 320/360/390/430/1280 × light/dark × normal/reduced motion; exact 32px heading, draft reset, keyboard focus, provider/pair switching and reset, zero output/financial controls/browser provider RPC/overflow/runtime errors. Ad regressions use actual components with local-only fixture configs, not saved production settings.
- Focus assertion initially raced Radix close autofocus; checker now waits for the actual focused trigger, then asserts it. One rerun also encountered development navigation-context disposal; final independent 20-case run passed. No interaction bug hidden by forced clicks.
- Screenshots under `/tmp/browser/chain-selector` and `/tmp/browser/bnb-inspection`; mobile light RFQ and desktop/mobile dark views visually inspected. They are temporary, not durable user attachments.
- Automatic preview compile signal checked: **build OK**. Manual full project build/typecheck not run: harness owns those commands. Separate standalone type status and hosted production pipeline **UNVERIFIED**, not asserted passed. Dependencies unchanged; inherited advisory/security HOLD unchanged.
- Changed existing content routes inspected (Trade/RWA and index already have unique title/description/OG/type/twitter). No new route/public sitemap item/head image or public endpoint.

## Next safe gate / blockers
1. Read-only time-series finalized-block depth/tick concentration, reorg/provider independence, frozen code/source/proxy lineage and token transfer restrictions (pause/freeze/blacklist/FOT), USDT behavior/peg; native BNB wrap feasibility.
2. Provider-approved integration agreements, exact documented endpoints and chain/pair availability, API access permissions, quotas/costs/rate-limit/cancellation/error policy; compare genuine contemporaneous net outputs, not marketing claims.
3. Per-RWA issuer identity, legal/region eligibility and market-hours/provider rules, restrictions enforced beyond UI. No generic path bypass. No issuance/pool funding/mint-redemption marketplace.
4. Explicit owner BNB fee approval and separately audited frozen fee-preserving adapter/allowances/callbacks/net-minimum/deadline. BOT V4 and MultiSend cannot substitute.
5. Physical-device/wallet connected-network rejection, signing/rejection/recovery/receipts and separately authorized financial canary; dependency/security and hosted full type/build/release acceptance.

No writes to backend/live configuration, contracts, roles, budget, rewards or fees; no secrets, signature, approval, swap, deployment or publication. **All release and financial gates remain HOLD.**