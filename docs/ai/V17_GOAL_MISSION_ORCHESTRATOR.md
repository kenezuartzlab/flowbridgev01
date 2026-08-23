# V17 — Flow AI Goal + Mission Orchestrator

Flow AI can now hold a **goal** across turns and surfaces. A Mission is a plan,
never authority: `Mission = Plan`, `ActionIntent = Authority`.

## Modules

| File | Role |
| --- | --- |
| `src/lib/ai/mission/missionTypes.ts` | Canonical mission/step model, state machine, failure classes, forbidden capabilities |
| `src/lib/ai/mission/goalNormalizer.ts` | Deterministic natural-language → typed `MissionGoal`, explicit constraints, multi-turn merge |
| `src/lib/ai/mission/missionPlanner.ts` | Typed step DAG, single next-eligible step, edit preview / replan |
| `src/lib/ai/mission/missionProgress.ts` | Grounded transitions, canonical completion, recovery advice |
| `src/lib/ai/mission/missionEngine.server.ts` | Prepares the next step through the V15.3 pipeline; advances only from canonical evidence |
| `src/lib/ai/mission/missionStore.server.ts` | Service-role persistence (`ai_missions`), owner-scoped, fails closed |
| `src/routes/api/missions.ts` | create / refine / prepare-next / edit-preview / edit / advance / retry / pause / resume / cancel |
| `src/components/assistant/MissionPanel.tsx` | Mission surface on `/assistant` |

## Invariants

1. **Nothing executes.** No signing, submitting, approving, publishing or
   auto-continuation. Every response carries `executed: false`.
2. **One action at a time.** Only the next eligible step may reach
   `READY` → `WAITING_FOR_USER`; a second wallet confirmation is never queued.
3. **No precomputed downstream calldata.** A step whose amount depends on an
   earlier result stays `amountUnresolved` until canonical settlement fills it.
4. **Grounded progress.** Swaps complete on a `verified_activity_id`; stake and
   claim on on-chain reads. A bare tx hash is rejected as `CONFIRMATION_PENDING`.
5. **No invented economics.** A vague size ("a small amount") never becomes an
   amount; the goal reports the missing slot instead.
6. **Material edits replan.** `previewEdit` reports the invalidated suffix and
   the prepared intents that will be discarded before the edit is accepted.
7. **Retry means re-prepare.** An expired or failed step is never resumed from a
   stale ActionIntent.

## Phase 1 canary (BOT Testnet 968, zero transactions)

- Goal "Swap 20 USDT to BOT and stake it" produced the 9-step graph with the
  stake amount marked *unresolved until swap confirmed*; preparation of the swap
  step re-entered the V15.3 pipeline, simulated live and returned policy
  `REJECTED` (`INSUFFICIENT_BALANCE`) for the test wallet — the mission blocked
  with machine-readable recovery instead of proceeding.
- Goal "Claim my FLOW rewards and stake it" produced the 7-step graph and its
  first economic step reached `READY_FOR_USER` → `WAITING_FOR_USER`, stopping
  before any wallet signature.
