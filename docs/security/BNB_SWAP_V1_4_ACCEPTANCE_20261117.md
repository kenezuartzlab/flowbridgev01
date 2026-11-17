# FlowBridge BNB V1.4 — Pre-deployment safety candidate + read-only native BNB feasibility

Date: 2026-11-17 · Base: fe1325f3 · Status: **HOLD** (preview only; nothing deployed, approved, activated or published)

## Result summary
| Area | Result |
|---|---|
| 1. Native BNB ↔ WBNB and Pancake V3 native path (mainnet read-only simulation) | **PASS (simulation)** at one block; not a transaction |
| 2. Verified-source token review | USDT/WBNB source-verified, no transfer fee/pause/blacklist in source → **candidate-eligible, not approved**; XAUt **BLOCKED** (blocklist + upgradeable) |
| 3. Solidity fee-preserving candidate | **Built locally, 25/25 synthetic adversarial tests PASS**; not deployed, not audited, not registered |
| 4. Owner decision sheet | `BNB_SWAP_V1_4_OWNER_DECISION_SHEET_20261117.md` (information only) |
| 5. UI | **No UI change**; 32px Swap heading, flat nav and docked ads untouched |
| 6. Tests | 255 files / **2,678 tests PASS** (+28 new); selector browser regression see §6 |

## 1. Native BNB evidence (production RPC eth_call — separate from mocks)
Archive: `BNB_SWAP_V1_4_NATIVE_RPC_EVIDENCE_20261117.json` (28 calls, 9 failed = all intended negative cases).
Endpoints `bsc-dataseed.bnbchain.org` + `bsc-dataseed1.bnbchain.org` (same operator, not an independent quorum).
Block **134108781**, hash `0x4771d534…07a2`, block time **2026-11-17T11:07:37Z**; peer hash equal, final re-read equal.
Method: `eth_call` with **ephemeral state overrides on synthetic addresses** (`0x…0f1b0001` user, `0x…0f1b00ad` injected candidate code, `0x…0f1b00fe` fee). No key exists for these; nothing is broadcast.

| Check | Result |
|---|---|
| Live bytecode keccak = Sourcify-verified on-chain bytecode (WBNB, USDT, SwapRouter) | **match** ×3 |
| Router `WETH9()` | `0xbb4C…095c` = WBNB |
| `WBNB.deposit()` payable with value | succeeds |
| `WBNB.withdraw(0.01)` with balance / without balance | succeeds / reverts |
| Router `exactInputSingle` with `msg.value` 0.01 BNB (WBNB→USDT, fee 500) | **5.881166866416985237 USDT** |
| Router with excess `msg.value` (0.005 in, 0.01 sent) | succeeds and leaves 0.005 BNB in router → **residual hazard**: router `refundETH/unwrapWETH9/sweepToken` are public (verified source), anyone can take router residue. Candidate never uses router-held BNB. |
| Candidate 10 bps: 0.01 BNB → USDT | net **5.875285699550568252** = router gross − 10 bps **exactly** |
| Candidate 5 bps: 0.01 BNB → USDT | net **5.878226282983776745** exact |
| Candidate 10 / 5 bps: 10 USDT → native BNB | net **0.016969439497676507 / 0.016977932710638307 BNB** |
| min = gross, expired deadline, deadline +10,000 s, unknown selector | all **revert** |
Limits: one block, one size, simulation only (state overrides ≠ funded wallet, gas and inclusion not tested). Exact-output native paths were not built (candidate is exact-input only).

## 2. Token safety (Sourcify first-party verified source, archive `BNB_SWAP_V1_4_SOURCE_ARCHIVE_20261117.json`)
| Token | Verification | Transfer semantics (verified source) | Powers | Classification |
|---|---|---|---|---|
| USDT `0x55d3…7955` BEP20USDT 0.5.16 | full match; live code hash = verified | plain `_transfer`, no fee, no pause, no blacklist | owner `mint`; ownership transferable; not a proxy | Candidate-eligible (owner mint = supply/peg risk, issuer/legal review still open) |
| WBNB `0xbb4C…095c` WBNB 0.4.18 | full match | WETH9 semantics, no owner | none | Candidate-eligible |
| XAUt proxy `0x21cA…A3bf` TransparentUpgradeableProxy 0.8.9 | exact match | — | admin can upgrade implementation | **BLOCKED** |
| XAUt impl `0x9151…ecc5` TetherTokenOFTExtension 0.8.4 | exact match | `_beforeTokenTransfer` blocks transfers *from* blocked accounts; `transferFrom` blocked for blocked `msg.sender`; transfers to the token contract rejected | owner: `addToBlockedList`, `destroyBlockedFunds`, `mint`, `redeem`, `setOFTContract`, `updateNameAndSymbol`; authorized OFT cross-chain mint/burn | **BLOCKED** (freeze/burn + upgradeability; RWA legal gate) |
"Candidate-eligible" means verified source shows no transfer fee/freeze path today; it is **not** an approval. `classifyTokenSafety` still never returns approved.

## 3. Candidate contract (local only)
`contracts/candidates/bnb-swap-adapter-v1/` — source, `MANIFEST.json` freeze (solc 0.8.20, opt 200, paris), README.
Freeze: sourceKeccak `0x06f90355…a173`, creation `0x02d6c301…54fd`, unlinked runtime `0x273cdc00…1b6d`, 5,531 bytes.
Design: immutable WBNB/USDT/router/pool fee/fee recipient/fee bps; no owner/admin/pause/sweep/arbitrary call; recipient = msg.sender; exact approve + allowance-cleared check; balance-delta and zero-residual assertions; fee from output with net minimum; chain 56; deadline ≤120 s; reentrancy lock; `receive` only from WBNB.
Synthetic tests (mocks, local EVM chainId 56) — 25: wrong chain, fee bps bounds, constructor target/recipient checks, minimal ABI surface, exact both-direction accounting, 5 bps variant, net-minimum, deadlines, amount bounds, nonpayable/unknown calldata/native rejection, fee-on-transfer, false-returning token, blacklisted account, router pays nothing / under-pulls / over-pulls / re-enters / sends native / pays elsewhere / over-reports / over-pays, rejecting recipient refund-on-fail, stray balances not paid out, EIP-170.
Fence test (3): frozen source hash, no references from `src/` or `contracts/production/`, no execution fields in BNB providers.
**Not production-ready**: synthetic tests + one-block simulation only; requires independent manual audit.

## 4–5. Owner sheet and UX
See decision sheet. No UI change, no new rows. XAUt excluded from the candidate by immutables.

## 6. Verification
- `bunx vitest run`: **255 files / 2,678 tests PASS** (2,650 + 25 adapter + 3 fence).
- Selector browser regression (320/360/390/430/1280 × light/dark × motion): **640 assertions / 20 cases PASS** (exact 32px heading, nav geometry, no BNB actions)
- Standalone type-check / hosted pipeline: harness-owned, **UNVERIFIED** here.

## Remaining HOLD gates
Independent audit; owner fee/recipient/provider decision; funded rehearsal under separate authorization; multi-hour/day depth & independent RPC; USDT issuer/legal review; 0x / PancakeSwapX access & terms; wallet integration of a reviewed signing flow; physical-wallet acceptance; inherited dependency advisories; RWA legal/region/issuer gate for XAUt.
