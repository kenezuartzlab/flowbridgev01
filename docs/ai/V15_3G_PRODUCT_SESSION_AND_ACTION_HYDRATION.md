# V15.3G — Product session + action hydration final integration

Route-local state was the last continuity defect: `App` is rendered by both `/`
and `/trade`, so every navigation unmounted it and re-ran its initializers.

## §1–§3 One root app-session model

`src/lib/trade/tradeSession.ts` owns Trade mode and the swap draft in a
module-scope store above the route tree (memory only — a real browser reload
legitimately resets it, SPA navigation cannot).

- `useTradeTab()` replaces `useState<TabId>` in `App.tsx`.
- The route-progress default applies once per runtime and never over a user
  choice (`applyDefaultTradeTab`).
- Deep links and ActionIntent handoffs use `applyExplicitTradeTab` with a hint
  key, so a stale URL cannot re-select a tab on a later remount.
- `UniversalSwapCard` restores/persists `{ tokenIn, tokenOut, amount }` scoped to
  the rendered network; the network-change reset now fires only on an actual
  scope change instead of on every mount.

## §5 AI draft continuity

`conversationStore` gained `composerDraft` (`setConversationDraft`), so unsent
composer text survives navigation and is discarded on owner change with the rest
of the transcript.

## §6 Product observation

`recordConversationObservation` lets Trade report `HANDOFF_HYDRATION_FAILED` /
`HANDOFF_HYDRATED` back into the conversation. Flow AI surfaces the failure and
offers "Prepare it again"; Trade shows the reason plus a link back to Flow AI.
An observation carries no calldata and grants no authority.

## Navigation

Internal footer/admin links use `Link`, so no in-app link triggers a document
reload (and therefore no session reset).

Authority boundary unchanged: Flow AI prepares and simulates; the surface
revalidates registry, balance, allowance, live fee/nonce, quote and simulation;
only the user's wallet signs.

Tests: `tradeSession.test.ts` (6), `conversationStore.test.ts` (+3) — 552 passing.
