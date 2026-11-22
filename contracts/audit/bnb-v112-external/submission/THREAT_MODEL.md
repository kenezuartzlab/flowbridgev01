# Audit threat model — final V1.12

## Assets and trust boundaries
Only chain 56, fixed WBNB/USDT and Pancake V3 SwapRouter; only 500/2500 fee tiers. Users own their input and choose their net floor. Native input is wrapped by the adapter; native output unwraps only user net, while fee stays WBNB. Exact router allowances, no owner sweep, no upgrades, no generic token/router/call path. Guardian and fee recipient are immutable. Input ceilings are candidate safety bounds, not owner-approved economic policy.

The quote structure binds caller, chain, tokens, router, tier, amount, deadline, timestamp and recent canonical block. It is **not a signed oracle, commitment to pool state, MEV protection or single-use nonce**. A repeated user call spends new input; there is no relayer or privileged replay mechanism.

## Required adversarial review
1. Trace all six HIGH balance-snapshot findings: balance before WBNB deposit, USDT transferFrom or router approve/swap; compare measured deltas after external calls. Lock is acquired before external calls and prevents swaps and pause reentry. Do not remove equality/residual checks to silence Slither.
2. Real-target semantics: fixed WBNB deposit/withdraw; USDT transfer/mint authority; router/pool callbacks and exact allowance consumption. A malicious replacement token consistently lying about balances is outside immutable-code assumptions; assess chain governance, future runtime behavior and legal/censorship risk.
3. Callback/reentrancy at deposit, withdrawal, approvals, input/output transfers, router callback and user native receiver. Distinguish mock capabilities from actual WBNB/USDT code; static balance reads cannot mutate state.
4. Approve/transfer return handling: empty success, false, malformed returns, blacklist/tax behavior; atomic rollback on failure, zero lasting allowance, router over/under-pull and mismatched output.
5. Net settlement: exact fee rounding and earliest gross router floor, measured final net/residual checks, integer overflow fail-closed, meaningful user min floor, dust and proposal fee boundaries.
6. MEV/front-running: deadline/age/block guards do not prevent sandwiching within accepted slippage; quantify losses and propose owner-reviewed execution limits. No arbitrary price oracle or recommendation authorization.
7. Pause/censorship: guardian-only pause/unpause, cannot be zero or adapter itself, cannot mutate fees/tokens/treasury, cannot sweep; consider lost guardian and gas-grief/native-recipient denial of service. No transfer of guardian authority exists.
8. Forced native/token donations: remain isolated and stranded; no public sweep, no ability to consume another user's approvals. Review receiving-only-from-WBNB and unexpected router refund rejection. Legitimate user receiver refusal must revert the complete swap.
9. Context: tiers verified against canonical factory; cross-wallet/token/chain/router snapshots rejected; 30-second age / 100-block lag / 120-second deadline ceilings and reorg checks. Assess canonical blockhash timing and transaction inclusion.
10. Deployment assurance: final bytecode and immutable substitution must match signed report, target chain hardfork and external code hashes. No deployment is authorized here.

## Evidence versus unresolved assurance
74 final-candidate unit/adversarial tests include 128 seeded alternating swaps; separate real-bytecode fork exercises both directions/tiers, pause, min floors, hostile payout and donations. Six HIGH paths remain open pending independent auditor judgment. No profitable reentrancy exploit reproduced; this does **not** prove absence. Fuzzing is seeded finite coverage, not mathematical verification. Dependency HIGH remains independent of contract findings. Final report must enumerate limitations, findings, remediation and residual risk without claiming automated evidence is an independent audit.