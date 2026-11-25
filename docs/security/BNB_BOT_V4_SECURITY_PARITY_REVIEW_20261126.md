# BOT Router V4 vs BNB Adapter V1.13 — Security Differential Review & Test Port

**Status:** preview-only security evidence. V1.13 source **unchanged** (SHA256 `5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425`). No V1.14 created. No deployment, signature, transaction outside local forks, fee, guardian/treasury choice, publication or BNB/RWA activation.
**Not an audit.** This is AI-performed review. It is not independent human peer review and is not a firm audit or certification.

Evidence folder: `docs/security/bnb-bot-v4-parity/` (all generated in this review on 2026-11-25 UTC; older evidence is not reused as a PASS).

## 1. Baseline identity (correct BOT source)
- Compared source: `contracts/production/router-v4-native-v3-multi/FlowBridgeRouterV4.sol`, SHA256 `7082d896…dad66a`. The older `contracts/production/router-v4/` source was **not** used.
- `scripts/bot-v4-identity.mjs` recompiles with solc 0.8.20, optimizer 200, viaIR, shanghai. BOT Mainnet `eth_getCode(0x7965…fc61)` at block 31,518,608 gives runtime SHA256 `a42e53b1…bec41d` (21,838 bytes). That matches the README hash exactly.
- The local rebuild matches the live code **byte-for-byte except the CBOR metadata tail**, which encodes source path and remappings. `matchExcludingMetadata: true` and `exactMatch: false` are both recorded. Executable identity is therefore confirmed. A bit-exact match with metadata is not.

## 2. Function crosswalk
This crosswalk is mechanical. `scripts/bnb-bot-v4-crosswalk.mjs` finds each anchor by its signature, matches braces to find the end, and records the line range and SHA256 for each. `crosswalk.json` holds the result, and `scripts/bnb-bot-v4-parity-evidence.test.ts` fails if any line or hash goes stale.

| Area | BOT lines | BNB lines | Class | Difference |
|---|---|---|---|---|
| Router target | 1248-1252, 534-554 | 35, 60-74 | NEEDS BNB ADAPTATION | BOT uses an owner registry. BNB uses a constant router plus `q.router` check. The registry was not copied. |
| Wrap/unwrap | 1039-1094 | 99-142 | REUSABLE | Both use an exact wrapped delta and unwrap only the measured output. BNB rejects native sent from anyone except WBNB. |
| Token pull | 1283-1288 | 118-142 | REUSABLE | Both require an exact delta, so fee-on-transfer tokens are rejected. |
| Approve/clear | 1128-1150, 1290-1294 | 144-154 | NEEDS ADAPTATION | BOT clears any leftover allowance. BNB **reverts** on leftover allowance, which is stricter. |
| Fee | 1269-1280, 487-499 | 163-169, 118-142 | NEEDS ADAPTATION | BOT takes a mutable fee on **input**, bounded by `maxProtocolFee`. BNB takes an immutable 0/5/10 bps fee on **output**, paid in WBNB when the output is BNB. |
| Output floor | 1039-1065 | 159-169 | NEEDS ADAPTATION | BOT passes the user minimum to the router unchanged. BNB passes `_grossMinimum(net)` to the router and then re-checks the net amount. |
| Deadline/quote | 1296-1298 | 60-74 | NEEDS ADAPTATION | BNB adds a 120 s deadline ceiling, a 30 s quote age limit and a 1–100 block lag with blockhash check. These values are caller-asserted. It is **not an oracle**. |
| Slippage/MEV | 1128-1150 | 144-154 | UNSUPPORTED | Neither contract sets a price limit. Sandwich attacks inside the user's floor remain possible on both. |
| Governance/pause | 272-289 | 87-93 | NEEDS ADAPTATION | BOT has an owner who can pause, set fees, manage the registry and rescue funds. BNB has one immutable guardian that can only pause. |
| Pool tier/path | 1328-1333 | 60-74 | NEEDS ADAPTATION | BOT validates multi-hop path endpoints. BNB is single-hop and allows only tiers 500 and 2500. |
| Donations | 1128-1150, 1361 | 171-173, 96 | NEEDS ADAPTATION | BOT accepts native from anyone and has an owner rescue. BNB has no rescue: donations stay untouched forever. |
| Reentrancy | 215-220 | 60-74 | REUSABLE | Both use a single lock. The BNB lock also blocks `setPaused` during a swap. |
| Native delivery | 1068-1094 | 176 | REUSABLE | Both send with full gas and revert everything on failure. BNB always pays `msg.sender`. |
| Events | 1347-1359 | 55 | NEEDS ADAPTATION | The BNB `Swapped` event omits the pool tier (AF-08). |
| Arbitrary calls | 1233-1236 | 97 | BOT-ONLY (rescue) | Neither contract can execute arbitrary calldata. |
| Chain/compiler | 2 | 27 | NEEDS ADAPTATION | BOT: 0.8.20 viaIR shanghai, with no chain-id check. BNB: 0.8.38 cancun, with `chainid==56` checked in the constructor and on every call. |

**Decimals and counterparties:** On BNB Chain (block 135,686,013), WBNB and USDT both have **18 decimals**. On BOT Mainnet (block 31,519,065), WBOT has 18 and USDT has **6**. Any UI or quote code shared between the chains must not assume one decimal count. BNB USDT is an upgradeable, issuer-controlled token, and USDT blocklisting of the fee recipient is unverified (AF-03/AF-07).

## 3. Ported tests
- `contracts/candidates/bnb-swap-adapter-v1-13/test/BotV4Parity.evm.test.ts`, plus a test-only `ParityMocks.sol` (a router that ignores the minimum). Result: **85/85 passed**.
- Each test name cites the `V31_NativeV3Multi.t.sol` test it ports. The suite covers both directions for:
  - fee taken once at 0/5/10 bps, with an exact net amount, exactly one event and zero residual balances;
  - exact-net-floor pass, rejection at +1, and the router receiving the minimal gross floor;
  - a router that ignores the minimum;
  - under-pull and over-pull by the router;
  - output non-delivery, over-delivery, donation during the callback, and under-reporting;
  - reentry from the router into either direction and into `setPaused`;
  - a caller that rejects native BNB, and the 2,300-gas-stipend recipient;
  - pause, unauthorized administration, and absent rescue/owner/multicall/execute/registry/BOT selectors;
  - donations, allowance zero after success and after failure, and wallet caller binding;
  - stale quotes plus the 30 s / 100-block boundary, wrong chain, tiers 100/3000/10000 rejected and 500/2500 forwarded;
  - 96 seeded fuzz swaps.
- **BOT Router V4 forge tests, run fresh:** 67/67 passed with Foundry 1.7.1 (`bot-v4-forge-unit.log`). The run used an isolated copy, with forge-std fetched fresh.
- **BOT fork tests** (`bot-v4-forge-fork.log`, live BOT RPC, local fork only): `test_Fork_BOT_USDT_FLOW_then_back` **PASS**. `test_Fork_CaSwap_then_BdexV2_MultiHopSafe` **FAIL**, which is expected: the BOT README already documents that this route has no shared liquidity on BOT Mainnet. This is not a router defect.
- **Full app suite:** **3,418/3,418** passed (baseline 3,328, plus 85 ported tests and 5 evidence-integrity tests). Typecheck passed and the build is OK.

## 4. Fork and read-only replay
- `read-only-replay.json` reads at the BNB head block 135,686,013, hash `0x81c6…6aa0`:
  - Pool slot0 is decoded from the raw 7-word return. Only words 0–1 are used, because Pancake's `feeProtocol` is uint32 where Uniswap's is uint8.
  - For 0.01 BNB, the tier-500 quoter output is 5.40584 USDT, against a spot value of 5.40854 (**5 bps** gap). Tier 2500 gives 5.39202 (**25.3 bps** gap).
- `bnb-local-fork-replay.json` is a fresh Anvil fork at block 135,686,033 using real WBNB/USDT/router bytecode: 15 local transactions and **0 mainnet transactions**. For the same input, a direct Pancake swap returned 0.540442 USDT and the adapter returned a net 0.540172 (5 bps proposal fee). The adapter used **69,076 extra gas**.
- Historical/archive state: **UNKNOWN**, because the public RPC does not keep history.

## 5. The six Slither HIGH findings
`high-dispositions.json` lists them individually by key. Slither 0.11.6 was run fresh with **0 suppressions**.

1. `swapExactBnbForUsdt|deposit|wbnbBefore`
2. `swapExactBnbForUsdt|deposit|usdtBefore`
3. `swapExactBnbForUsdt|_swap|usdtBefore`
4. `swapExactUsdtForBnb|_safeTransferFrom|wbnbBefore`
5. `swapExactUsdtForBnb|_safeTransferFrom|usdtBefore`
6. `swapExactUsdtForBnb|_swap|wbnbBefore`

For each finding:
- **External call:** a fixed constant target (WBNB, USDT or the Pancake router).
- **Lock:** held during the call; reentry gets `Reentrancy()`, which is tested.
- **State change:** only the lock flag changes.
- **Value movement:** outputs go to `msg.sender` or the immutable fee recipient.
- **Hostile reproduction:** every attempt only causes a revert.
- **Exploit:** none reproduced.

All six stay **OPEN**. Two of the balance snapshots (#5, #1) *are* the fee-on-transfer and wrap safety checks, so removing them would weaken safety.

The deployed BOT V4 produces the same warning class: fresh Slither shows 4 reentrancy-balance HIGH plus 1 arbitrary-send-eth HIGH (`_takeNativeFee` to an owner-set treasury). The BOT README's earlier statement of "6 medium/high-class hits" is superseded by this fresh count. **Similarity to BOT does not resolve any BNB finding.**

No unsafe code was found, so **no V1.14** was created and V1.13 remains the candidate.

## 6. Wallet/UI constraints
- `BNB_EXECUTION_ENABLED` is still `false` and the review policy still cannot sign (tests pass).
- `minNetOut` is user-approved. No signed oracle is claimed.
- The 32 px Swap header, logos, flat nav, docked ads, BOT swaps, rewards and the XAUt block are untouched. No app source changed.

## 7. Economics
- On the sample, the 5 bps fee is about 0.00027 USDT and the extra gas is about 69k. On small swaps, the extra gas costs more than the fee earns.
- Pool choice matters more than the fee: tier 2500 gave about 20 bps less than tier 500.

## 8. GO / NO-GO
**NO-GO** for any BNB live use. Release blockers:
1. independent human review of the V1.13 hash, including the six HIGH findings;
2. owner decisions D-01–D-05;
3. a Safe guardian and fee recipient chosen by the owner, plus a USDT blocklist check;
4. tests on physical wallets;
5. the Zod/WalletConnect HIGH advisory;
6. a separately authorized deployment.

**Limitations:**
- The mock EVM is `@ethereumjs/vm`, not a BSC client.
- The BOT fork swap replay depends on live RPC state, and the second BOT fork test is expected to fail.
- The metadata hash does not match bit-for-bit.
- Mutation testing was not re-run in this review; the 18/18 result comes from the prior V1.13 run and is not claimed here.

## Reproduce
```
bun scripts/bot-v4-identity.mjs
bun scripts/bnb-bot-v4-crosswalk.mjs
bun scripts/bnb-bot-v4-parity-replay.ts
bunx vitest run contracts/candidates/bnb-swap-adapter-v1-13/test/BotV4Parity.evm.test.ts scripts/bnb-bot-v4-parity-evidence.test.ts
nix shell nixpkgs#foundry -c bun scripts/bnb-v113-fork-rehearsal.ts   # writes v113 file; copy to parity folder
(isolated copy) forge test ; BOT_RPC=https://rpc.botchain.ai forge test --match-path test/fork/V31_Fork.t.sol
slither FlowBridgeBnbSwapAdapterV1_13.sol --solc-args "--optimize --optimize-runs 200 --evm-version cancun"
```
