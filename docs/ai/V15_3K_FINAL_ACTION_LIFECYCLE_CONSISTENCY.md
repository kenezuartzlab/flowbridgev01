# V15.3K — Final Action Lifecycle Consistency

Closes the last five inconsistencies between what Flow AI prepared, what the
review card showed, and what `/trade` presented before the user's wallet signed.
Authority is unchanged: Flow AI prepares and simulates read-only; only the user's
own wallet authorizes anything.

## §2 — Two-turn slot convergence

`applyAmountToSession` (`src/lib/ai/actionSession.ts`) lets an amount-only reply
("10", "10 USDT") complete the durable action session even after the transient
pending slot was consumed. The orchestrator tries it before re-parsing the turn as
a fresh sentence.

`normalizeRequest` (`src/lib/ai/preparationRouting.ts`) is the single canonical
normalized request. One-shot and two-turn phrasings reduce to the same object, so
both produce byte-identical intent parameters and fingerprint inputs.

## §3 — One expiry authority

`effectiveStatus`, `isReadyForUser` and `secondsRemaining` in
`src/lib/ai/actionIntent.ts` derive status from `expiresAt` at read time; a stored
`READY_FOR_USER` is never trusted past the deadline. `ActionIntentCard` ticks each
second and renders the badge, the countdown and the CTA from that one source, so a
card can no longer read READY with 0s left.

## §4 — One fee truth on Trade

The disclosed platform-fee row in `UniversalSwapCard` reads FlowBridgeRouter's
mutable `getFeeConfig()` live and labels it `live`; the published config only
supplies head-room and is labelled "rechecked before signing". A 0 bps router fee
is stated explicitly instead of contradicting the published 0.1%.

## §5 — Native BOT vs wrapped WBOT

`BOT` resolves as the native asset and `WBOT` as the wrapped ERC-20. The asset kind
travels with the plan (`tokenInIsNative` / `tokenOutIsNative`), is part of the
canonical snapshot, is included in `economicFingerprint` and the handoff digest,
and hydration restores the native token for a native leg. Substituting one for the
other changes the digest and cannot pass silently.

## §6 — Approval honesty

When the live allowance read at preparation time is below the amount, the review
card states that two wallet confirmations are required, and Trade's CTA reads
"Approve then Swap · 2 wallet confirmations". Slippage is labelled as slippage, not
"Auto".

## Tests

`src/lib/ai/actionLifecycleConsistency.test.ts` — 591 tests pass.
