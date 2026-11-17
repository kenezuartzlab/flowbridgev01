# FlowBridge BNB Swap Adapter V1 — LOCAL CANDIDATE (NOT DEPLOYED)

Status: HOLD. Not deployed, not audited, not registered in any app manifest, router config, feature flag or token registry.
Fenced by `src/lib/bnb/adapterCandidateFence.test.ts` (frozen source hash, no references from `src/` or `contracts/production/`).

- Scope: native BNB → USDT and USDT → native BNB only, one immutable PancakeSwap V3 SwapRouter and pool fee (500 or 2500).
- No owner/admin/pause/sweep/arbitrary calldata; recipient is always `msg.sender`.
- Wrapping via `WBNB.deposit/withdraw` inside the adapter; never leaves BNB in the router.
- Exact approvals, cleared allowance check, balance-delta accounting (fee-on-transfer rejected), zero-residual assertion.
- Platform fee from output; `minNetOut` enforced after fee. Fee bps accepts only 5 or 10 (owner PROPOSAL values; no recipient chosen).
- Deadline must be ≤ 120 s ahead; chain 56 enforced at construction and every call; non-reentrant.
- Known trade-off: tokens sent directly to the adapter are permanently stuck (no sweep by design).

Commands: `node contracts/candidates/bnb-swap-adapter-v1/scripts/compile.mjs` (rewrites MANIFEST.json),
`bunx vitest run contracts/candidates/bnb-swap-adapter-v1` (synthetic mocks), `bun scripts/bnb-native-acceptance.ts` (read-only mainnet eth_call simulation).
Before any deployment: independent manual audit, owner fee/recipient decision, funded testnet/fork rehearsal under separate authorization.
