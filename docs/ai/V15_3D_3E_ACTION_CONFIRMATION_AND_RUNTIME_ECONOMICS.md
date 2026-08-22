# V15.3D / V15.3E — Action confirmation state machine + canonical runtime economics

## V15.3D — Action confirmation and handoff state machine

Defect fixed: after Flow AI prepared an action, a reply like "Proceed" or
"Authorized" fell into generic chat and the prepared plan was lost.

- `src/lib/ai/actionContinuation.ts` (pure) models the preparation lifecycle
  (`COLLECTING_FIELDS → PREPARING → READY_FOR_USER → HANDED_OFF`, plus `EXPIRED`
  and `REJECTED`) and a client-carried `PreparedHandle` hint.
- `classifyContinuation` recognizes proceed / cancel / bare affirmatives.
  `resolveContinuation` only continues a plan for the same actor, wallet, chain
  and while it is unexpired; otherwise it returns `EXPIRED`, `CANCELLED` or
  `CONTEXT_CHANGED`.
- `flowAi.server.ts` resolves continuation BEFORE pending-slot routing and
  generic retrieval, and answers deterministically (no model call).
- Chat never asks for a confirmation it cannot honour: preparation and
  simulation are read-only, so the only completion is the review handoff into
  `/trade`, `/stake`, `/earn` or `/studio`, where the user's wallet signs.
- `ActionIntentCard` restates that no chat confirmation is needed or possible.

Authority boundary unchanged: Flow AI prepares and simulates; the user signs.

## V15.3E — Canonical runtime truth for mutable economics

Defect fixed: the assistant cited a documented 0.1% platform fee even when the
router's on-chain `globalFeeBps` said otherwise.

- `src/lib/ai/runtimeFeeTruth.server.ts` reads `getFeeConfig()` and
  `feeConfigNonce()` with `eth_call` from the registry-resolved router. No
  caching, no prose fallback; a failed read is disclosed.
- `src/lib/ai/economicsGuard.ts` (pure) detects fee-bearing questions, extracts
  percent/bps claims from a drafted answer, and contradicts the draft whenever it
  disagrees with live chain state — or marks it unverified when no authoritative
  evidence exists.
- Knowledge base no longer stores a fee number: the fee fact now states that the
  value is mutable on-chain configuration and must be read live.
- System prompt forbids stating mutable economics (fees, bps, treasury, nonce,
  staking rates, budgets) without on-chain or authoritative-state evidence.
- Prepared plans carry `economics` (live fee bps, fee config nonce, expected out,
  balance, allowance) and the review card renders it.

Tests: `actionContinuation.test.ts` (6), `economicsGuard.test.ts` (6).
