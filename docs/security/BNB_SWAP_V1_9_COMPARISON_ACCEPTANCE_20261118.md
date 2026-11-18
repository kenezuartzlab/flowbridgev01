# FlowBridge BNB Trading V1.9 — Comparison Acceptance (2026-11-18)

**PREVIEW / READ-ONLY · PRODUCTION HOLD. No independent audit or approval.**

## Decision
All ten size/direction observations succeeded with real authenticated 0x indicative prices. **No eligible provider recommendation: 20/20 tier comparisons are FEE_UNKNOWN.** Current first-party definitions describe buyAmount as the amount bought and fees as fees to be deducted, without explicitly settling inclusion in buyAmount. Fee-excluded sell-token conversions below are average-rate approximations, not verified exact outputs. No superior-route claim or automatic fallback follows.

In this archived sample, Pancake fee500 has higher conditional net than 0x even under the fee-INCLUDED interpretation at every tested size/direction. That is research evidence, not a safe live route or permission to bypass FlowBridge fees. Some fee2500 pools lose to 0x under the included interpretation. Direct Pancake earns FlowBridge 0; 0x integrator fee is null (0 bps). Neither currently collects FlowBridge revenue.

## Scope / reproducibility
- `bun scripts/bnb-v19-comparison.ts`; `--resume` skips completed observations and preserves the 15-request cap. Ten final admin requests; ten real indicative responses; zero provider 429/timeouts in final run. One additional authenticated diagnostic /price probe succeeded. Initial ten gate failures consumed no provider calls (missing bound context); they were incorrectly labeled NETWORK_ERROR before correction.
- Restore requesting-user session with `lovable auth-session --json --self`; canonical profile wallet read with authenticated browser client is stored temporarily under `/tmp/bnb-v19/admin-context.json` and supplied only to localhost admin gate. No account, wallet, token or secret values appear in deliverables. No permission changes.
- API key remains only in existing server transport, fixed `GET https://api.0x.org/swap/allowance-holder/price`, chainId 56 and exact token/amount params. Evidence attempts contain each exact non-secret URL. No /quote or public quote service.
- Fixed assets: WBNB `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`, USDT `0x55d398326f99059fF775485246999027B3197955`, both 18 decimals; factory/pools/code/liquidity checked at a pinned block. Fees 500 and 2500 only.
- Both official RPC endpoints are the same operator, NOT independent quorum. Exact RPC requests/results are archived in evidence JSON. Honest QuoterV2 eth_call has no overrides/from/value. Only whole-router gas estimates use ephemeral balances/allowances at synthetic addresses; no approval, nonce, send or signature calls.
- Pinned before/after heads are latest minus two blocks. 0x samples its own block: no same-block capability is asserted. Before/provider/after blocks and timestamps are logged.
- Final collection: 2026-11-18T06:04:36.956Z to 2026-11-18T06:06:18.510Z; 230 recorded successful RPC calls, zero recorded RPC errors. An earlier run stopped between saved rows on a transient RPC transport interruption; resume succeeded without repeating completed provider observations.

## Conditional user-net results
Output units: USDT for WBNB-selling; WBNB for USDT-selling. Sell amount is identical across providers within each row. WBNB amount derived using that row’s same-window 1-WBNB quote. Gas subtracted once. **0x columns are hypotheses, not verified user-net quotes.**

| Direction | USDT-equivalent size | Pancake500 net | Pancake2500 net | 0x if fee included | 0x if excluded (sell fee approximate) |
|---|---:|---:|---:|---:|---:|
| WBNB->USDT | 5 | 4.995073426 | 4.986358994 | 4.989700230 | 4.982195724 |
| USDT->WBNB | 5 | 0.008427869 | 0.008406036 | 0.008414935 | 0.008402297 |
| WBNB->USDT | 25 | 24.995208355 | 24.956059726 | 24.977591209 | 24.940059232 |
| USDT->WBNB | 25 | 0.042173235 | 0.042060876 | 0.042111923 | 0.042048736 |
| WBNB->USDT | 100 | 99.995629384 | 99.801426276 | 99.910020282 | 99.759919213 |
| USDT->WBNB | 100 | 0.168716063 | 0.168305933 | 0.168501620 | 0.168248853 |
| WBNB->USDT | 500 | 499.995591930 | 498.368935731 | 499.575380710 | 498.824881442 |
| USDT->WBNB | 500 | 0.843610322 | 0.840422868 | 0.842447327 | 0.841183640 |
| WBNB->USDT | 1000 | 999.990127155 | 995.229204892 | 999.087269613 | 997.586378073 |
| USDT->WBNB | 1000 | 1.687219011 | 1.677981979 | 1.685019072 | 1.682491491 |

## Timing, gas, fees and reliability
- BSC range: before heads 134260293–134260516; real 0x blocks 134260298–134260521. 0x versus after-head difference 2–3 blocks; provider observation latency 125–135 ms. Largest evaluated provider-block age 1.620 seconds. Drift 0 bps for fee500, at most 2.07 bps for fee2500. Proposed thresholds: TTL 30s, provider latency 5s, block gap 12, observation window 15s, drift 5bps, impact 100bps. These are research proposals, not execution policy.
- Quoter inner gas is NOT whole-swap gas. Contemporary whole-router eth_estimateGas: 167611–253334 units; provider gas limits 195892–701592 units. Gas price observed 0.05 gwei for both. These are SIMULATION / PROVIDER_ESTIMATE, never receipts or realized costs. Current 0x schema permits totalNetworkFee below gas-limit×price; parser now uses reported network cost once, rejecting impossible larger BSC costs.
- Observed 0x charge: 15bps on sell USDT, or buy USDT consistent with 15bps on pre-fee output. Integrator null and gasFee null throughout. Do not infer a contractual guarantee. Provider sources vary (including Uniswap, Thena, LunarBase, Flux); no independent audit of those routes. Provider price-impact cannot be proven from stripped /price DTO; inherited diagnostic zero is an unmeasured placeholder, NOT proof of zero impact. This and fee semantics remain independent HOLD gates.
- ERC20 WBNB input/output only. Native wrapping/unwrapping and first-use approval gas overhead are excluded/unverified for BOTH sides. No native-BNB equivalence asserted.
- 5bps/10bps scenarios archived separately: output fee arithmetic only, no real commission. Adapter extra gas is UNKNOWN for this run; scenario net before unknown extra gas is not an adapter winner ranking. V1.6 untouched.
- No paid upgrade/purchase; request quota may be consumed. Entitlement and cross-isolate enforcement remain unverified; existing 15s cache, per-isolate 12/admin/min, 30/min, 2 in-flight unchanged. Collector pacing 6s, one 60s retry for 429, total cap 15.

## Changes and tests
- Pure comparisonRanking rejects stale/future/archived/reused evidence, mismatched chain/amount/direction, missing gas/provenance, impact/latency/drift failures, ambiguous fees and ties. Results contain only research candidate IDs, executable:false; not imported by trading UI.
- Hardened server input validation, streamed 200KB cap, cached block invalidation, multi-fee/unknown fee fail-close and fee-semantic UNVERIFIED projection.
- Fresh full suite before last hardening: 2863/2863, 261 files. **Final fresh full suite: 2865/2865, 261 files**, 58.69s; delta +50 vs V1.8. Includes 37 ranking +13 transport/schema/cache regressions. Checkable log in `BNB_SWAP_V1_9_FULL_TESTS_20261118.log`.
- 640 selector assertions /20 cases: 320/360/390/430/1280, dark/light, both motion modes; exact single-row 32px heading and no BNB Swap/Approve/connect-to-trade button. 3786 compact-ad/nav assertions PASS. Screenshot inspected at 390 dark reduced motion; no UI edits.
- Automatic harness build/type gate: latest build OK 2026-11-18T06:07:13Z. Separate manual build/typecheck NOT run (harness-owned); no standalone typecheck result claimed. Leaf Home/Trade metadata inspected; no content routes created or modified.
- npm audit blocked by existing launch-editor override conflict. Fresh bun audit reports **8 advisories: 2 high, 5 moderate, 1 low** (hono 5, minimatch 1, picomatch 1, zod 1); do not repeat inherited nine as a fresh count. Historical 9 remain not remediated here; no suppressions/dependency edits. Fresh audit JSON included.

## Freeze / next decision / HOLD
V1.6 source SHA256 `8ae401a74dce1e6aa7990b7fc5ca0755ac6789b14f6d087021f812f669a7a61a`; manifest SHA256 `fbed314af04ca5ccad2919631ee8947594f503f5c4307dba3542ada60839aa73`. Frozen candidate fence passes; no contract diff. Six HIGH Slither warnings stay open pending independent audit. BOT677 routing/economics/rewards untouched. BNB56 OFF, XAUt RWA BLOCKED; no registration, activation, fee recipient, funding, deployment, signing, trade or publication.

**Next decision:** obtain explicit provider fee-inclusion/exact-sell-budget semantics and legal/terms confirmation before declaring net-output winner; verify provider impact/provenance and native/approval overhead if pursuing that design. Separate independent audit, owner fee/recipient/slippage/provider choices, physical-wallet acceptance and hosted release remain HOLD. No owner approval is implicit.

First-party schema retrieved 2026-11-18: https://docs.0x.org/api-reference/evm-ap-is/swap/allowanceholder-getprice.md (buyAmount, fees, totalNetworkFee definitions). Fee inclusion is explicitly UNVERIFIED, not inferred from fixtures.
