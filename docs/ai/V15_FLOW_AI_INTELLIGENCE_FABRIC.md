# FlowBridge V15 — Flow AI Intelligence Fabric (BOT Chain Compatibility Gate)

Flow AI is an evidence-grounded intelligence layer, not a chatbot bolted on top of the app.
Intelligence is probabilistic; **authority is deterministic**.

## Invariants

1. **Read-only.** No skill and no model output can sign, submit, claim, stake, publish, approve
   or mutate product state. `actionBoundary.ts` hard-codes execution to `false`; skills carry
   `writeAuthority: false`.
2. **Server-resolved identity.** `/api/assistant` resolves the user, partner orgs and internal
   operator status before any private read. The model never decides authorization.
3. **Evidence or silence.** Every answer carries source class, freshness and an as-of timestamp.
   When live state is required but unavailable, confidence degrades to `ESTIMATED`/`STALE`/
   `UNAVAILABLE` and the answer says so instead of guessing.
4. **Authoritative state outranks prose.** DB and chain readings beat docs (`sourcePrecedence.ts`).
5. **Deterministic math.** Points, claims and staking estimates are computed in
   `deterministicMath.ts`; the model only narrates the computed values.
6. **BOT honesty.** Adapters are status-aware. EVM RPC and Explorer are live on BOT Testnet 968.
   Agent identity (ERC-8004), Agent Wallets (ERC-4337), the AI Agent Launchpad, MemeX and vCompute
   are **announced, not released**, and may not be described as live until verified release
   evidence promotes them.
7. **Memory is opt-in and scoped.** Private, partner-org and global scopes; secret-looking values
   (recovery phrases, keys) are refused outright.
8. **Untrusted text is data.** Partner/project/web text is contained (`containUntrustedText`);
   instruction-like content is stripped and audited.

## Architecture

| Layer | Module |
| --- | --- |
| Vocabulary & actor model | `src/lib/ai/aiTypes.ts` |
| BOT capability registry | `src/lib/ai/botCompatibility.ts` |
| Source precedence & conflicts | `src/lib/ai/sourcePrecedence.ts` |
| Revisioned knowledge base | `src/lib/ai/knowledgeBase.ts` |
| Specialist skills & scopes | `src/lib/ai/skillRegistry.ts` |
| Orchestrator (intent → plan) | `src/lib/ai/orchestrator.ts` |
| Execution boundary | `src/lib/ai/actionBoundary.ts` |
| Evidence verification | `src/lib/ai/evidenceVerifier.ts` |
| Memory scopes | `src/lib/ai/memoryScopes.ts` |
| Deterministic math | `src/lib/ai/deterministicMath.ts` |
| Provider-agnostic model gateway | `src/lib/ai/modelGateway.server.ts` |
| Scoped retrieval + synthesis | `src/lib/ai/flowAi.server.ts` |
| External skill manifest + sandbox harness | `src/lib/ai/skillManifest.ts` |
| Endpoint | `src/routes/api/assistant.ts` |
| Surface | `src/components/assistant/AssistantChat.tsx`, `/assistant` |

## Model portability

`modelGateway.server.ts` routes a request across ordered providers (Lovable AI Gateway by
default). Providers can be added or reordered without touching product state. When no provider is
reachable, `groundedFallbackAnswer()` still returns the retrieved evidence — degraded, never
fabricated.

## Ecosystem skills (§8)

External BOT projects publish a FlowBridge skill manifest (`skillManifestSchema`) and validate it
with `runSkillHarness()` before it can be enabled. Manifests requesting write authority are
rejected by schema. The sandbox grants no access to user data, org data or secrets, caps timeouts
and retries, and treats all returned text as untrusted data.

## Test coverage

`src/lib/ai/flowAi.test.ts` proves: no write planning, action requests produce a notice,
anonymous actors cannot reach private skills, live facts are declined without evidence, announced
BOT features are never called live, promotion is blocked without release evidence, write-authority
manifests are rejected, the harness catches injection and missing evidence fields, and secret-like
memory writes are refused.
