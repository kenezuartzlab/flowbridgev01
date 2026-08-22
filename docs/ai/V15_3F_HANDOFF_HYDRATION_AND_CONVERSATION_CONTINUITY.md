# V15.3F — Action handoff hydration + Flow AI conversation continuity

Two continuity defects, both fixed without widening authority.

## §1 Handoff hydration (Trade opened empty)

The handoff link already carried validated hints (`from`, `to`, `amount`, chain,
digest), but no surface translated them into form state.

- `src/lib/ai/handoffHydration.ts` (pure): resolves each token hint against the
  registry the surface is about to use (address → native sentinel → symbol),
  normalizes the amount, and refuses partial plans outright
  (`TOKEN_UNRESOLVED` / `AMOUNT_INVALID`) with stated copy.
- `ActionIntentCard` now splits path from query and passes a search record to
  `Link`, so the CTA navigates in-app with hints intact (a single
  `to="/trade?…"` string was treated as a path) and stamps the conversation id.
- `App.tsx` derives a `SwapHydrationPlan` from the parsed hint and the active
  network's curated tokens, selects the swap tab, and renders the failure reason
  instead of a silently empty form.
- `UniversalSwapCard` applies a plan at most once per plan key, so a later manual
  edit always wins. Balance, allowance, live fee/nonce, quote and simulation are
  still re-resolved, and only the user's wallet signs.

## §2 Conversation continuity (transcript lost on navigation)

- `src/lib/ai/conversationTypes.ts` decouples message/evidence types from the UI.
- `src/lib/ai/conversationStore.ts` holds the transcript, pending slot, prepared
  handle and a stable conversation id in a module-scope store above the route
  tree, so Assistant → Trade → Assistant restores the same conversation.
- Ownership gate: `ensureConversationOwner` discards the transcript when the
  signed-in account changes, and expired prepared handles are pruned.
- `AssistantChat` is now a view over that store.

Authority boundary unchanged: Flow AI prepares and simulates; the user signs.

Tests: `handoffHydration.test.ts` (6), `conversationStore.test.ts` (6) — 543 passing.
