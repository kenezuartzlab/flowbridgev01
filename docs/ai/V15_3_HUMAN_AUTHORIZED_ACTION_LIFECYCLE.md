# V15.3 — First Human-Authorized Flow AI Action Lifecycle

## Authority model (frozen from V15.2)

- `ActionIntent` statuses unchanged: `PREPARED / SIMULATED / READY_FOR_USER / REJECTED / EXPIRED / HANDED_OFF`. No `SUBMITTED`/`CONFIRMED` exists.
- Every AI audit record remains `executed: false`. Flow AI holds no keys, no auto-confirm, no background submission, no admin/treasury authority.
- Privacy guard, memory scopes, evidence verification, skill sandbox, reward economics, staking, Partner Studio governance and BOT Mainnet promotion state are untouched.

## What V15.3 adds (code)

| Piece | Purpose |
| --- | --- |
| `src/lib/ai/intentHandoff.ts` | Link-level correlation (`intent`, `fp`, `exp`, `itype`, `ichain`), `handoffFingerprint` + FNV-1a digest, `evaluateHandoff` verdicts, and the client observation store. |
| `src/lib/ai/actionIntent.ts` (`buildHandoff`) | Every deep link now carries the intent id, economic fingerprint digest, expiry, type and chain. |
| `src/components/assistant/AiHandoffBanner.tsx` | Trade-side notice: recomputes the fingerprint from the linked values + registry-resolved router and reports `FRESH / EXPIRED / FINGERPRINT_MISMATCH / CHAIN_MISMATCH / MALFORMED`. Never grants execution. |
| `src/App.tsx` | Mounts the banner on the swap and bridge tabs and feeds it the observed tx hash. |
| `src/lib/ai/flowAi.server.ts` | Prompt rule: prepared-by-AI / authorized-by-user wording; pending instead of assumed completion. |
| `src/lib/ai/intentHandoff.test.ts` | 8 invariants: correlation present, fresh accepted without execution authority, altered amount refused, substituted token refused, expiry refused, wrong chain refused, malformed ignored, digest change-sensitive. |

## Handoff contract

1. Flow AI prepares + simulates server-side (`/api/assistant/intent`) and returns `READY_FOR_USER` only when simulation and deterministic policy both pass.
2. The review card deep-links to `/trade` with **hints plus correlation metadata**.
3. Trade recomputes the fingerprint from the values it is about to use. Any altered economic field, expired plan, or different network invalidates the prior proof and requires a fresh preparation. The old simulation is never trusted.
4. Only after Trade's own re-resolution (router/token/chain/balance/allowance/quote) does the normal wallet confirmation appear. The user signs.
5. The intent→tx link is stored as an observation (`observedTxHash`, `observedOutcome`, `submittedBy: USER_WALLET_VIA_TRADE`, `executedByAi: false`) — never as an AI execution status.

## Live canary — remaining human step

The one blockchain transaction in this gate can only be broadcast by the user's own wallet. Runbook:

1. Sign in, connect the bound BOT Testnet wallet (needs ~10 USDT and BOT for gas; existing USDT allowance so no approval tx is needed — if an approval is required, stop and report the two-transaction variant).
2. Ask Flow AI: `Prepare a small USDT to BOT swap for me on BOT Testnet.`
3. Confirm the review card shows `READY_FOR_USER`, amount/token, chain, canonical router, expiry and evidence.
4. Tamper check: on `/trade`, edit one economic value in the URL (for example `amount`) or wait past `exp`. The banner must switch to `FINGERPRINT MISMATCH` / `EXPIRED` and require a fresh preparation. Do not sign the tampered proposal.
5. Re-prepare, follow the fresh link, and authorize the swap in the wallet — exactly one transaction.
6. Ask Flow AI: `What happened with the swap you prepared for me?` Flow AI must explain from canonical evidence and state that it prepared while the user authorized and signed.
7. Report tx hash, block, receipt status, router target, SwapActivity identity, and the independent FLOW Points V2 / campaign PTS deltas before and after.
