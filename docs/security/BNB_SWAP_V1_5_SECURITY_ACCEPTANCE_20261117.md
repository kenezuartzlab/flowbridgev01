# FlowBridge BNB V1.5 — Security hardening and adversarial validation (automated review)

Date: 2026-11-17 · Base: c3806c62 · Status: **HOLD — NO-GO for deployment**.
**This is an automated, AI-performed review. It is NOT an independent professional audit and must not be presented as one.**

## Candidate decision
- V1.4 (`contracts/candidates/bnb-swap-adapter-v1`) remains frozen and unedited (source keccak `0x06f90355…a173`, pinned by tests).
- New working candidate **V1.5** at `contracts/candidates/bnb-swap-adapter-v1-5/` — MANIFEST: source `0xc0cbca86…fa66`, creation `0x7bd56c2e…2009`, unlinked runtime `0x6498e5aa…45a7`, 5,564 bytes, solc 0.8.20, opt 200, paris. ABI/creation hash parity tested.
- Not deployed, not registered, no fee/recipient configured; fenced by `src/lib/bnb/adapterCandidateFence.test.ts`.

## Findings
| ID | Sev | Title | Status |
|---|---|---|---|
| F-1 | **MED** | V1.4 paid the USDT→BNB fee with a native `call` to `FEE_RECIPIENT`. The constructor only checks the recipient has no code *at deploy*; on BSC an EOA can later gain code (EIP-7702 delegation). A rejecting or gas-burning recipient would revert **every** USDT→BNB swap (DoS) and could grief gas. Reproduced in test `FINDING F-1 (V1.4)`. | **Fixed in V1.5**: fee paid as WBNB via ERC-20 transfer (no recipient code runs); only `netOut` is unwrapped. Tests: rejecting and infinite-loop recipient code both cannot block swaps. |
| F-2 | LOW (design) | Unsolicited balances (forced native via selfdestruct/coinbase, donated USDT/WBNB) are permanently unrecoverable. | **Accepted**. Per-call before/after deltas mean donations never block swaps and are never paid to the next user (tested with 7 BNB, 2 WBNB, 3 USDT donated). Options considered: privileged sweep (rejected — creates an admin power over the contract), bounded recovery to a fixed address (rejected — still a privileged path, little value), hard rejection (impossible for ERC-20 transfers/forced native). |
| F-3 | INFO→MED context | Pancake SwapRouter `refundETH/unwrapWETH9/sweepToken` are public; surplus `msg.value` left in the router is takeable by anyone (live simulation: 0.005 BNB surplus call succeeds, residue stays). | Not applicable to candidate: adapter wraps exactly `msg.value` itself and calls the router with value 0. Any future direct-router UI path must use multicall + `refundETH` or be forbidden. |
| F-4 | LOW | Fee rounds down; dust trades pay zero fee. | Accepted: user always receives full net; gas cost ≫ fee lost. |
| F-5 | LOW | Pinned solc 0.8.20 has known bugs (VerbatimInvalidDeduplication, FullInliner…, MissingSideEffectsOnSelectorAccess). None of the triggering features (verbatim, custom optimizer sequences, side-effecting selector access) are used. | Recommend recompiling with a current 0.8.x before external audit (would create a V1.6 candidate). |
| F-6 | INFO | Slither 0.11.6 `reentrancy-balance` ×6 (rated High by tool). | **Triaged false positive**: all external calls target immutable WBNB/USDT/router; adapter is lock-guarded; balance deltas use strict equality so any mid-call change reverts (fail-closed), never pays out. Router/token reentrancy tested. |
| F-7 | INFO | Slither timestamp/low-level-call/naming. | Expected (deadline checks; checked low-level calls; immutables in caps). |
| T-1 | Test defect (V1.4) | V1.4 test "unexpected native from router" overwrote the router account, wiping its code, so it passed vacuously. | Fixed in V1.5 tests (account balance modified in place; asserts bubbled revert data). V1.4 test left frozen. |
| MEV | MED (inherent) | Sandwich/front-run between quote and inclusion. | Contract enforces the user's `minNetOut` after fee; test shows 60 bps adverse move reverts with full refund, 40 bps passes at 50 bps tolerance. Protection depends on UI quote freshness (60 s TTL) and slippage defaults — not yet designed/approved. |

No HIGH contract vulnerability found by this automated review; that does not imply none exist.

## Adversarial tests (local EVM, chainId 56, mocks — not mainnet proof)
V1.5 suite: **35 tests PASS** — 25 ported V1.4 cases + F-1 reproduction on V1.4 + F-1 fix (rejecting / gas-burning recipient code) + forced native & ERC-20 donations + custom-error bubbling + sandwich/drift tolerance + seeded fuzz (120 random size/rate/direction runs: net+fee=gross, exact fee, zero residual delta, zero allowances) + 10 repeated swaps under monotonic drift + dust fee rounding + local gas bound (149,134 with mock router, informative only) + V1.4 frozen / V1.5 manifest/ABI parity.
Fence: 4 tests. V1.4 suite: 25 tests unchanged.
Not covered: true mainnet fork execution (no trustworthy local fork node available), formal verification, Foundry invariant campaigns, Mythril/Echidna.

## Mainnet read-only simulation (production RPC, separate from mocks)
`BNB_SWAP_V1_5_NATIVE_RPC_EVIDENCE_20261117.json` — 36 calls (11 failures, all intended negative cases), `eth_call`/`eth_estimateGas` with ephemeral overrides on synthetic addresses only; nothing broadcast or signed.
Block **134110697** `0x80c14d32…5820`, **2026-11-17T11:22:00Z**, peer and final hash equal (same operator, not independent).
- Live bytecode = Sourcify-verified bytecode for WBNB, USDT, SwapRouter; router `WETH9()` = WBNB; deposit/withdraw semantics confirmed.
- Direct router 0.01 BNB → **5.906915275001778263 USDT**.
- V1.5 10 bps net **5.901008359726776485** / 5 bps **5.903961817364277374** — exact router gross minus fee. 10 USDT → **0.016895469284157723 / 0.016903925474990635 BNB**.
- min = exact net passes; exact net + 1 wei reverts; min = gross, expired, +10,000 s deadline, unknown selector revert.
- Gas estimate: adapter **282,802** vs direct router native **187,810** → ≈ **95k extra gas** (one estimate, cold state; gas price not measured, so USD cost UNKNOWN).

## Economic viability (indicative, not approved)
At 0.01 BNB (~5.9 USDT) the 10 bps fee is ~0.0059 USDT; the ~95k extra gas cost depends on BSC gas price (not measured) and may be comparable to the fee at small sizes, so small swaps may cost users more than a direct Pancake swap. A fee-collecting design that strands no user funds is feasible with this adapter pattern (atomic, per-call deltas, no custody). 0x affiliate-fee route remains UNVERIFIED (no key/plan/terms). No fee or recipient approved or configured.

## Risk register (unresolved)
| Risk | Sev | Owner action |
|---|---|---|
| No professional independent audit | HIGH | Commission audit (checklist below) |
| USDT issuer `mint` power / peg / issuer legal | MED | Issuer & legal review |
| XAUt freeze (`addToBlockedList`), `destroyBlockedFunds`, upgradeable proxy, RWA eligibility | HIGH | Remains BLOCKED; candidate cannot route XAUt (immutables) |
| MEV/slippage defaults & quote TTL UI | MED | Approve slippage policy before any UI |
| Gas overhead vs fee at small sizes | MED | Measure gas price and decide minimum size |
| Liquidity depth over hours/days, independent RPC | MED | Further observation |
| Fee recipient custody on chain 56 | MED | Owner chooses address |
| Compiler version F-5 | LOW | Recompile as V1.6 before audit |
| Physical-wallet signing flow, inherited dependency advisories | MED | Separate gates |

## Go / no-go owner approvals required (none given)
1. Commission independent audit of V1.5 (or V1.6 after compiler bump). 2. Fee bps (5/10) and recipient. 3. Provider (Pancake direct vs 0x). 4. Slippage/TTL policy. 5. Funded testnet/fork rehearsal authorization. 6. Mainnet deployment authorization. 7. Legal sign-off. Until all: **NO-GO**.

## Reproducible third-party audit checklist
- [ ] Compile `contracts/candidates/bnb-swap-adapter-v1-5` with MANIFEST settings; verify source/creation hashes.
- [ ] Review: lock, chainid, deadline window, exact approve + allowance clear, balance-delta equalities, net minimum, WBNB fee path, `receive` restriction, no admin.
- [ ] Run `bunx vitest run contracts/candidates/bnb-swap-adapter-v1-5`; extend with Foundry fork tests against BSC at a pinned block.
- [ ] Run Slither/Mythril/Echidna; triage reentrancy-balance.
- [ ] Re-run `bun scripts/bnb-v15-native-acceptance.ts`; confirm code hashes vs Sourcify.
- [ ] Assess EIP-7702, USDT owner powers, router public sweep functions, MEV.

## Verification
- Full suite: **2,714 tests PASS** after fixing one fence false-positive (AGENTS.md mention); 256 files
- Swap selector browser regression (320/360/390/430/1280 × light/dark × motion, exact 32px heading, nav): **640 assertions / 20 cases PASS**
- No UI change. Standalone type-check/hosted pipeline harness-owned, UNVERIFIED here.
