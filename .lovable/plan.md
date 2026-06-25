## What changes

The current **BOT / USDT** tab is being replaced with a generic **SWAP** tab that mirrors the BDEX UX from your screenshots. The "BOHR DEX AGGREGATOR (PRO)" header and the locked-pair dropdown go away. Users pick any "Sell" token and any "Buy" token from a searchable list, can paste a token contract address to import it, see a live quote routed through Bohr's on-chain pools (BOT ↔ USDT direct, or hopping through WBOT when needed), and adjust slippage.

The **CA / BOT** tab and the **BRIDGE** tab stay untouched.

```text
Old tabs:    [ CA / BOT ]  [ BOT / USDT ]      [ BRIDGE ]
New tabs:    [ CA / BOT ]  [    SWAP    ]      [ BRIDGE ]
```

## New Swap tab UX (per the BDEX reference)

- **Header**: "Swap" title, slippage editor icon (opens popover, default 0.5%, presets 0.1 / 0.5 / 1 / custom).
- **Sell card**: amount input, balance + MAX, token-picker button (icon + symbol + ▾).
- **Direction switch**: same up/down arrow you already have.
- **Buy card**: read-only amount (live quote), balance, token-picker button.
- **Quote details**: exchange rate, min received after slippage, route hops (e.g. `BOT → WBOT → USDT`), price impact, fees.
- **Primary button**: contextual — *Connect wallet → Enter an amount → Insufficient balance → Approve TOKEN → Swap*.
- **Token picker modal**: search by symbol/name/address, curated list pinned on top (BOT, WBOT, USDT, CA), recent imports below, "Paste address" auto-detects ERC-20 metadata and verifies a Bohr pool exists before allowing import.

## Routing engine

- Curated tokens: **BOT** (native), **WBOT**, **USDT**, **CA**.
- For any pair, try in order:
  1. Direct pool `A → B` (via Bohr factory `getPair`).
  2. Hop through **WBOT**: `A → WBOT → B`.
  3. Hop through **USDT**: `A → USDT → B`.
- Pick the route returning the highest `getAmountsOut` from Bohr router.
- Native BOT in/out is wrapped/unwrapped through WBOT in the path automatically.
- Custom CA imports: only allowed if at least one of the above paths resolves to a non-zero quote (proves real liquidity). Otherwise the picker shows "No Bohr liquidity for this token."
- Reuses the existing `flowBridgeRouter` `swapExactTokensForTokensSupportingFee` / ETH variants for the FLOW community-fee skim, falling back to plain Bohr router when FLOW isn't unlocked.

## Files

### New
- `src/components/routetabs/swap/TokenPickerModal.tsx` — search + curated list + paste-address import.
- `src/components/routetabs/swap/SlippagePopover.tsx` — slippage editor.
- `src/components/routetabs/swap/UniversalSwapCard.tsx` — the new card (replaces the BOT/USDT usage of `SwapCard`).
- `src/lib/swap/tokenRegistry.ts` — curated tokens + localStorage for imported customs.
- `src/lib/swap/quoter.ts` — `getBestRoute(tokenIn, tokenOut, amountIn)` using `bdexFactory.getPair` + `bdexRouter.getAmountsOut`.
- `src/lib/swap/erc20.ts` — `fetchTokenMetadata(address)` (symbol/name/decimals via viem `multicall`).

### Edited
- `src/App.tsx` — swap the BOT/USDT tab body from `<SwapCard …pair-locked… />` to `<UniversalSwapCard />`; remove `showAggregatorSelector` / `selectedPair` / `onPairChange` plumbing for that tab. CA/BOT tab keeps using the existing `SwapCard`.
- `src/components/routetabs/RouteTabs.tsx` — rename the middle tab label from "BOT / USDT" to "SWAP".
- `src/lib/contracts.ts` — add `parseAbi(['function getPair(address,address) view returns (address)'])` factory ABI export.

### Untouched
- `src/components/routetabs/SwapCard.tsx`, `PriceTrendChart.tsx`, `BridgeCard.tsx`, the CA/BOT logic, all bridge logic, all balance/approval hooks.

## Technical notes (devs only)

- Quoter calls `bdexRouter.getAmountsOut(amountIn, path)` via `useReadContract` with debounce (~300 ms) on amount changes.
- Pool existence check: `bdexFactory.getPair(a, b) !== 0x0`.
- ERC-20 metadata fetched with viem `multicall` (`symbol`, `name`, `decimals`) — reject if any call reverts.
- Imported tokens persisted to `localStorage` under `flowbridge.imported_tokens.v1` keyed by chainId+address.
- Slippage stored in component state; default 0.5%, applied to `amountOutMin = quote * (1 - slippage)`.
- Price impact = `(spotPrice - executionPrice) / spotPrice` where spot comes from a tiny probe quote (`amountIn = 1 unit`).
- Approvals: existing allowance check / approve flow from the current `SwapCard` is lifted into a small hook `useTokenApproval(token, spender, amount)` so the new card can reuse it without duplicating logic.
- Native BOT: detected via a sentinel address `0xeeee…eeee`; quoter swaps it for WBOT in the path; swap call picks the ETH-in / ETH-out router variant.
- No backend changes. No new migrations. No new secrets.

## Out of scope (will not change)

- CA / BOT tab and its dedicated CaryPact V2 routing.
- Bridge tab.
- FLOW unlock gating, donate modal, ledger modal, SIWE auth.
- Email infra, security findings.
