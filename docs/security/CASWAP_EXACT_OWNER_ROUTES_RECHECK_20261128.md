# Exact owner routes: fresh read-only recheck — 2026-11-28

**No mainnet writes, signatures, live registry changes, production changes or publication. Previous audit `5c222b7f` is preserved. This is an internal automated diagnostic, not a certified/external human audit.**

## Decision and exact mapping

Keep the existing **FlowBridge V4 ID0 → BDEX V3** route. Never assign the owner's `0x64F4…eC05` pool to the old CaSwap router: it is **USDT/canonical WBOT, not CA/BOT**. The alternative CaSwap pool is real and deep but has a **73% CA sell fee**, so depth does not justify making it the default.

| Exact address | Proven identity at the pin |
|---|---|
| `0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD` | Old CaSwap V2 router; immutable factory `0x9c937EBC3748825026677e20B13b5e306494a38d`; `WBOT()` is **caWBOT** `0x68CAeA9104419203cF8b8f0B222E75709B97bfc6` |
| `0x64F418471a1A7932a190E10da5A8551dB5AbeC05` | BDEX **V3** pool: `token0=0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` (**USDT, 6 decimals**), `token1=0xD5452816194a3784dBa983426cCe7c122F4abd30` (**canonical WBOT, 18 decimals**); factory `0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419`; `fee()=3000` (**0.3%**) |
| `0xe3c1bCEF83C23331593f38B85e16Cf172C022737` | Alternative CaSwap V2 router; factory `0xD9a990Ceff16CBCc9dC0CD669fC29CDf53759E41`; `WBOT()` is the same separate **caWBOT** |
| `0xf728515430E588EEc584b76E8f2C814871c609B3` | Genuine alternative **CA/caWBOT** V2 pair: `token0=0x546307af427902A75771434Df831d88219784E19` (**CA, 18 decimals**), `token1=0x68CAeA9104419203cF8b8f0B222E75709B97bfc6` (**18 decimals**); factory matches the alternative router |
| `0x822dc160CC971510Cf87999004a28b4A7aEFD082` | Actual BDEX **CA/canonical WBOT V3 pool**, same BDEX factory; `token0=CA`, `token1=canonical WBOT`, `fee()=10000` (**1%**) |

Both BDEX identities are independently obtained through their pool getters **and** the factory's exact `getPool(tokens,fee)` results. Old factory `getPair(USDT,canonical WBOT)` is zero, and its CA/canonical-WBOT and CA/USDT pairs are also zero. The old router cannot address a foreign V3 LP by supplying its address to a V2 path.

## Fresh pin and completeness

- BOT Mainnet **677**, block **31,793,279**, hash **`0xee9bbb333335be54df5b523e9bfbdfd84efccf2b5a369b07ff6227b79492f4b0`**, timestamp **2026-11-28 01:30:08 UTC**.
- Primary `https://rpc.botchain.ai` and explorer RPC `https://scan.botchain.ai/api/eth-rpc` agree on the block hash and the seven target runtimes. They are **not independent operators**; explorer `eth_chainId` fails and is recorded UNKNOWN.
- Registration receipts plus historical-at-registration factory/runtime reads corroborate all five V3 entries. Explorer event inventory is an indexed response, not proof of all-history completeness. Verified source runtime matches are not a fresh compiler rebuild.
- Complete bounded `allPairs` enumeration at this pin: old factory **1**, historical factory **2**, R2 factory **87**, alternative factory **1**. V3 factory uses tier-specific `getPool`, not `allPairs`. No exhaustive arbitrary-depth multi-hop search is claimed.

## Every V3 registry venue and historical factories

Actual FlowBridge V3 is `0x986962de6F00D0eC571b1a34Fa70AEeB445b5445`; V4 is `0x79653140D84B78C19354ee984f236Ec92160fc61`.

| V3 ID / active | Router | Factory / CA routing conclusion |
|---|---|---|
| 0 / **no** | `0x5508Ec3006e6d82ec3A3219f9C041FFcD5791Cd3` | Historical CaSwap factory `0xEBb8E27312AF5eF867dD481EDdb74fAfE75F21A2`; actual wrapper getter is `WDO()=caWBOT`, not WETH/WBOT. Its CA pair is `0xAF05f84820288e2bd39E427AeF09b274056733d8`, reserves **1.842936886016997232 CA / 2.421151007012888625 caWBOT**, directional sell fee **500 bps (5%)**, V4 not whitelisted. This is a different, disabled router, not an alternate pool callable by `0x5b90…41AD`. |
| 1 / **yes** | `0xaE6ae8630f7A888dEc0B9195C85F7515d5887655` | Verified **UniversalRouter**, incorrectly classified as ordinary V2 in the registry. No factory/WETH/getAmountsOut/native-V2 swap selectors. Constructor records internal V2 factory `0x117115f3B72C8d1989178089A67D0C26f8EE0AA3` and V3 factory `0x1C51…5419`; this does **not** make V3/V4's standard V2 dispatcher compatible. Caller-scoped reads revert; **incompatible, not a liquidity conclusion**. No correction was applied. |
| 2 / **yes** | `0x07032d47A1b9f8460cBeE9dC17c1d3E438693929` | BDEX V3, factory `0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419`; CA/WBOT 1% remains the eligible sampled route. |
| 3 / **yes** | `0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD` | Actual immutable factory `0x9c937EBC3748825026677e20B13b5e306494a38d` at registration **and now**; sole CA pair `0x0A0cfC8c3756D000bE19F0809A23f57522a594F6` has **0.000000000084038367 CA / 0.000016566580112457 caWBOT**. Complete enumeration proves no alternate CA pool in this factory. Registry canonical-WBOT entry still mismatches actual caWBOT. |
| 4 / **yes** | `0x1414eD29FdFD322c3c0a830330ed982E2D629e76` | Ordinary BDEX V2R2, factory `0x117115f3B72C8d1989178089A67D0C26f8EE0AA3`. No direct CA/WBOT or CA/USDT pair. CA/intermediate pool `0xA8EE5bDFB9eF9FE5aAf503f1C826783e88B3B38F` joins WBOT via `0x73507206933aa21B567263F8ea00FEf5063E97AC`; intermediate `0xf6c9D3ccbda48d36731190929842d7CaDce98313`. Bounded native two-hop quotes are lower than BDEX V3 at all sampled budgets; no integration authority inferred. |

Thus the earlier dust finding is **real reserve depletion in the old router's own immutable factory**, not a USDT/CA decimals error and not evidence against every CaSwap deployment. Historical factory `0xEBb8…21A2` belongs to ID0, not a mutable/alternate factory of ID3.

## Fees, caller exemptions and economic suitability

| Venue | Buy / sell external fee | Actual V4 surcharge in comparison | Mutable risk |
|---|---|---|---|
| Old CaSwap | **0 / 3000 bps (30%)** | Local-only new entry inherits existing **10 bps**, charged on input in addition to swap amount | Factory admin controls directional fees/exemptions; current maximum **3000 bps** |
| Alternative CaSwap | **0 / 7300 bps (73%)** | Same existing inherited **10 bps** | Factory admin can raise directional fee to **10000 bps (100%)** and alter fee receiver/exemptions |
| Existing V4 BDEX V3 ID0 | CA/WBOT pool **10000 units (1%)** both ways | Actual ID0 override **1 bp**; global remains **10 bps** | Existing protocol fee/governance stays unchanged |

Both old/new CaSwap factories have `feeExemptOn=true`, but both **V3 and actual V4 are not exempt**. Quotes use `getAmountsOutForUser(...,V4)`; native execution uses that same V4 caller. A user's whitelist status does not waive fees for V4. The common CaSwap fee admin is `0xc2634355B7450dC50F65125858c0f0A868d60335`; verified runtime/source shows privileged controls, not economic benevolence or key-custody assurance. The new router's factory/wrapper are immutable and factory router setup is one-time; do not describe that setter as freely mutable. Fee/exemption/LP policies remain mutable.

Before price impact and gas, effective input-budget drag is about **0.0999001% buy / 30.0699301% sell** for old CaSwap, **0.0999001% buy / 73.0269730% sell** for the alternative, and **1.0098990%** for BDEX's CA/WBOT 1% plus actual V4 surcharge. These are separated from output quotes, not additional charges. `maxProtocolFee` caps FlowBridge's fee, not CaSwap's fee; an output floor alone is not an external-fee policy cap.

## Other BDEX tier and CA/USDT

CA/WBOT **0.3%** pool `0x04A3511051a45543CFb5175f2fA6774a54BF0029` also exists, but has **zero current liquidity**, only **0.251584208611696727 CA and 1 WBOT-wei** in token balances. Its buy quoter can cross into a tiny remaining range and saturates near **0.251129455985861634 CA**; sell probes revert **SPL**. A positive one-sided quote does not establish complete input consumption or two-sided execution eligibility. 100/500 fee-tier pools are zero. The balanced 1% pool is the sampled two-sided choice.

**Yes: BDEX CA/USDT uses the owner's `0x64F4…eC05` pool as the USDT/WBOT leg**, not as the CA pool:

```text
CA → [0x822dc160CC971510Cf87999004a28b4A7aEFD082, 1%] → canonical WBOT
   → [0x64F418471a1A7932a190E10da5A8551dB5AbeC05, 0.3%] → USDT
USDT → same two pools in reverse → CA
```

Use existing **V4 `swapV3MultiSafe`, ID0**, encoded fees **10000 / 3000**, reversed for USDT→CA. FlowBridge charges its fee **once**, not twice. External pool-fee retention before impact is `0.99 × 0.997`, not a fee on caWBOT. Neither old/new CaSwap has CA/USDT, caWBOT/USDT or a caWBOT/canonical-WBOT joining pair; do not substitute wrappers or invent an atomic mixed route.

## Execution verification

Replay **COMPLETE**, no errors: **24 native trades plus 6 atomic CA/USDT trades**, with quotes exactly matching received output. V4 input fees were charged once; native-leg user/router allowances cleared; selected V4/BDEX/both-CaSwap native and token balances had no residual changes. The six direct R2 attempts failed quoting because the direct pair is absent; its valid intermediate path executed separately. UniversalRouter remained incompatible. The failed two-sided 0.3% CA tier was not rehearsed as an eligible trade. All registrations and funding were confined to the disposable fork; no keys, signatures, token/pool/code overrides or mainnet sends.

Equal **total input budgets**, including actual V4 fee; outputs below are rounded for readability (exact integers in `fork.json`):

| Total budget / direction | Existing BDEX V3 1% | Old CaSwap | Alternative CaSwap | R2 via intermediate |
|---|---:|---:|---:|---:|
| 0.1 BOT → CA | 0.237332159508 | 0.000000000084024433 | 0.131709474568 | 0.232226135820 |
| 1 BOT → CA | 2.371200674813 | 0.000000000084036973 | 1.317091692888 | 1.405450826131 |
| 5 BOT → CA | 11.809100220760 | 0.000000000084038088 | 6.585390625544 | 2.551068457382 |
| 1 CA → BOT | 0.412670849647 | 0.000016566580110466 | 0.204587102251 | 0.300643246328 |
| 10 CA → BOT | 4.111312018550 | 0.000016566580112257 | 2.045861311392 | 0.960583755966 |
| 100 CA → BOT | 39.597253768152 | 0.000016566580112437 | 20.457642052511 | 1.230743699400 |

BDEX wins **all six equal-budget comparisons**, including R2's valid two-hop path. Native sell outputs also exceed alternatives after subtracting each swap's measured BOT gas cost. Example old 1-CA sell: output **0.000016566580110466 BOT**, swap gas **0.000263294 BOT**, net **−0.000246727419889534 BOT** even before approval gas. Buy gas cannot be converted to CA without a separately chosen price, so it is not silently deducted from CA output; all quoted outputs exclude gas. Fork gas prices/timings are not live guarantees.

Atomic V4 ID0 results, with both exact pool emitters verified in every receipt:

| Total input budget | Net received |
|---|---:|
| 1 / 10 / 100 CA → USDT | 5.255066 / 52.354588 / 504.241236 USDT |
| 1 / 5 / 10 USDT → CA | 0.185260250821126441 / 0.926013324200134474 / 1.851308533030915520 CA |

**122/122 focused tests pass (6 files)**, including exact mapping, fee math, immutable factories, caller exemptions, equal-budget ranking, all 30 successful executions and transport restrictions. Final pin recheck is canonical. Latest preview signal: **build OK**; full-app suite, manual typecheck and UI/device tests were not rerun for this offline-only diagnostic. Existing BNB/AutoTrade/public/security holds remain unchanged. No production registry change is needed for the eligible BDEX routes.

Evidence and reproducibility: `docs/security/caswap-route-recheck/REPRODUCE.md`, `live.json`, `supplement.json`, `tiers.json`, verified-source archives and `fork.json`; collectors are offline `scripts/autotrade/caswap-route-recheck*`. No UI, scheduler, database, rewards, BNB candidate, execution flag, default, signer or published app was changed. Future fees, liquidity, governance changes and unrelated security holds are not waived.