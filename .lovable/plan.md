## What's broken

Looking at the SWAP card on flowbridge.space:

1. **No route for BOT/USDT, USDT/BOT, CA/USDT, USDT/CA.**
   I probed the on-chain state against BOT mainnet:
   - The Bohr WBOT/USDT V2 pair address resolves, but `getAmountsOut` on Bohr's router **reverts**. That's because `bdexRouter` is actually a Uniswap **V3 Universal Router** – BOT↔USDT trades go through the V3 pool `usdtBotPoolV3` (the legacy BOT/USDT tab uses `slot0` for quoting and `UniversalRouter.execute(...)` for swapping).
   - CaryPact has no `caWBOT/USDT` pair, only `caWBOT/CA`, so CA↔USDT must split at native BOT and use the V3 pool for the BOT↔USDT leg.

2. **CA↔BOT works** but the new card only shows a tiny green "Swap submitted" banner – no waiting modal, no receipt modal, no $ price indicator.

## Fix

### 1. V3 quoting + execution for the BOT↔USDT leg

Extend `src/lib/swap/quoter.ts`:
- New helper `quoteV3BotUsdt(direction, amountIn)` that reads `slot0` + `fee` from `usdtBotPoolV3`, applies the V3 spot price (skip price impact; the pool is deep), and returns `{ amountOut, fee }`.
- Mark BOT/USDT and USDT/BOT as a dedicated step type `dex: "bdex-v3"` carrying `{ fee, direction }` instead of a V2 path.
- Update `getBestRoute` to try the V3 quote first whenever the pair is BOT↔USDT (native or WBOT either side). Keep the existing V2 fallbacks for everything else (CA↔BOT on CaSwap stays unchanged).
- For CA↔USDT, build a two-step route: CA↔BOT on CaSwap V2 + BOT↔USDT on Bohr V3.

Extend `src/components/routetabs/swap/UniversalSwapCard.tsx` `executeStep`:
- When `step.dex === "bdex-v3"`, call `bdexRouter.execute(commands, inputs, deadline)` using the same `WRAP_ETH + V3_SWAP_EXACT_IN` (BOT→USDT) and `V3_SWAP_EXACT_IN + UNWRAP_WETH` (USDT→BOT) command sequences already used in `App.tsx` (lines 905-1022). Encode the V3 path with `encodePacked(['address','uint24','address'], [tokenA, fee, tokenB])` and use `minOut` from slippage.
- Allowance approval for USDT→BOT uses `bdexRouter` (same as legacy). Native BOT input is sent as `value`.

### 2. UI parity with the legacy swap (waiting / receipt / price)

- Reuse the existing `WaitingModal` and `ReceiptModal` already in `src/modals/`. Hoist a callback into `UniversalSwapCardProps`: `onSwapPhaseChange({phase: 'approving'|'swapping'|'success'|'error', txHash?, txError?})` and let `App.tsx` open the modals (so layout matches the legacy BOT/USDT and CA/BOT flows). Drop the inline green banner.
- Add a `usdValue` prop pair to `UniversalSwapCard` (BOT price comes from the V3 slot0 read already in `App.tsx`; CA price comes from `rawLiveCaToBotQuote` × BOT price; USDT is $1; WBOT = BOT). Render `≈ $x.xxxxx` under each amount field, matching the legacy card.

### 3. Verification

- Unit-probe on BOT mainnet: assert `quoteV3BotUsdt('BOT_TO_USDT', 1e18)` returns the same rate the legacy card shows (≈ 9.71 USDT) and reverse direction matches.
- Manual: on preview, run BOT→USDT, USDT→BOT, CA→USDT (split), USDT→CA (split), CA↔BOT (V2 only, regression).

## Files

- edit `src/lib/swap/quoter.ts` (V3 quote + new step type)
- edit `src/components/routetabs/swap/UniversalSwapCard.tsx` (V3 execution branch, USD prices, modal callback)
- edit `src/App.tsx` (pass USD price props + modal callback; wire to existing WaitingModal/ReceiptModal)

No backend changes, no new files.
