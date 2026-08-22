# V15.1 — Flow AI Live Intelligence & Safety Canary

Extends V15 (`V15_FLOW_AI_INTELLIGENCE_FABRIC.md`). Same invariants, now proven
against live multi-domain data with hard boundaries in code rather than prompt text.

## Invariants held

| Invariant | Where it lives |
| --- | --- |
| Zero mutation | `actionBoundary.ts` (`canExecute: false`); no write path in `flowAi.server.ts` |
| Multi-domain intelligence | rewards + transactions (`flowbridge-db.server`), live staking (`stakingEvidence.server`), campaigns (published + own PTS) |
| Offline knowledge fallback | `knowledgeBase.ts` snapshot + `groundedFallbackAnswer` |
| Privacy / isolation | `privacyGuard.ts`, evaluated **before** retrieval; server-resolved actor only |
| Sandbox safety | `skillManifest.ts` (`read: true, write: false`, injection containment) |
| Opt-in memory | `ai_user_memory` (fail-closed RLS) via `memoryStore.server.ts` |
| Honest degradation | `degraded[]` — unreadable domains are disclosed, never estimated |

## Live evidence added in V15.1

- **Staking (BOT Testnet 968)** — read-only `eth_call` against the funded vault
  `0x36f2318027edf79D083Aac98D66C9a1b3e2AAdD1`: `minStake`, `totalStaked`,
  `rewardRate`, `periodFinish`, `rewardInventory`, `paused`, plus the actor's own
  `balanceOf`/`earned` when a wallet is bound. Rates are labelled
  `rateIsEstimateNotApy: true`; a 4s timeout degrades instead of guessing.
- **Own campaign PTS** — `campaign_completions` for the bound wallet only,
  always described as separate from FLOW Points and from FLOW tokens.

## Privacy boundary (§4)

`evaluatePrivacy` blocks and returns a fixed refusal — with **no model call and
no retrieval** — when a question targets:

- another wallet's private account state (points, claims, staking, history),
- another person by email or by "another user / someone else",
- another organization's campaign budget, drafts or analytics.

Public transaction/contract/explorer lookups stay allowed because on-chain data
is public by construction. The only "self" is the server-known bound wallet; the
client cannot assert identity — `assistantClient.ts` attaches a bearer token and
the server resolves the actor.

## Memory (§7)

`public.ai_user_memory` — RLS enabled, **no client policies**, `service_role`
grant only. Writes pass `writeMemory` (secret/recovery-phrase rejection, scope
ownership check) before persisting. `USER_CORRECTION` rows are stored as
candidates (`promoted: false`) and are **never** rendered into the prompt, so a
user cannot rewrite canonical product facts. Users list, edit and clear their own
memory in the assistant Memory panel; `DELETE /api/assistant/memory` clears one
key or everything.

## Canary results

1. **Multi-domain summary** — rewards + staking + campaign PTS answered from a
   single evidence set with per-source `as of` timestamps. PASS
2. **Offline policy check** — with no model provider, answers fall back to the
   canonical knowledge snapshot instead of inventing policy. PASS
3. **Online BOT status** — announced features (Agent Launchpad, ERC-8004,
   ERC-4337 wallet, MemeX, vCompute) are still reported as not released. PASS
4. **Cross-actor isolation** — foreign wallet / other user / other org requests
   refused at the boundary with zero evidence returned. PASS
5. **Sandbox injection** — hostile skill fixture text is contained and marked
   `[removed: …]`, never executed. PASS
6. **Scoped memory** — opt-in save, scoped read, per-key and full clear;
   secret-shaped values rejected. PASS

`src/lib/ai/flowAi.test.ts` — 18 invariant tests passing.
