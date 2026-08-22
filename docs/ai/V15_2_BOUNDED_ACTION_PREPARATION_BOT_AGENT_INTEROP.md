# FlowBridge V15.2 — Bounded Action Preparation & BOT Agent Interop Gate

Flow AI can now turn a request into a **validated, simulated, expiring plan**.
It still cannot sign, submit, publish or mutate anything. Preparation is not permission.

## Invariants

1. **Execution stays closed.** `FLOW_AI_EXECUTION_ENABLED === false`. No intent status can
   ever be `SUBMITTED`/`CONFIRMED`/`EXECUTED` — `withStatus` throws on them, and every audit
   record carries `executed: false`.
2. **Canonical targets only.** Contracts and token decimals are re-resolved from
   `executionRegistry` / `rewardsRegistry` / `stakingRegistry` server-side. Addresses proposed
   by a model, a URL or an external agent are rejected, never trusted.
3. **Self-only.** Recipients must equal the actor's server-known bound wallet. Preparing for
   another user, wallet or partner org is denied before any read.
4. **Evidence or no plan.** Missing balance/allowance/quote/vault state yields `NOT_READY`,
   never an optimistic ready.
5. **Short-lived and replay-proof.** 90 s TTL, plus an economic fingerprint: if amount, token,
   chain, recipient or slippage changes, the simulation is discarded.
6. **Deterministic handoff.** The card deep-links into `/trade`, `/earn` or `/stake`, and the
   product surface independently revalidates before the wallet is asked to sign.
7. **Partner drafts stay drafts.** A prepared campaign draft never publishes; it is bounded by
   the org's Campaign PTS budget and still requires an internal reviewer.
8. **External agents are untrusted read-only data.** Write authority, injection text,
   privilege escalation, substituted recipient/contract/chain, missing evidence, expiry and
   latency overruns are all rejections. Third-party claims enter the candidate pipeline only.

## Modules

| Concern | Module |
| --- | --- |
| Versioned intent envelope, targets, handoff, fingerprint | `src/lib/ai/actionIntent.ts` |
| Deterministic policy engine over injected live state | `src/lib/ai/intentPolicy.ts` |
| Proposal extraction from a sentence (registry-backed) | `src/lib/ai/intentProposal.ts` |
| Live reads, `eth_call` simulation, lifecycle | `src/lib/ai/intentPrepare.server.ts` |
| Official bridge route availability | `src/lib/ai/intentBridgeRoute.ts` |
| Privacy-safe audit + metrics | `src/lib/ai/intentAudit.ts` |
| BOT agent task/result envelopes and verification | `src/lib/ai/agentInterop.ts` |
| Endpoint (prepare + mandatory revalidate) | `src/routes/api/assistant.intent.ts` |
| Review card | `src/components/assistant/ActionIntentCard.tsx` |

## Flow

```text
question → proposeIntent (candidate, registry-resolved)
         → authorizePreparation (self/org only)
         → validateIntentStructure (chain, token, decimals, recipient, contract)
         → readLiveState (balance, allowance, paused, quote, vault, budget)
         → simulate (eth_call, read-only)
         → evaluateIntentPolicy → READY_FOR_USER | NOT_READY | REJECTED | EXPIRED
         → handoff link → product surface revalidates → USER signs
```

## Test coverage

`src/lib/ai/actionIntent.test.ts` (25) and `src/lib/ai/agentInterop.test.ts` (16) prove the
invariants above: tampering rejection, missing-evidence honesty, min-stake and budget limits,
expiry, fingerprint mismatch, cross-actor/cross-org denial, audit non-execution, and every
malicious-agent case. Combined with V15/V15.1, 59 Flow AI invariant tests pass.
