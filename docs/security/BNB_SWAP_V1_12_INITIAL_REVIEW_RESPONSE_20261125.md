# FlowBridge BNB Swap Adapter V1.12 — Initial Review Response (test/evidence only)

Date: 2026-11-25 · Status: **PRIVATE · LOCAL-ONLY · NOT DEPLOYED · NOT INDEPENDENTLY AUDITED · RELEASE HOLD**

Responds to the preliminary review "FlowBridge BNB Swap Adapter V1.12: Auditor-Ready Findings, Threat Model Coverage and Test Gaps" (2026-11-23).
This is a self-review response. It is **not** an independent audit. No firm has been engaged, nothing was sent to a third party, and no auditor has signed anything.

## Source freeze: unchanged

| Item | Value |
|---|---|
| Path | `contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol` |
| SHA256 | `feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b` (re-verified; unchanged) |
| Anchor commit | `582e43ee77d03e43ff2c1f358b0f6a140720ccc7` |
| Compiler | solc 0.8.38, optimizer 200, evm `cancun` |
| Solidity edits in this response | **None.** No V1.13 was created. Source changes below are owner-decision proposals only. |

There is no BNB mainnet adapter address or deployment transaction in project manifests or evidence. All fork transactions below are local Anvil only.

## Disposition of reviewer findings

| ID | Reviewer | Our check | Disposition |
|---|---|---|---|
| AF-01 | Med | Confirmed. `minNetOut`, `quotedAt` and `quoteBlockHash` come from the caller, and `sqrtPriceLimitX96 = 0`. Fork evidence: after a 200 BNB price move, the stale and the refreshed snapshot both revert because the **net floor** is too high. A fresh snapshot is not price protection. | **Agree.** This is not an oracle. Owner decision D-01. No public swap button. |
| AF-02 | Med | Confirmed. `GUARDIAN` is immutable, one role does both pause and unpause, and it cannot be rotated. | **Agree.** Owner decision D-02. |
| AF-03 | Low/Med | **Confirmed code gap.** Tests show the constructor accepts a fee recipient equal to WBNB, USDT or ROUTER. Fees sent to the token contracts are stuck. The Pancake router has public refund and sweep functions, so anyone could take fees sent there. | **Agree.** Owner decision D-03 (V1.13 patch). V1.12 is unchanged. |
| AF-04 | Low | Measured read-only: average 0.450 s per block over 100, 1,000 and 10,000 blocks; 66 blocks fit in 30 s; 100 blocks ≈ 45 s. At this speed the 30 s age limit is the one that applies first. If blocks get faster than 0.3 s, the 100-block limit becomes stricter. | **Agree.** Owner decision D-04. |
| AF-05 | Info | `q.user`, chain, router and `quotedAt` are checked against `msg.sender`, the constant chain and the router, and capped by `block.timestamp`. Nothing is authenticated. | Agree. Documented. |
| AF-06 | Info | TG-10: donated WBNB, USDT and forced BNB (including 100 WBNB, 1,000 USDT and 50 BNB) stay at their starting amounts across swaps and can never be recovered. | Agree. Intentional, now stated plainly. |
| AF-07 | Info | Token and router code was matched only by fork bytecode hash. XAUt is a proxy and USDT has an owner mint. We did no independent proxy or permission audit. | Agree. Stays open for the auditor. |
| AF-08 | Minor | (a) The allowance reset before `revert AllowanceNotCleared` is dead code because the revert undoes it. (b) The `Swapped` event has no fee tier (TG-09 asserts this). (c) Size caps and `.code` checks exist only at construction. | Agree. Future source choice only. |
| EV-01 | Med | **Confirmed mismatch.** `high-trace-review.json` contained V1.11 text. | **Fixed** (see below). |
| EV-02 | — | The packet builder read an untracked `/tmp` file. | **Fixed.** It now reads tracked, timestamped evidence with the lockfile hash. Fork provenance was added. |
| EV-03 | — | `.env` is tracked. We checked key names only and printed no values: just the backend URL, project ID, publishable key and three feature flags. No secrets were found, so no key rotation is needed. `&1` was a stray npm-notice output file. | `&1` untracked and deleted. `.env` is guarded by a test. Audit trees are not under `public/` and not imported by the app. |

### Disputes and nuances
- **TG-06 blockhash 256 bound.** No snapshot can reach it, because `MAX_BLOCK_LAG = 100` rejects first. We still test block number − 257, which is rejected with `BadSnapshot` by the lag check. The 256 window is therefore only defense-in-depth.
- **TG-04 overflow.** `minNetOut = type(uint256).max` fails closed with `Panic(0x11)`, not a custom error, and leaves nothing behind. It is safe but not descriptive.
- **Check order.** Snapshot checks run before the deadline check, so a stale snapshot with an expired deadline reports `BadSnapshot`, not `Expired`. A test asserts this.
- **Guardian = fee recipient.** V1.12 allows it (test TG-07). This is a policy question, not approval.

## EV-01 correction
- `scripts/bnb-v112-high-traces.mjs` rebuilds `docs/security/bnb-v112-evidence/high-trace-review.json` from `slither-after.json`.
- It fails on any V1.11 text, wrong path, offset/line drift or an expression missing from its cited line, and it requires `_grossMinimum(minNetOut)` to be present.
- Each finding's previous explanation is matched by (function, external call, balance variable), **not by position**. Slither's order differs between runs; matching by position would have attached the wrong explanation to four of the six traces.
- The before traces are kept separately as `high-trace-before-v111.json`, labeled V1.11.
- `contracts/audit/bnb-v112-review/evidence.test.ts` checks that every cited line matches the frozen source.

**Slither 0.11.5, fresh rerun (2026-11-25):** 18 findings, identical IDs to `slither-after.json`.
- 6 HIGH reentrancy-balance: **OPEN, waiting for the independent auditor**
- 4 LOW timestamp
- 2 LOW reentrancy-events
- 6 informational
- 0 suppressed

**Before / after:** V1.11 had 18 findings (6 HIGH). V1.12 has 18 (6 HIGH). The count did not change.

## Test gaps closed (mock EVM, `contracts/audit/bnb-v112-review/review.evm.test.ts`, 85 tests)
These run on `@ethereumjs/vm` with mock WBNB, USDT and router. This is **not a BSC client and not the real contracts.** Each test checks the exact error code (selector).

- TG-01: `minNetOut = 0` in both directions → `BadAmount`.
- TG-02: `msg.value` off by ±1 → `BadSnapshot`. Sending BNB to the USDT-input swap (which takes no BNB) → empty revert.
- TG-03: 0 and 10 bps, both directions: exact user, treasury and leftover balances. Fee dust rounds to zero.
- TG-04: 120 seeded nets across 0/5/10 bps. The router floor is the smallest gross that still yields the net. net=1 → 1. net=MAX → `Panic(0x11)`.
- TG-05: 26-row table with exact `BadSnapshot`/`BadAmount` codes, including USDT-direction token variants and XAUt. Chain 677 → `WrongChain`.
- TG-06: these limits pass:
  - deadline = now and now+120
  - quotedAt = now and now−30
  - block = current−1 and current−100

  These fail: deadline now−1 → `Expired`, now+121 → `DeadlineTooFar`, quotedAt −31 and blocks −101/−257 → `BadSnapshot`. Block hashes are unique per block number.
- TG-07: fee recipient = the adapter's own address → `BadConfig`. Guardian = fee recipient is allowed. Missing WBNB/USDT/ROUTER code → `BadConfig`. Fee recipient = WBNB/USDT/ROUTER is **accepted (AF-03 gap)**.
- TG-08: a router callback trying USDT→BNB or `setPaused` → `Reentrancy`. A guardian contract that receives the payout cannot pause mid-swap. Extra BNB refunds → `UnexpectedNative`.
- TG-09: every field of `Swapped` and `PauseChanged` checked. The event has no tier field.
- TG-10: WBNB, large and repeated donations keep an exact starting baseline.
- TG-11: 600 seeded mixed operations (valid swaps, reverting snapshots, pause/unpause, donations). Leftover balances, allowances and user/treasury amounts hold throughout. Mock only.
- TG-12 (mock part): the adapter's `receive()` fits the 2,300-gas limit. A contract recipient that needs more than 2,300 gas gets the full payout.
- TG-13: **15/15 hand-written source mutants killed** (`docs/security/bnb-v112-review-evidence/mutation-results.json`). They cover: `minNetOut == 0` in each direction, value/amount mismatch, deadline (3), quote age (2), block lag (2), blockhash binding, fee recipient = this, a non-minimal floor, the one-wei V1.11 floor and the pause event. Mutants were written only to `/tmp`; the frozen file was hash-checked before and after.

## TG-12 local fork (`scripts/bnb-v112-review-fork.ts` → `docs/security/bnb-v112-review-evidence/fork-review.json`)
Local Anvil (Foundry 1.7.1) fork of BSC at head−20, using the real WBNB, USDT and Pancake V3 code. It talks to one official read-only RPC (single operator, not a quorum) and needs no archive data. Anvil is not a BSC validator client.

- **Quoter parity:** the quoter's gross equals the adapter's measured gross **exactly** for tiers 500 and 2500 in both directions.
- **Price move:** a 200 BNB swap moved 0.01 BNB output from 5.3169 to 5.2885 USDT. The pending swap reverted and the user's balance did not change.
- **Pool depth (thin 2500 pool):** at the 1 BNB cap, price impact is 0 bps on tier 500 vs 26 bps on tier 2500. Tier 2500 liquidity is about 1/200 of tier 500.
- **2,300-gas limit:** the real `WBNB.withdraw` payout to the adapter succeeded.
- **After all swaps:** the adapter holds zero BNB, WBNB and USDT.
- **Contract recipient:** tested on the mock only.

## Owner decision matrix (source changes — none taken)

| # | Decision | Options | Effect |
|---|---|---|---|
| D-01 (AF-01) | Quote/price protection | (a) Keep the caller floor; the app builds `minNetOut` from a quoter reading plus an owner-chosen slippage, shown on the review screen. (b) Add a signed quote from a server key (new key handling, new candidate). (c) Add `sqrtPriceLimitX96` (new candidate). | (a) changes no source but needs app work and an approved slippage. (b)/(c) need V1.13 and re-audit. |
| D-02 (AF-02) | Guardian model | (a) Guardian is a Safe multisig, plus a redeploy runbook if the key is lost. (b) V1.13 with separate pause and unpause roles. (c) V1.13 with a rotatable guardian (adds an admin surface). | (a) changes no source. (b)/(c) need re-audit. No addresses chosen. |
| D-03 (AF-03) | Fee recipient checks | V1.13: also reject WBNB, USDT and ROUTER as recipient; optionally require `guardian != feeRecipient`. Check the real token blocklists before calling payouts permanent. | New frozen candidate, new hashes, re-audit. |
| D-04 (AF-04) | Freshness limits | Keep 30 s / 100 blocks, or change to a time-only limit or a different block lag. | Only matters if blocks get faster than 0.3 s; any change needs re-audit. |

Any source change creates a new version (V1.13), cancels this freeze and needs auditor review again.

## Dependencies (fresh `bun audit`, lockfile hash recorded)
- **Zod 3.22.4 (HIGH, production):** comes in through `@walletconnect/ethereum-provider` 2.23.10. The only fix is Zod 4.6.6, a major upgrade, so there is no compatible override. **Unresolved.**
- **minimatch (moderate, development tools only):** **Unresolved.**
- Nothing was suppressed or overridden.

## Private packet
`contracts/audit/bnb-v112-external/submission/` was rebuilt with the review tests, the evidence above and this report. `INTEGRITY.json`/`SHA256SUMS` were recalculated; evidence changed, the source freeze did not. The packet stays private: not under `public/`, not served by the app, not sent anywhere.

## Verification and HOLD
Verification counts are in `docs/security/bnb-v112-review-evidence/verification.json`.

Still on HOLD:
- independent signed audit
- six HIGH traces
- D-01…D-04
- fee rate and recipient
- tests with real phone wallets
- Zod
- legal

There is no deployment, signing, mainnet transaction, fee activation, BNB or RWA trading, publication or auditor engagement.
