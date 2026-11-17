# FlowBridge BNB Trading V1.6 — Candidate Validation and Compiler Hardening (2026-11-17)

**Status: PRODUCTION HOLD. Local candidate only — NOT deployed, NOT audited, NOT registered, NOT callable by the app.**
This is automated, self-performed review. It is **not** an independent professional audit.

Base head: `7ec36b84`. No transactions, signatures, deployments, publishes, fee/reward/budget changes were made.

## 1. Test-count discrepancy (V1.5) — resolved by fresh run
| Run | Command | Result | Log |
|---|---|---|---|
| Baseline at 7ec36b84 (before any V1.6 change) | `bunx vitest run` | **256 files / 2,714 tests passed, 0 failed, exit 0** | `BNB_SWAP_V1_6_FULL_SUITE_BASELINE_20261117.log` |
| After V1.6 changes | `bunx vitest run` | **257 files / 2,757 tests passed, 0 failed, exit 0** | `BNB_SWAP_V1_6_FULL_SUITE_20261117.log` |

The V1.5 report's "2,714 PASS" is now confirmed by a full independent run; the V1.5 chat summary (2,713 + 1 failing) described the run *before* the fence-test fix. Delta +43 = 42 V1.6 candidate tests + 1 fence test.

## 2. Compiler choice
| Field | V1.5 (frozen) | V1.6 |
|---|---|---|
| solc | 0.8.20+commit.a1b79de6 | **0.8.38+commit.1835d247** (npm `latest`, pinned devDependency `solc-0.8.38`) |
| optimizer | 200 | 200 |
| evmVersion | paris | **cancun** (pinned explicitly; compiler default not used) |
| sourceKeccak | 0xc0cbca86…fa66 | 0xad34078ce1fb1f6d4f31d723d3dfc17dc356ff2bb7e7c3f316f484ca9adf4242 |
| creationBytecodeKeccak | 0x7bd56c2e…2009 | 0xa56d2cbf2e1ba1b966fa6fd03ad90d054feac768a77bd7d7cb200a63a252156c |
| unlinkedRuntimeKeccak | 0x6498e5aa…45a7 | 0x0505aee00187004bf97ee4b58ddd6d0b2d7f628a11a35c81016cb11c8b2dab0a |
| runtime bytes | 5,564 | 5,446 |
| ABI | — | identical to V1.5 (test-enforced) |

EVM target compatibility: BNB Chain activated Shanghai/Cancun-equivalent opcodes in earlier hardforks; this was **verified, not assumed**, by an `eth_call` probe at block 134112945 executing PUSH0, TSTORE, TLOAD and MCOPY on a synthetic override address — returned the expected word. `prague`/`osaka` targets were not chosen because no V1.6 code needs them and their BNB support was not probed. Source diff vs V1.5: pragma, contract name, two comment lines only.

## 3. Static analysis (Slither 0.11.6, fresh)
`slither <file> --solc-args "--optimize --optimize-runs 200 --evm-version cancun"` → `BNB_SWAP_V1_6_SLITHER_20261117.json` (21 results); V1.5 rerun → `…_RERUN_V1_5_…json` (22). The only removed item is `solc-version` (known compiler bugs) — fixed by 0.8.38.

| # | Detector (tool impact) | Function | Balance read → external call → use | Adversarial trace / test | Disposition |
|---|---|---|---|---|---|
| R1 | reentrancy-balance (High) | swapExactBnbForUsdt | wbnbBefore → WBNB.deposit → delta != amountIn | WBNB is immutable, verified code (hash matched live); deposit makes no external call. Extra balance can only make the strict `!=` revert. | No exploit found. **OPEN – pending independent audit** |
| R2 | reentrancy-balance (High) | swapExactBnbForUsdt | usdtBefore → deposit → got != gross | Same; USDT is plain BEP20 (no hooks) | No exploit found. **OPEN – pending audit** |
| R3 | reentrancy-balance (High) | swapExactBnbForUsdt | usdtBefore → router.exactInputSingle → got != gross | Router callback re-entry test (mode 9) records exact `Reentrancy` selector; outer swap settles exactly; overpaying router rejected | No exploit found. **OPEN – pending audit** |
| R4 | reentrancy-balance (High) | swapExactUsdtForBnb | usdtBefore → USDT.transferFrom → delta != amountIn | Fee-on-transfer rejected (test); no hooks in USDT | No exploit found. **OPEN – pending audit** |
| R5 | reentrancy-balance (High) | swapExactUsdtForBnb | wbnbBefore → transferFrom → delta != gross | Same | No exploit found. **OPEN – pending audit** |
| R6 | reentrancy-balance (High) | swapExactUsdtForBnb | wbnbBefore → router → delta != gross | Payout receive-hook re-entry test (ReentrantUser) rejected with `Reentrancy`; balances exact | No exploit found. **OPEN – pending audit** |
| — | reentrancy-events (Low) ×2 | both | event after calls | Informational | Accepted |
| — | timestamp (Low) ×4 | deadline checks | bounded ≤120 s window | Validator skew ≈ seconds | Accepted |
| — | low-level-calls, naming (Info) | | | | Accepted |

Reasoning common to R1–R6: all six "before" values are intentional per-call snapshots; every entry point holds the `locked` guard, `receive` accepts only WBNB, all targets are constructor-fixed. A third party adding balance mid-call can only trigger a fail-closed revert (griefing requires one of the fixed contracts to call out). This is **not conclusive proof**: it relies on WBNB/USDT/router behaviour staying as verified (USDT is owned; its code is not upgradeable, but issuer powers remain). The tool's HIGH label is therefore kept open until a third-party audit.

## 4. Tests (local in-memory EVM, chainId 56, MOCK tokens/router — not mainnet proof)
`bunx vitest run contracts/candidates/bnb-swap-adapter-v1-6` → **42/42 passed**. 35 ported from V1.5 plus 7 new: router callback re-entry (selector-exact), payout receive-hook re-entry, 20 alternating swaps with unsolicited dust (allowance 0, dust untouched, lock released), failed native payout reverts everything, router under-pull/over-pay rejected, gas grief by fee recipient code (EIP-7702-style) on both directions, runtime contains no SELFDESTRUCT/DELEGATECALL/CALLCODE. Fence: `src/lib/bnb/adapterCandidateFence.test.ts` 5/5 (V1.4 and V1.5 hashes pinned, V1.6 manifest, no app/production references, providers expose no calldata/spender/signer).
Local mock gas BNB→USDT: 148,447 (V1.5: 149,134) — informative only.

## 5. Read-only chain evidence — evidence classes
| Class | Done? |
|---|---|
| Isolated local mocks | Yes (§4) |
| `eth_call` / `eth_estimateGas` with state overrides on synthetic addresses, official BNB RPC, pinned block | Yes — `BNB_SWAP_V1_6_NATIVE_RPC_EVIDENCE_20261117.json` |
| Local fork with real deployment | **No** (no verifiable fork available; eth_call override ≠ deployment behaviour) |
| Mainnet transactions | **NONE** |

Block 134112945 (11:38:52Z), peer endpoint same hash (same operator — not an independent quorum). 37 calls, 11 intended failures. WBNB/USDT/router code hashes match Sourcify. Router direct 0.01 BNB → 5.92304 USDT; V1.6 net 5.917115363812891094 (10 bps) / 5.920076883013998647 (5 bps), exact match; 10 USDT → 0.016849478 / 0.016857911 BNB; min = exact net passes, +1 wei rejected; expired/too-far deadline and unknown selector rejected.
Gas (measured estimate): adapter 282,089 vs direct router 187,814 (≈ +94,275). Fee spread at 10 bps on 0.01 BNB ≈ 0.0059 USDT; extra-gas cost in BNB depends on gas price at execution time — **not measured**, so net economics vs direct Pancake/aggregators remain UNKNOWN. 0x terms UNVERIFIED. No fee decision made.

## 6. Restrictions re-verified
XAUt stays BLOCKED (RWA panel check 288 assertions PASS; no XAUt path in candidate). No candidate ABI imported into app code (fence). BNB execution remains disabled. No new route, flag, registry or production contract.
Preview-only wallet peer shim (vite.config.ts): in all builds it replaces only four uninstalled optional connector packages with a module that **throws on load** — fails closed, provides no fake provider or signing surface.

## 7. Release checks (exact)
| Check | Command | Result |
|---|---|---|
| Full suite | `bunx vitest run` | 2,757/2,757 pass |
| Type check | `tsgo -b --noEmit` | exit 0, no output |
| Build | preview build log | build OK |
| Swap header/selector | `python3 scripts/swap-chain-selector-check.py` | PASS 640 / 20 cases (320/360/390/430/1280) |
| Nav/ad dock | `python3 scripts/compact-ad-fixed-check.py` | 3,786 PASS |
| RWA panel | `python3 scripts/rwa-quote-panel-check.py` | 288 PASS |
| Dependency scan | platform dependency scan | **9 open advisories**: high zod via @walletconnect/ethereum-provider; moderate hono ×4 via @lovable.dev/mcp-js and ×4 via accounts. Not changed this gate. |
| Hosted release pipeline | — | NOT RUN (not available from sandbox) |
| Physical wallet | — | NOT RUN |

## 8. Risk register (open)
HIGH: no independent professional audit; Slither R1–R6 open pending audit; XAUt freeze/destroy/upgrade + RWA eligibility (blocked).
MEDIUM: USDT issuer mint/owner powers and legal review; slippage/expiry policy; gas overhead economics unknown; dependency advisories (zod high); single RPC operator; no fork-deployment evidence; liquidity history UNKNOWN (non-archive).
LOW: dust fee rounds to zero; donated tokens permanently stuck (no sweep by design).

## 9. Third-party audit checklist
1. Reproduce bytecode: `node contracts/candidates/bnb-swap-adapter-v1-6/scripts/compile.mjs`, compare MANIFEST hashes. 2. Review R1–R6 traces. 3. Confirm no privileged/sweep surface. 4. Verify fee-in-WBNB settlement and net-minimum logic. 5. Fork-test against real PancakeSwap V3 pool with deployment. 6. Review USDT owner powers and router public refund/sweep functions. 7. Confirm BNB Chain hardfork supports `cancun` at deployment date. 8. Gas/economics at real gas prices.

## 10. Owner/provider decisions required (none taken)
Audit firm & scope; fee rate (5 or 10 bps proposal) and fee recipient; slippage/deadline policy; provider choice (Pancake direct vs aggregator); funded rehearsal; deployment authorization; legal sign-off. **HOLD remains.**
