# BNB V1.17 — Owner fee selection acceptance (preview-only)

**Status: LAUNCH HOLD / NO-GO.** Base head `425e3e9b`. AI-prepared internal evidence only — not an independent or signed human audit.

## Decision recorded
- **D-03 rate:** owner approved **5 bps (0.05%) output-side** FlowBridge fee (reply "Ok proceed", 2026-11-26).
- **D-03 recipient:** owner-selected direct EOA `0xb7322660B40561ae7C224F963e51583e923F7fC8` (not a Safe).
- **Status:** `FEE_RATE_SELECTED_PAYABLE_CONFIGURATION_NOT_AUTHORIZED`. No fee is charged, configured or payable now; no constructor calldata exists.
- D-01 quote trust, D-04 min output/slippage/TTL, D-05 WalletConnect remain **OPEN**. D-02 direct EOA Guardian `0x351E…a412` remains preference with single-key/immutable risk acknowledgment **PENDING**.

## Changes
- `src/lib/bnb/launchReadiness.ts`: `OWNER_SELECTED_FEE_BPS = 5`; D-03/OI-02 updated; `feeBpsSelected: 5` with `payableConfigurationAuthorized: false`; illustration marks only 5 bps chosen. `launchGate` unchanged (always `go:false`).
- `src/lib/bnb/feePolicy.ts` (new, pure): `fee = floor(gross*5/10000)`, `userNet = gross - fee`; gross floor mirrors V1.13 `_grossMinimum`; slippage applied once to post-fee net (no double fee); BNB→USDT fee in USDT, USDT→BNB fee in WBNB with net native BNB to user; ESTIMATED vs ACTUAL labels; disclosures that PancakeSwap pool fees (0.05%/0.25%) and network gas apply separately; `gasEstimate: null`. No network, signing, approval or calldata.
- `contracts/audit/bnb-v117-fee-selection/fee5.v117.evm.test.ts`: local mock-EVM tests on the unchanged V1.13 contract with exact owner EOAs and 5 bps.
- Private packet: `OWNER_DECISIONS.md` D-03 row, new `OWNER_FEE_SELECTION.json`, FREEZE metadata and regenerated `SHA256SUMS`.

## Tests (actual)
- Full suite: **289 files, 3,526/3,526 passed** (baseline 3,504; +8 fee-policy, +14 EVM).
- Fee-policy unit: 8/8. Launch readiness: updated, passing.
- Local EVM (14/14): both directions × tiers 500/2500 with exact Swapped event fields, Treasury asset (USDT vs WBNB), router gross floor equals `grossFloorForNet`, zero residual/allowance; tiny inputs 1/3/4 wei (fee 0/0/1); net+1 floor reverts with unchanged ledgers both directions; blocked Treasury USDT transfer rolls back the whole swap; unauthorized (other/Treasury) pause rejected with `UnauthorizedGuardian()`; Guardian pause blocks both directions; chain 677 rejects deploy/swap/pause; Guardian/Treasury receive no native value.
- Limit: the WBNB mock cannot block a recipient, so Treasury-failure rollback is proven for the USDT fee path only.
- Frozen source SHA256 `5e82f028…0425` verified unchanged.
- UI not touched: 32px Swap header, logos, nav, ads, BOT routes/rewards and XAUt block unchanged; responsive checks not rerun.

## Remaining prelaunch blockers
D-01, D-04, D-05 open; D-02 risk acknowledgment pending; payable configuration not authorized; six Slither HIGH OPEN; zero signed human reviews; physical wallets UNVERIFIED; WalletConnect/Zod HIGH OPEN (globally off); Treasury USDT issuer restriction UNKNOWN; final two-RPC refresh required; separately authorized deployment. `BNB_EXECUTION_ENABLED=false`, `LAUNCH_HOLD=true`.

No deployment, role configuration, wallet prompt/signature, on-chain write, funding, fee activation, publication, RWA or BOT chain change occurred.
