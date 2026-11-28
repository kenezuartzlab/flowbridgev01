# CaSwap registry correction audit — 2026-11-28

**Targeted diagnostic only; base `2c59e67ee3a26e37204ef554743b85482ccc7c57`. NO live registry changes, orders, signatures, funds, public release, or AutoTrade/public/live activation.**

## Decision

The owner's supplied router is **a different CaSwap deployment**, not the previously probed router and not the router currently registered in FlowBridge V3. Its CA/caWBOT pool has substantial reserves, and the deployed V4 can execute native BOT buys/sells through it after **local-only** registration with the correct caWBOT wrapper. No replacement V4 contract is necessary for that native pair.

**DO NOT DEFAULT / DO NOT ACTIVATE:** the new factory currently sets **7,300 bps (73%) on CA→caWBOT**, 0 bps on the reverse direction; neither V3 nor V4 is fee-exempt. This is the external CaSwap fee, NOT FlowBridge's fee. The factory admin can raise directional fees up to 10,000 bps. BDEX V3 provides better sampled outputs in both directions and remains the existing default. CA/USDT via this CaSwap deployment is not currently supported atomically by deployed V4.

The previous “low CaSwap liquidity” diagnosis was correct for the **old factory/pool only**, but incorrectly generalized to CaSwap overall. This report corrects that scope; previous frozen reports and live configs are left intact.

## Pinned chain evidence

- Chain **BOT Mainnet 677**, primary `https://rpc.botchain.ai`.
- Block **31,792,262**, hash **`0x7b187dd073268ffd880c5aeefe77b333ab54ec2df94b8bcecb32b2357c568741`**, timestamp **2026-11-28 01:17:25 UTC**.
- Explorer RPC `https://scan.botchain.ai/api/eth-rpc` returned the **same block hash** and identical code for new/old routers, V3, new factory and pair. Its `eth_chainId` method failed: **UNKNOWN**, not fabricated 677. Both endpoints are BOT ecosystem-operated, not independent third-party operators.
- Pin recheck remained canonical. Pinned primary historical registry reads for four selected real V3 receipts succeeded; archive availability is proven only for those reads, not universally.
- Five explorer-verified deployed runtimes exactly match primary and explorer code hashes; this is verified-source identity, not an independent audit or a fresh compiler rebuild. Selector substring evidence alone is not ABI proof; full verified ABIs/source and successful local calls supply additional evidence.

## Exact identities

| Role | Checksummed address / fact |
|---|---|
| Supplied CaSwap router | `0xe3c1bCEF83C23331593f38B85e16Cf172C022737` — supplied EIP-55 valid, no correction required |
| New factory (`router.factory()`) | `0xD9a990Ceff16CBCc9dC0CD669fC29CDf53759E41` |
| New CA/caWBOT pair | `0xf728515430E588EEc584b76E8f2C814871c609B3` |
| Old CaSwap router | `0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD` |
| Old live factory | `0x9c937EBC3748825026677e20B13b5e306494a38d` (not historic configured `0xebb8e27312af5ef867dd481eddb74fafe75f21a2`) |
| Old CA/caWBOT pair | `0x0A0cfC8c3756D000bE19F0809A23f57522a594F6` |
| Both CaSwap routers' `WBOT()` | `0x68CAeA9104419203cF8b8f0B222E75709B97bfc6` (**caWBOT**, 18 decimals) |
| Canonical BDEX WBOT | `0xD5452816194a3784dBa983426cCe7c122F4abd30` (18 decimals) |
| CA | `0x546307af427902A75771434Df831d88219784E19` (18 decimals) |
| BOT USDT | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` (6 decimals) |
| Actual FlowBridge V3 | `0x986962de6F00D0eC571b1a34Fa70AEeB445b5445` |
| Deployed FlowBridge V4 | `0x79653140D84B78C19354ee984f236Ec92160fc61` |
| BDEX V3 router | `0x07032d47A1b9f8460cBeE9dC17c1d3E438693929` |
| BDEX V3 factory | `0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419` |
| BDEX V3 quoter | `0x034A705b36067cFF99AbF5C662BE881cbd8D0176` |
| BDEX CA/WBOT 1% pool | `0x822dc160CC971510Cf87999004a28b4A7aEFD082` |
| BDEX USDT/WBOT 0.3% pool | `0x64F418471a1A7932a190E10da5A8551dB5AbeC05` |

New router runtime keccak: `0xbd9df451990d5cea43b51429df907bb561c8df3d091230e754365eb93b0b3f25`. Old router: `0x9f2f6cc317d279510da679cdbd63493e05f0d8a34d7afc6c75889f3bbcfbc8bc`. V3: `0x30436920b0fb829855cca5bcdeadf41925318bbc5dd93ba7761434bdd3797bab`. Other exact code hashes, ABI and compiler metadata are in `detail.json` and `source-*.json`.

CaSwap new/old sources: solc **0.6.12**, optimizer 200, explorer EVM target “default”; V3: solc **0.8.20**, optimizer 200, **Paris**. V4 is the existing native-V3-multi baseline, not the older production/router-v4 candidate. Local Anvil 1.10.1 replay used **Shanghai**. No Solidity was changed/recompiled for this diagnostic.

## Live and historical registries / actual execution

V3 owner at pin: `0x628e237b73C5a37EF3968527563FA1a26b32BB97`; five entries:

| ID | Router | Type | Registered wrapper | Active |
|---|---|---|---|---|
| 0 | `0x5508Ec3006e6d82ec3A3219f9C041FFcD5791Cd3` | V2, historical CaSwap | canonical WBOT | no |
| 1 | `0xaE6ae8630f7A888dEc0B9195C85F7515d5887655` | BDex V2 | canonical WBOT | yes |
| 2 | `0x07032d47A1b9f8460cBeE9dC17c1d3E438693929` | BDEX V3 | canonical WBOT | yes |
| 3 | `0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD` | CaSwap V2 | canonical WBOT (**mismatches router's actual caWBOT**) | yes |
| 4 | `0x1414eD29FdFD322c3c0a830330ed982E2D629e76` | BDEX V2R2 | canonical WBOT | yes |

The supplied `0xe3c1…2737` is absent from V3 and V4. Historical `RouterRegistered` events include all five V3 entries and the single V4 BDEX entry; raw provenance is archived. V3 ID3 native swaps worked because its V2 branch checks only path length and forwards the caller's path to CaSwap, rather than enforcing the registry wrapper. **V4 explicitly enforces wrapper endpoints**, so copying V3's incorrect wrapper would fail.

Receipt-backed examples:
- V3 old-CaSwap CA→native transaction `0x5ac78a3e6adcde26a2a5d3974465a8cec67afb53b14980c93a986631dfedb761`, block **25,527,208**, success: ID3; actual path CA→**caWBOT**; old pair logs; historical ID3 maps to old router. Input **0.400159384061593841 CA**, output **0.463797947540501684 BOT**. This is historical depth, not current liquidity.
- Another old-CaSwap success `0x12f16dcba3a88359e67544ef15d48efa799433be8883f84d60d91019fa397528`, block **25,630,852**, same old venue/path.
- Recent V3 native buy `0x268f5f425deab18b3f507efdf55c26b1d5ed6b0691479ae31985d286d26f66ba` and CA sell `0xec6abe508d81b8fb3415e5727c0b684fffcced7e083e3aa246b997812b3b9c24` both succeed via **ID2 BDEX V3, fee tier 10,000, canonical WBOT**, not either CaSwap router.

Explorer ID3 log query returned 182 events; ID2 returned 1,000 and hit the explorer cap, **not complete history**. Selected receipt/input/historical-state/pair-emitter checks prove the reported examples; no claim of complete internal transaction tracing or all-history archive coverage.

V4 owner: `0x524Db06954de917025180057BCBeB36eC96A98c5`; **only ID0 BDEX V3 is registered**, active, canonical WBOT, router fee 1 bp. Global fee is 10 bps; a locally added entry with unset router override inherits it. V4 registry activation delay is **0 seconds**, read under its actual `registryActivationDelay()` name in supplementary evidence; unsuccessful guessed view names in earlier collector output remain explicitly UNKNOWN.

## Reserves, decimals and executable depth

Both CaSwap pairs have `token0=CA`, `token1=caWBOT`, both 18 decimals.

| Pinned pair | CA reserve | caWBOT reserve |
|---|---:|---:|
| New `0xf728…09B3` | 511,434.669547932304486769 | 387,896.799903655838997005 |
| Old `0x0A0c…94F6` | 0.000000000084038367 | 0.000016566580112457 |

**Prior low-liquidity reason:** the old `0x5b90…41AD` resolves to a different factory and dust pool. It was not a 6-versus-18 decimals error. Tiny quotes return valid integer outputs from that dust pool; treating 84,038,367 CA-wei as 84 million CA would be erroneous. New healthy reserves do not make its current sell economics acceptable.

The V1.2 caWBOT/USDT recheck also passed an undefined `(M as any).usdt` property instead of `M.usdtBot`. This was a separate diagnostic-input error, not proof of low liquidity. The present fixed-target reads use the actual BOT USDT address and return zero pairs, independently resolving that previously failed check without changing the frozen prior report/script.

Same DEX-input comparisons (excluding FlowBridge fee/gas; not total-budget execution offers):

| Input | New CaSwap quoted output | BDEX V3 quoted output |
|---|---:|---:|
| 0.1 BOT → CA | 0.131848094087619737 CA | 0.239421447458134747 CA |
| 1 BOT → CA | 1.318477881738334040 CA | 2.391996999968536525 CA |
| 5 BOT → CA | 6.592321428709001091 CA | 11.911835452268239696 CA |
| 1 CA → BOT | 0.204780956237682805 BOT | 0.409145393079193359 BOT |

CaSwap figures are pinned primary `getAmountsOut`; BDEX values are real-quoter `eth_call` on the pinned local fork, BDEX pool state untouched. New factory `pairFeeBps(CA,caWBOT)=7300`, reverse=0; `getAmountsOutForUser(..., V4)` was used for actual local execution because exemption is caller-dependent. **Minimum output and V4 `maxProtocolFee` do not cap CaSwap's independent directional fee.** Refresh fee/exemption and net quotes before any separately authorized integration.

## Wrapper and native compatibility

Both routers expose **WBOT()**, not WETH(); WETH calls revert. The standard V2 native swap selectors return `uint256[]` and work through V4, despite custom CaSwap pair `swap(...,address[2],...)` internally.

At pin, caWBOT native balance equals total supply: **400,883.946450193346163144 BOT**, with 387,896.799903655838997005 caWBOT held by the new pair. Canonical WBOT native balance also equals its total supply: **1,353,192.271384994730785042 BOT**. They are separate token contracts/pools, not interchangeable ERC20 addresses. A local 0.01 BOT deposit/withdraw round-trip succeeded and left zero wrapper residual. caWBOT explorer source verification/upgradeability remains **UNKNOWN**; observed backing plus tested behavior is not a blanket safety or custody guarantee.

## Local-only V4 replay and exact proposed registry preview

Non-executing argument record (not submitted, no calldata):

```text
chain: 677
FlowBridge V4: 0x79653140D84B78C19354ee984f236Ec92160fc61
registry function: registerRouter — onlyOwner
router: 0xe3c1bCEF83C23331593f38B85e16Cf172C022737
rtype: 0 (V2)
wrappedNative: 0x68CAeA9104419203cF8b8f0B222E75709B97bfc6
name: CaSwap V2
version: verified-0.6.12
future ID: resolve routerCount at authorized preparation; local snapshot ID was 1
activation/default: NOT AUTHORIZED; unchanged BDEX V3
fee override: NOT SET; local new entry inherited existing global 10 bps
```

Replay uses real pinned router/factory/pair/token code and state, synthetic local trader allocation and **local owner impersonation only**; no private key/signing transport, no token balance/pool/code overrides. Results:
- Four native buys (0.01/0.1/1/5 BOT net DEX input), four sells of only the CA acquired: **all eight successful**; fee charged once, quote floor satisfied.
- Example 1 BOT buy (plus existing local 0.001 BOT FlowBridge fee) received **1.318477335651243766 CA**; sell used **1.317160175475767998 CA** plus fee and returned **0.269730777534597088 BOT** before gas. Sequential local swaps slightly changed CaSwap reserves versus the original quote table. Approximately 73% round-trip loss is dominated by CaSwap's sell fee.
- Trader→V4 and V4→CaSwap CA allowances **zero** after each sell; at most **1 CA-wei** trader dust per leg from splitting acquired input+fee.
- Both V4 and CaSwap router native/CA/caWBOT/WBOT/USDT balances equal their pinned baselines after replay (**10/10 unchanged**); no residual leakage.
- Unauthorized registry insertion, four wrong-wrapper buys, eight excessive floors and unknown router ID all reverted. Wrong wrapper selector **0x87e964eb**; unknown router ID **0x57008a7a**; CaSwap high floor reverts `CASwapRouter: INSUFFICIENT_OUTPUT_AMOUNT`.
- Gas actually measured for local buys: 196,502 first / 179,426–179,438 subsequent; sells: 240,505 first / 226,835–226,854 subsequent. Local fork execution is not a live transaction or performance guarantee.

## CA/USDT and risk boundaries

New/old factories have **no CA/USDT, caWBOT/USDT or CA/canonical-WBOT pairs**. All six wrapper-bridge checks across new CaSwap, old CaSwap and BDEX V2 factories returned zero (caWBOT↔WBOT and caWBOT↔USDT). Deployed V4 `swapMultiHopSafe` is **V2-only** and does not unwrap/rewrap between token hops or combine this V2 path with BDEX V3 atomically. Local unsupported path reverted. Two separate native settlement trades would not be atomic and are not presented as a solution. Existing BDEX V3 CA→WBOT→USDT remains supported.

Neither CaSwap ABI provides `SupportingFeeOnTransferTokens` entry points. Current CA transfers passed exact-input accounting in the replay; this does **not** establish generic taxed-token support. V4 rejects non-exact transfer inputs; do not substitute incompatible selectors or arbitrary tokens.

New factory/pair source exposes privileged directional fee, exemption, LP allowlist and router controls; factory max fee is 100%, pair swaps are router-gated and locked. Current pair/factory router getters both equal the supplied router. Verified code is not maliciousness certification. V4 registration checks code presence/owner authority, not economic benevolence or all factory semantics. External admin policy changes can break execution or make output uneconomic; no default recommendation or safety waiver is inferred. No hostile-token/callback exploit campaign or new Slither review was performed for this narrow diagnostic; existing BNB six HIGH warnings and all launch holds remain untouched.

## Verification and unchanged surfaces

- **107/107 targeted tests**, five files: 26 new audit/evidence cases and existing AutoTrade 81 cases; exact output archived in `targeted-tests.txt`.
- Local replay completed without errors; mainnet writes **0**, signatures **0**.
- Preview harness's latest build signal **build OK**. No manual build/typecheck or full-app suite was run for these offline-only files.
- No application, contract, registry config, generated ABI, database, scheduler, rewards, BOT execution, WalletConnect or BNB/RWA flags changed. No UI changed; responsive/mobile acceptance was **not rerun**.
- Source hashes and deterministic evidence manifest are archived; frozen V1.13 remains unchanged.
- Internal automated diagnostic, **not an independent signed human audit**.

Evidence: `docs/security/caswap-correction/`; collectors/replay/tests: `scripts/autotrade/caswap-*`; reproduce commands and limitations: `caswap-correction/REPRODUCE.md`.

**Next gate:** resolve CaSwap's 73% external sell fee and mutable-admin risk, refresh exact code/factory/wrapper/fee/depth checks, then obtain separate registry/signer/canary authorization if a nondefault integration still has value. Until then **live/public/registry OFF and BDEX V3 default unchanged**.
