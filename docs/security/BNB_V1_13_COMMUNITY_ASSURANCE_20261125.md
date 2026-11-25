# FlowBridge BNB Swap Adapter V1.13 — Community Security Assurance (2026-11-25)

**What this is:** a transparent, low-cost *community assurance* track. The five "reviewers" below are separate AI review passes with different scopes run inside this project. **They are not an external firm, not independent human reviewers, and not a certification.** No volunteer reviewer has signed off. No paid audit was requested.

**Status: NO-GO for live BNB swaps (HOLD).** Nothing deployed, signed, funded or published. No guardian, multisig, treasury or fee chosen.

## Freeze identity
| | V1.12 (unchanged) | V1.13 (new candidate) |
|---|---|---|
| Path | `contracts/candidates/bnb-swap-adapter-v1-12/` | `contracts/candidates/bnb-swap-adapter-v1-13/` |
| Source SHA256 | `feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b` | `5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425` |
| Source Keccak | `0xb5d725ee…a8c478` | `0x16847d170cc79fbda6e428a01e0eff4d7ea8cc7ff0b7bf732d815b6956270b27` |
| Creation Keccak | `0xa6f90115…4d2f53` | `0x84b4f23b60097ccb65b0e817a703e3a0e9eee5e5426bb81e60fefd2bdb22112e` |
| Runtime Keccak (unlinked) | `0x2a612be8…1866` | `0x8410959bb5c8d0d69f4a1ab9c3c4cc9a4748e6cf35af58c73f6fa53ae059469f` |
| Compiler | solc 0.8.38, optimizer 200, cancun | same |

Runtime size unchanged (6,582 bytes); wire ABI identical. Diff: `docs/security/bnb-v113-source.diff`.

**Only source change:** the constructor rejects WBNB, USDT and the Pancake router as `guardian` **or** `feeRecipient`. Why: those contracts cannot call `setPaused`, so a guardian set to one of them would make the pause button permanently unusable. Fees sent to them could be lost or confused with protocol balances. Any ordinary address is still accepted, including a future Safe multisig, whose signers can be rotated without adding Solidity roles.

## (A) Contract security reviewer
I re-read the full V1.12 source independently instead of relying on earlier conclusions.
- **AF-01 caller-controlled quote — CONFIRMED, by design, not fixed in source.** `minNetOut`, `quotedAt` and `quoteBlockHash` come from the caller. `sqrtPriceLimitX96 = 0`. The snapshot only checks that the swap context is fresh and consistent. It is not an oracle and does not protect against MEV. The only price protection is the `minNetOut` value the user approves and signs. No quote signer was added (owner decision D-01).
- **AF-02 immutable guardian — CONFIRMED residual operational risk.** Mitigation needs no code change: use a Safe multisig as the immutable guardian so signers can rotate. If the Safe is lost, the runbook is to redeploy a new candidate. Separate pause and unpause roles were not added (D-02).
- **AF-03 dangerous fee recipient — CONFIRMED BUG, FIXED in V1.13** (plus the invalid-guardian guardrail). The differential test shows V1.12 accepts WBNB, USDT or the router as fee recipient at 0, 5 and 10 bps, and V1.13 rejects all of them.
- **AF-04 time vs block cadence — CONFIRMED, unchanged.** The 30 s age limit and the 100-block limit are both enforced, and the tighter one applies. At about 0.45 s per block, 100 blocks is roughly 45 s, so the 30 s limit usually decides. Boundary tests: 30 s is accepted and 31 s rejected; 100 blocks accepted and 101 rejected.
- **Six Slither HIGH (reentrancy-balance): STATIC ALERTS, no exploit reproduced.** The traces are the same as in V1.12 (matched by key). The balance snapshots are essential for rejecting fee-on-transfer tokens. Nothing was suppressed and all six stay OPEN.

## (B) Adversarial / fuzz reviewer
- The V1.12 85-test review suite was re-run unchanged against V1.13 (`contracts/audit/bnb-v113-community/review.v113.evm.test.ts`). Only the three AF-03 "gap" tests flipped, which is the intended result. They were inverted and joined by 3 guardian tests, 9 V1.12-vs-V1.13 differential tests (0/5/10 bps) and 1 "ordinary guardian can still pause" test.
- The V1.13 copy of the adapter suite covers 0/5/10 bps, both tiers, callbacks, false or empty ERC20 returns, blocked recipients, forced donations and 128 seeded swaps.
- Mutation testing: `mutation-results.json` and `mutation-run.log` record 15 original mutants plus M16–M18 for the new guardrail.
- **Limitations:** the mock EVM (@ethereumjs/vm) is not a BSC client. The seeded loops are deterministic, not coverage-guided fuzzing. The token callbacks are adversarial mocks; real WBNB and USDT do not call back.
- **Local Anvil fork** (local only, **not a deployment**): block 135680459, hash `0xe1377cf0…40ad5`, real WBNB/USDT/router code hashes recorded, 15 local transactions, 0 mainnet transactions. Adapter cost was +69,088 gas versus a direct Pancake swap on this sample. The single upstream RPC is not an independent quorum.

## (C) Wallet, routing and MEV reviewer
New file `src/lib/bnb/executionReviewPolicy.ts` (preview only, not imported by any page) with 15 tests:
- `BNB_EXECUTION_ENABLED = false`, and `canSign` is always `false`.
- A quote is invalidated by any change of account (compared case-insensitively), network, token, tier or amount.
- Stale-quote rules match the contract: 30 s and 100 blocks, and a quote from the same or a future block is rejected.
- Only tiers 500 and 2500. Size caps are 1 BNB and 1,000 USDT.
- `minNetOut` must be explicitly approved by the user, positive, no higher than the quote, and within a slippage ceiling of at most 100 bps (default 50).
- 0x Price is indicative only and is never used as an execution fallback.
- The policy has no calldata, spender or signing fields.
- Unchanged: the BNB execute button stays disabled, the 32px Swap header, the official BNB logo and BOT (677) swaps. No UI files were touched.
- **Residual risk:** the browser quote is not authenticated. Until a signed quote service is approved (D-01), protection depends only on the user-approved `minNetOut`.

## (D) Dependency and backend reviewer
`docs/security/bnb-v113-evidence/dependency-audit-20261125.json`:
- **Zod HIGH: UNRESOLVED.** Path: `@walletconnect/ethereum-provider` → `@reown/appkit-wallet`, which pins exactly `zod@3.22.4`. The project's own zod is the fixed 4.6.6. Forcing zod 4 into appkit would be an incompatible upgrade.
- WalletConnect is OFF on production hosts (the env flag is not set) and lazily loaded. It is ON in preview. Removing the package would clear the advisory but would remove WalletConnect entirely. That is an owner decision (D-05); injected wallets are unaffected either way.
- The dev-only minimatch advisory is still moderate and unchanged.
- `.env` was checked privately and contains only public keys and feature flags; values were not printed. Audit material is not in `public/` and is not imported by the app. The only `docs/private` reads are existing admin-gated server routes.
- Real-device wallet acceptance is still pending.

## (E) Evidence-integrity reviewer
`bun scripts/bnb-v113-evidence-integrity.mjs` recompiles the contract and checks the MANIFEST creation/runtime/source Keccaks. It also verifies:
- the V1.12 freeze hash;
- that the HIGH traces point to the V1.13 path and contain no V1.11/V1.12 text;
- that Slither found 18 issues, 6 of them HIGH;
- the fork block, block hash, code hashes and that there were 0 mainnet transactions;
- that no app or public file references V1.13.

It then rewrites `docs/security/bnb-v113-evidence/SHA256SUMS`.

Classification:
- Confirmed and fixed: AF-03 plus the guardian guardrail.
- Static alerts: 6 HIGH, 2 reentrancy-events, 4 timestamp, 2 low-level-calls, 4 naming.
- Residual operational risk: AF-01, AF-02, AF-06 (donated assets are stuck by design) and AF-07 (target upgradeability).

## Suite failures (5) resolved properly
All 5 failures were in `src/lib/securityWrites.test.ts`. They expected the old auth and validation behaviour (201/400/401/200) from `/api/proposals` and `/api/proposals/$id/vote`. Those endpoints were deliberately retired by owner directive and return 410 via `communityRetiredResponse`.

The tests now assert something stronger: for both unauthenticated **and** verified callers, every POST, every vote and GET returns 410, and the database write functions are never called. The routes were not re-enabled and the security tests were not deleted; the settings-authorization tests are unchanged.

## Exact counts
Fresh full suite: **280/280 files, 3,328/3,328 tests passed** (`bnb-v113-evidence/full-suite.log`; previously 3,135/3,140). V1.13 review+adapter+V1.12 review: 264/264. Mutation: **18/18 killed** (15 original + 3 new). BNB policy/fence: 195/195. Slither 0.11.5: V1.12 = 18 (6 HIGH), V1.13 = 18 (6 HIGH).

## Owner decision matrix
| ID | Decision | Default |
|---|---|---|
| D-01 | Signed quote issuer / oracle | Not built |
| D-02 | Separate pause/unpause roles | Not added; use a Safe as guardian |
| D-03 | Real fee recipient and fee bps | Not chosen |
| D-04 | Tighter block-lag constant | Unchanged |
| D-05 | Remove WalletConnect to clear Zod HIGH | Kept |

## Backlog / GO-NO-GO
**NO-GO for live trading.** Before any GO:
- Volunteer or professional reviewer sign-off on the V1.13 hash, under controlled private access and with no publication.
- Owner decisions D-01 through D-05.
- Safe guardian address and runbook.
- Zod resolution or the D-05 decision.
- Real-device wallet tests.
- Separately authorized deployment.

Any source change after this freeze invalidates it.
