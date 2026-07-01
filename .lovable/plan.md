
## Scope

Integrate `FlowLimitOrderExecutor` v3 at `0x7FE51363C6694ACddf3EBBF64B2d4A7Ef970ecB4` (BOT mainnet) for three pair sets: **CA↔BOT** (routerId 0, CaSwap V2), **BOT↔USDT** (routerId 2, BDex V3, feePool 3000), **CA↔USDT** (single-hop not possible on-chain — see below). No bridge-flow changes; existing swap path is untouched.

## Key contract facts (from on-chain ABI + source)

- `placeOrder(tokenIn, tokenOut, amountIn, minAmountOut, expiry, routerId, feePoolV3, recipient) payable → orderId`
  - `msg.value` = **keeper bounty** (native BOT). Not a protocol fee. Recommend a sensible default (e.g. 0.001 BOT) with UI override.
  - Protocol placement fee = `placementFeeBps` of `amountIn` in `tokenIn` (currently `0`).
  - `tokenIn` is transferred via `safeTransferFrom` → **native BOT is not accepted as `tokenIn`**. Users placing a `BOT → X` order must wrap to WBOT first (standard `wbot`, since V3 uses `wbot`; CaSwap V2 uses `caWbot` — see routing table below).
  - `recipient = address(0)` defaults to `msg.sender`.
- `executeOrder(orderId, v2Path)` — V2 fills; `executeOrderMultiHop(orderId, routerIds[], paths[][], minAmountsPerHop[])` — cross-router fills. Keepers execute; we do not.
- Events: `OrderPlaced`, `OrderFilled`, `OrderCancelled` — all indexed by `orderId`.
- Views: `getOrder(id)`, `getActiveUserOrders(user)`, `getOpenOrdersPaginated(user, offset, limit)`, `openOrderCount(user)`, `maxOrdersPerUser`, `computePlacementFee(user, amountIn)`, `paused()`.

## Routing table (per pair)

| Pair | Direction | routerId | feePoolV3 | tokenIn / tokenOut on-chain |
|---|---|---|---|---|
| BOT ↔ USDT | BOT→USDT | 2 | 3000 | WBOT (`wbot`) → USDT |
|  | USDT→BOT | 2 | 3000 | USDT → WBOT (`wbot`) |
| CA ↔ BOT | CA→BOT | 0 | 0 | CA → caWBOT |
|  | BOT→CA | 0 | 0 | caWBOT → CA |
| CA ↔ USDT | — | n/a | — | Requires V2+V3 multi-hop — **not placeable as a single limit order** in v3 executor (routerId is scalar). Excluded from placement; user is shown "route unsupported for limit orders — use instant swap". |

Rationale: `placeOrder` stores a single `routerId`. `executeOrderMultiHop` allows multi-router fill, but placement itself still binds one `routerId`; the multi-hop path is intended for same-router chained pools, not CA→BOT(V2)→USDT(V3). Keeping CA↔USDT out of Phase 3 avoids an unfillable order. We can add it in a later phase once we design a two-order primitive or upstream contract change.

## New UI

Add a fourth tab `LIMIT` in `RouteTabs.tsx` with a new `LimitOrderCard.tsx` under `src/components/routetabs/limit/`.

```text
┌────────────────────────────────────────┐
│  You pay      [BOT ▼]     [1.0]        │
│  You receive  [USDT ▼]    [ ~ 0.098 ]  │
│  Limit price  [1 BOT = 0.10 USDT]      │
│  Expires in   [24h ▼]  Custom recipient│
│  Keeper tip   [0.001 BOT] (advanced)   │
│                                        │
│  Live quote: 0.096 USDT (spot)         │
│  Placement fee: 0 %  (on-chain)        │
│  ──────────────────────────────────    │
│  [Approve WBOT] → [Place Limit Order]  │
└────────────────────────────────────────┘

Below: Active Orders list — id, pair, amount, limit, status, expiry, cancel.
```

Pre-flight validations (all on-chain; block submit if any fails):
1. `paused() == false`
2. Pair maps to a known routerId in the table above; otherwise disabled.
3. `openOrderCount(user) < maxOrdersPerUser`.
4. `tokenIn.balanceOf(user) >= amountIn`.
5. `tokenIn.allowance(user, executor) >= amountIn` (else show Approve step; approve exact `amountIn`).
6. For BOT-in orders: native BOT balance ≥ `amountIn + keeperBounty + gas headroom` for the wrap step, and WBOT balance/allowance check after wrap.
7. `expiry == 0 || expiry > now + 60s`.
8. `minAmountOut > 0`; warn if `minAmountOut` deviates from live spot by > slippage bound (default 5%).
9. `computePlacementFee(user, amountIn)` — display exact deduction; adjust displayed escrow.

## Event-driven state (fulfillment tracking)

- On `placeOrder` tx confirmation, decode `OrderPlaced` from the receipt to capture the definitive `orderId`; only then move UI state from `submitting` → `open`.
- Subscribe with `publicClient.watchContractEvent` filtered by `creator = user` for `OrderPlaced` / `OrderCancelled`, and by `orderId` for `OrderFilled` on active orders. Reconcile any missed events on mount via `getActiveUserOrders(user)` + `getOrder(id)`.
- UI status transitions only on confirmed events:
  - `submitting` (tx sent) → `open` (OrderPlaced) → `filled` (OrderFilled) or `cancelled` (OrderCancelled) or `expired` (derived from `expiry < now` + `status == OPEN`).
- Persist a lightweight `{orderId → localMeta}` map in localStorage keyed by chain+user (for pair symbols, submitted keeper tip, ui timestamps). Ground truth is always the contract.

## Files & edits

- `src/lib/contracts.ts` — add `flowLimitOrderExecutor` address (mainnet only for now; testnet address left blank + a runtime guard) and `FLOW_LIMIT_ORDER_EXECUTOR_ABI` (placeOrder / cancelOrder / getOrder / getActiveUserOrders / openOrderCount / maxOrdersPerUser / computePlacementFee / paused, plus events OrderPlaced/OrderFilled/OrderCancelled).
- `src/lib/limitOrders/routing.ts` (new) — pure mapping `(tokenIn, tokenOut) → { routerId, feePoolV3, onchainTokenIn, onchainTokenOut, needsWrapBOT }`. Single source of truth for the routing table above.
- `src/lib/limitOrders/executor.ts` (new) — thin wagmi/viem helpers: `placeLimitOrder`, `cancelLimitOrder`, `fetchActiveOrders`, `watchUserOrderEvents`, `decodePlacedOrderId`.
- `src/lib/limitOrders/preflight.ts` (new) — the validation checklist above; returns a discriminated result the UI renders.
- `src/components/routetabs/limit/LimitOrderCard.tsx` (new) — the form + validation UI. Reuses existing `TokenPickerModal`, `SlippagePopover`.
- `src/components/routetabs/limit/ActiveOrdersList.tsx` (new) — list + cancel + event subscription.
- `src/components/routetabs/RouteTabs.tsx` — add `'LIMIT'` tab id.
- `src/App.tsx` — wire the new tab to render `LimitOrderCard` and `ActiveOrdersList`; add a WBOT wrap/unwrap helper for BOT-in / BOT-out orders (uses standard `wbot`; for CA↔BOT the executor holds `CA` on CA→BOT orders and `caWBOT` will be unwrapped by the router at fill time to native BOT — verify with dry `eth_call`).

## Verification before ship

1. `tsgo` clean.
2. `eth_call` dry-run: `paused()`, `placementFeeBps()`, `maxOrdersPerUser()`, `openOrderCount(0xDEAD)` — sanity on ABI + address.
3. `eth_call` dry-run `placeOrder` for USDT→BOT with a funded impersonated address (via state override) to confirm the call succeeds and to sanity-check that BOT-out orders leave WBOT unwrapping to the keeper filler path.
4. Live: place a small USDT→BOT order at a limit close to spot, watch keeper fill, confirm `OrderFilled` event arrives and UI flips to `filled`.

## Explicit non-goals this phase

- CA↔USDT limit orders (unfillable as single order; needs product decision).
- Running our own keeper — external keepers fill; we only place / cancel / display.
- Editing bridge, swap, or fee flows.

## One question before I build

CA↔USDT limit orders can't be a single on-chain order in v3 — the executor stores one `routerId`, and no keeper will fill a V2→V3 chain. I plan to **disable** CA↔USDT in the limit UI with a helpful message and keep CA↔BOT / BOT↔USDT / USDT↔BOT / BOT↔CA / USDT↔CA-via-instant-swap fallback. Confirm this is acceptable, or reply "simulate CA↔USDT as two chained orders" and I'll add a client-side two-order primitive (place USDT→BOT, then auto-place BOT→CA after the first fills — brittle but doable).
