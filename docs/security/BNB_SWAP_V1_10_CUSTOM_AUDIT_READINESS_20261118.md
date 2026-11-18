# FlowBridge BNB Trading V1.10 — Custom Execution Architecture Freeze & Audit Readiness (2026-11-18)

**Status: `OWNER_PREFERRED_ARCHITECTURE_PENDING_APPROVALS` · PREVIEW / LOCAL EVIDENCE ONLY · PRODUCTION HOLD.**
**Independent third-party audit: NOT DONE. Not deployed, not production-approved, not registered, not callable by the app.**

Base head: `c80730312f822c50d8b1ac944078b8d71a419c07`. The owner selected a FlowBridge-owned custom adapter as the primary prospective BNB architecture. This records preference only: no 5/10 bps fee, recipient, signing, funding, deployment, publication, BNB trading or RWA activation is approved. Existing BOT Chain 677 execution/rewards are unchanged. The authenticated 0x `/price` integration remains admin-only, read-only diagnostics; it is not a production route or readiness claim. XAUt remains BLOCKED.

## 1. Frozen review target and reproducible handoff

V1.6 was not edited. No V1.10 contract was created because pool/pause scope needs an owner/auditor decision first.

| Field | Reproduced value |
|---|---|
| Source | `contracts/candidates/bnb-swap-adapter-v1-6/FlowBridgeBnbSwapAdapterV1_6.sol` |
| Source SHA-256 | `8ae401a74dce1e6aa7990b7fc5ca0755ac6789b14f6d087021f812f669a7a61a` |
| Manifest SHA-256 | `fbed314af04ca5ccad2919631ee8947594f503f5c4307dba3542ada60839aa73` |
| Source Keccak | `0xad34078ce1fb1f6d4f31d723d3dfc17dc356ff2bb7e7c3f316f484ca9adf4242` |
| Creation bytecode Keccak | `0xa56d2cbf2e1ba1b966fa6fd03ad90d054feac768a77bd7d7cb200a63a252156c` |
| Unlinked runtime Keccak | `0x0505aee00187004bf97ee4b58ddd6d0b2d7f628a11a35c81016cb11c8b2dab0a` |
| Compiler / target | solc `0.8.38+commit.1835d247.Emscripten.clang`, optimizer 200, `cancun` |
| Runtime / ABI | 5,446 bytes; 29 ABI entries; immutables require constructor patching |
| Expected targets | Chain 56; WBNB `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`; USDT `0x55d398326f99059fF775485246999027B3197955`; router `0x1b81D678ffb9C0263b24A97847620C99d213eB14` |
| Constructor policy | Pool tier 500 or 2500; fee recipient UNAPPROVED; 5/10 bps PROPOSAL ONLY |

`BNB_SWAP_V1_10_AUDITOR_HANDOFF_20261118.json` contains the complete one-source Standard JSON closure, exact source, ABI, creation/unlinked runtime bytecode, immutable references, per-file SHA-256 hashes, all static traces, fork evidence, launch gates and 14-item risk register. Core SHA-256: `555c29ce5c1c7e8b23b39b231ee1b1966855b8b9299bae09412970a2d30b9308`.

Reproduce with `bun scripts/bnb-v110-audit-package.ts`. Its four tests recompile and compare every frozen identity. The strict fence rejects any candidate reference from `src` or `contracts/production`; research metadata lives under `contracts/audit/bnb-v110`.

## 2. Source safety review and invariants

- Only two non-view entry points exist. No owner, upgrade, delegatecall, arbitrary call, sweep, pause, recipient override or generic token path. Recipient is always `msg.sender`; constructor and both entry points enforce chain 56.
- BNB→USDT wraps BNB inside the adapter through WBNB. USDT→BNB pays the proposed fee in WBNB and unwraps only net output. Router native refund/unwrap/sweep residue functions are never used.
- Exact per-swap approvals are required to return to zero. Balance deltas reject fee-on-transfer, under/over-reporting and unexpected output. `netOut = grossOut - floor(grossOut × feeBps / 10000)` and `minNetOut` is enforced after the fee. Router minimum 1 is safe only because the adapter performs this final net check.
- Reentrancy lock covers every external call. Direct native is accepted only from WBNB; failed native payout reverts the whole transaction. MEV/slippage/TTL/max-size policy is not owner-approved; candidate ceilings are 1 BNB / 1,000 USDT and deadline window 120 seconds.
- Donated USDT/WBNB and forced native are excluded from per-call deltas and **permanently unrecoverable**. Dust fee rounds down to zero. USDT issuer/owner powers and legal terms remain external risks.
- No on-chain pause exists. A UI kill switch cannot stop direct calls. Because settlement is atomic and the contract does not custody proceeds between transactions, no-pause removes admin capture but also removes emergency interruption. A guardian pause with immutable emergency roles is a different trust design and, if selected, must be a new separately frozen/audited candidate.

## 3. Fresh Slither: all six HIGH traces remain open

Fresh Slither 0.11.5 / solc 0.8.38: 21 results = **6 High reentrancy-balance, 2 Low reentrancy-events, 4 Low timestamp, 2 Informational low-level-calls, 7 Informational naming**. Raw output: `BNB_SWAP_V1_10_SLITHER_20261118.json`.

| ID | Exact trace | Automated evidence | Disposition |
|---|---|---|---|
| S1 | `swapExactBnbForUsdt`: `_swap` after `usdtBefore`, then `got != gross` | Router callback re-entry rejected; exact settlement | OPEN — external auditor |
| S2 | same function: WBNB `deposit` after `usdtBefore`, then output check | Verified WBNB has no callback; unexpected delta reverts | OPEN — external auditor |
| S3 | `swapExactUsdtForBnb`: `_swap` after `wbnbBefore`, then WBNB delta vs gross | Router/payout re-entry tests; exact residual | OPEN — external auditor |
| S4 | same function: USDT `transferFrom` after `usdtBefore`, then input delta check | Fee-on-transfer and false returns rejected | OPEN — external auditor |
| S5 | same function: USDT `transferFrom` after `wbnbBefore`, then router output check | Malicious router and receive-hook tests | OPEN — external auditor |
| S6 | BNB→USDT: WBNB `deposit` after `wbnbBefore`, then wrap delta check | Verified WBNB behavior; forced/donated balances isolated | OPEN — external auditor |

Automated triage found no fund-loss path, worst observed malicious callback outcome was safe revert, but this is **not** an audit or a reason to lower the tool severity. Events-after-calls, timestamp and low-level-call informational findings are documented for auditor review, not silently suppressed.

## 4. Real-bytecode local fork rehearsal — PASS, not mainnet proof

Command: `nix shell nixpkgs#foundry -c bun scripts/bnb-v110-fork-rehearsal.ts`. Anvil 1.7.1 forked official BNB RPC at block **134281222**, deployed V1.6 only to `127.0.0.1`, and used unlocked synthetic accounts/storage. Seven local transactions; zero keys, signatures, mainnet sends, real approvals or real fees. Upstream is not an independent quorum.

Real code matched archived identities: WBNB `0xb7d84205…f6`, USDT `0x97a48aa4…4a59`, router `0x61002a11…cda`. Evidence: `BNB_SWAP_V1_10_FORK_REHEARSAL_20261118.json`.

| Check | Observed result |
|---|---|
| Same-state 0.001 BNB direct vs 5-bps proposal adapter | Direct 0.592227572753632595 USDT; adapter net 0.591931458967255779; proposal fee 0.000296113786376816; exact parity |
| Receipt gas | Direct 160,094; adapter 223,387; **+63,293 gas** this local run |
| 5 USDT→native | Gross 0.008434259301292353 BNB; WBNB fee 0.00004217129650646; native net 0.008430042171641707 |
| Settlement | Zero native/WBNB/USDT residual and zero router allowances |
| Safety | Exact net accepted, +1 wei rejected; real pool move made stale minimum revert; expired/far deadlines revert |
| Isolation | Other wallet could not spend user allowance; no `pause()` entry; donations/forced native stayed stranded |

Two setup issues were corrected transparently: a non-guaranteed-empty test fee address caused constructor revert; Anvil snapshot IDs are single-use. Neither involved mainnet activity. Earlier synthetic `eth_call` overrides remain a different evidence class and were not relabeled as deployment.

## 5. Expanded adversarial properties

Existing V1.6: 42 tests. New audit-only suite: six tests including **256 seeded two-wallet fuzz runs** with alternating directions, random rates and donated WBNB/USDT dust. Assertions cover exact net+fee, caller-only proceeds, zero residual delta, zero allowance, exact-minimum boundaries, cross-wallet rejection, post-deployment wrong-chain calls, full revert refunds and absence of privileged/generic functions. Targeted new architecture/economics/handoff suites: 18 tests total; all pass.

## 6. Pool-choice design question — unresolved before launch

V1.6 pins one `POOL_FEE`; it **cannot** dynamically choose the better verified 500/2500 pool. V1.9 showed pool tier can dominate adapter fee/gas, so “custom” must not be described as dynamic-best routing.

Options for owner/auditor scope:
1. Audit V1.6 as a single-tier primitive and accept that route limitation.
2. Use two separately deployed/verified instances and bind each quote/review to the exact adapter address, tier and minimum. This needs new operational/security review and separate deployment authorization.
3. Create a new dual-tier candidate accepting only 500/2500 with per-quote tier selection and the same net-minimum/residual fences. This is new contract code requiring full analysis and independent audit.

No option is activated. Guardian pause may be combined only with an explicitly selected new candidate scope; V1.6 remains immutable.

## 7. Economics disclosure

Direct Pancake has zero FlowBridge platform fee and earns FlowBridge nothing. Custom revenue is only hypothetical until exact fee and treasury are approved. The pure `customRouteCost` helper discloses `feeOutput + extraGasUnits × gasPrice × outputPerBnb`, excluding common direct-swap gas exactly once; it is not imported by execution UI.

Earlier V1.6 simulation estimated +94,275 gas; at 0.05 gwei and 594.28 USDT/BNB this is about 0.0028 USDT incremental gas. Thus 5 bps proposed fee plus gas was approximately 5.02–10.60 bps over direct for sampled 5–1,000 USDT sizes; 10 bps was 10.02–15.60 bps. Fresh local fork receipts measured +63,293 under different conditions. Neither is a gas guarantee. V1.9's conditional Pancake500 net exceeded 0x in the archived sample, but all 20 rankings stayed FEE_UNKNOWN. Owner preference resolves architecture direction, not those measurement caveats.

## 8. Launch gating matrix

Only source-freeze evidence is complete. **All other gates remain HOLD:** independent audit/fix re-audit; pool design; exact fee/treasury; governance/pause; slippage/TTL/size/MEV; issuer/legal/liquidity/independent RPC; dependencies; physical-wallet plus authorized rehearsal; separately authorized chain-56 deployment/multisig/canary. The machine-readable matrix is in `contracts/audit/bnb-v110/customArchitecture.ts` and the auditor handoff.

Fresh production dependency scan: **12 rows — 4 high, 8 moderate** (picomatch through TanStack/WalletConnect, Zod through WalletConnect, Hono through mcp-js/accounts). No dependency edits or suppressions were made. Historical bun-audit counts are not substituted for this fresh result.

## 9. Final verification

| Check | Exact observed result |
|---|---|
| Full suite | **265 files / 2,883 tests passed, 0 failed**, 46.12s; `BNB_SWAP_V1_10_FULL_TESTS_20261118.log` |
| Intermediate isolation run | 2,882 passed / 1 failed because research metadata referenced candidate from `src`; moved to audit-only area and final clean run above |
| Frozen candidate + fence baseline | 47/47 pass |
| New focused suites | 18/18 pass, including 256 fuzz cases and four handoff reproduction tests |
| Swap header/mobile | 640 assertions / 20 cases PASS at 320/360/390/430/1280, dark/light, both motion modes; exact 32px single-line header |
| Flat nav/compact ads | 3,786 assertions PASS |
| RWA | 288 assertions PASS; XAUt BLOCKED |
| Automatic preview build/type gate | Latest observed `build OK`; no standalone manual build/typecheck claimed |
| Physical wallet / hosted release pipeline | NOT RUN |
| UI/routes | No UI, route, confirmation, navigation or metadata changes; BNB Swap CTA remains DISABLED |

## 10. Risk register and next human approval

Open HIGH risks: no external audit/six traces; pool design; no pause emergency policy; fee/treasury unset; MEV/execution policy; XAUt remains BLOCKED; dependencies; physical wallets/rehearsal; deployment/canary. Medium/low and accepted design limits remain in the handoff risk register; none is represented as closed by this document.

**Next approval:** choose single-tier/two-instance/new-dual-tier and no-pause/guardian-pause audit scope, then engage an independent auditor. Fee, treasury, signing, funded rehearsal, deployment and publication require separate later owner approvals. See `BNB_SWAP_V1_10_OWNER_DECISION_MATRIX_20261118.md`.
