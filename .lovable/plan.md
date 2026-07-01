
## Scope

Phase 1 (this change): route every swap in `UniversalSwapCard` through the new **FlowBridgeRouter v3** using the on-chain registry (routerIds 0/1/2). No UI changes. No bridge-flow changes. No limit-order work yet.

Phase 2 (next turn, after user confirms Phase 1 works): route the BOT→BNB bridge leg through `FlowBridgeRouter.bridgeWithFee` (requires confirming USDT is in bridgeId 0's `supportedTokens`).

Phase 3 (after that): integrate `FlowLimitOrderExecutor` for limit orders.

## FlowBridgeRouter addresses & registry

- Mainnet: `0x986962de6F00D0eC571b1a34Fa70AEeB445b5445`
- Testnet: `0x6a8C4ce7544A75fEc6E577b990e44fe621D8a5ac`
- Registered routers (both nets — same IDs):
  - `0` = CaSwap V2
  - `1` = BDex V2
  - `2` = BDex V3 (`0x07032d47A1b9f8460cBeE9dC17c1d3E438693929`)

## Behavior changes

Today `UniversalSwapCard.executeStep` calls each underlying DEX router directly (CaSwap V2, or the BDex Universal Router for the V3 BOT↔USDT pool). After this change, **every step** goes through FlowBridgeRouter v3:

- ERC20-in step → ERC20 `approve` goes to FlowBridgeRouter (amount = `swapAmount + fee`), then one of:
  - `swapV2(routerId, swapAmount, minOut, path, to, deadline)`
  - `swapV3Single(routerId=2, tokenIn, tokenOut, feePool, swapAmount, minOut, to, deadline)`
  - `swapTokenToNative(routerId, tokenIn, feePool, swapAmount, minOut, path, to, deadline)`
- Native-in step → `swapNativeToToken(routerId, tokenOut, feePool, minOut, path, to, deadline)` with `value = swapAmount + fee` (contract splits fee off msg.value).

Two-tx cross-DEX routes (e.g. CA→USDT split as CA→BOT on CaSwap V2 + BOT→USDT on BDex V3) stay two sequential txs — FlowBridgeRouter's `swapMultiHop` is V2-only, so we can't collapse a V2+V3 chain atomically. Each leg is still individually routed through FlowBridgeRouter.

Fees: before submitting, call `computeRouterFee(routerId, swapAmount, user)` to get the exact fee and either (a) approve `swapAmount + fee` for ERC20 in, or (b) send `msg.value = swapAmount + fee` for native in. Current `globalFeeBps` on mainnet is `0` per docs, so `fee` will typically be `0`, but the wiring supports non-zero.

Quoter stays as-is (quotes come from the underlying pools/routers — routing through FlowBridgeRouter doesn't change the price for the current 0% fee).

## Files & concrete edits

- `src/lib/contracts.ts`
  - Add `flowBridgeRouterV3` addresses on `MAINNET_CONTRACTS` / `TESTNET_CONTRACTS`.
  - Add `FLOW_BRIDGE_ROUTER_V3_ABI` for: `swapV2`, `swapV3Single`, `swapNativeToToken`, `swapTokenToNative`, `swapMultiHop`, `computeRouterFee`, `getFeeConfig`, `bridgeWithFee`, `computeBridgeFee` (bridgeWithFee wired but unused until Phase 2).

- `src/lib/swap/quoter.ts`
  - Add `routerId: number` on `SwapStep` (0/1/2). `bestOnV2Dex` returns dex tag → map to routerId; `botUsdtStep` sets routerId `2`.
  - Keep quoting logic identical (still reads the underlying pools/routers directly). Only annotate the chosen routerId.

- `src/components/routetabs/swap/UniversalSwapCard.tsx`
  - Replace `firstStepRouter` with FlowBridgeRouter v3 address (allowance display + approvals all target FlowBridgeRouter).
  - Rewrite `executeStep` to:
    1. Read `computeRouterFee(routerId, amountInRaw, address)` from FlowBridgeRouter.
    2. For ERC20 in: approve `amountInRaw + fee` to FlowBridgeRouter (if allowance < that). For native in: send `value = amountInRaw + fee`.
    3. Dispatch based on `(dex, inIsNative, outIsNative)`:
       - `bdex-v3` + native-in → `swapNativeToToken(2, tokenOut, v3Fee, minOut, [], to, deadline)`.
       - `bdex-v3` + native-out → `swapTokenToNative(2, tokenIn, v3Fee, swapAmount, minOut, [], to, deadline)`.
       - `bdex-v3` + ERC20↔ERC20 → `swapV3Single(2, in, out, v3Fee, swapAmount, minOut, to, deadline)`.
       - V2 (bohr=routerId 1, caswap=routerId 0) + native-in → `swapNativeToToken(routerId, tokenOut, 0, minOut, path, to, deadline)`.
       - V2 + native-out → `swapTokenToNative(routerId, tokenIn, 0, swapAmount, minOut, path, to, deadline)`.
       - V2 + ERC20↔ERC20 → `swapV2(routerId, swapAmount, minOut, path, to, deadline)`.
    4. Keep the same modal/toast/receipt callbacks (`onSwapPhaseChange`, `onSwapSuccess`).

- `src/App.tsx`
  - No functional change to the bridge flow this phase. Only unused-import cleanup if any becomes dead (`UNIVERSAL_ROUTER_ABI`, `UNISWAP_V3_ROUTER_ABI` in App.tsx may stay; the legacy BOT/USDT `SwapCard` code still uses them).

## Verification (before handing back)

1. Typecheck must pass (`tsgo`).
2. Sanity read against BOT mainnet via a short node script: assert `computeRouterFee(2, 1e18, 0x0)` returns `(0, 0)` (global fee is 0) and `getFeeConfig()` returns treasury `0xFA3D…7e47`. Confirms our ABI + address are correct.
3. Ask the user to sanity-check one small BOT→USDT swap on mainnet preview; watch for `Router not found`/`Router inactive`/`Not a V3 router` reverts — those are the ABI/routerId mismatch signals.

## Out of scope (do NOT touch this phase)

- BridgeCard / bridge txs.
- Limit-order executor.
- Curated token list, UI copy, modals.
- `src/App.tsx` legacy BOT/USDT `SwapCard` (keeping it on the old Universal Router path is fine — user's card in scope is `UniversalSwapCard`).
