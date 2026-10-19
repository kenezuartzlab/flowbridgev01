# V36.7.1 publisher confirmation hotfix

## Root cause
PublishBatchPanel used a separate fetch helper that omitted x-wallet-address on history, polling and recheck. requireAdmin requires an authenticated verified admin/operator and a matching bound wallet. The missing context returned 403 even when the chain transaction succeeded.

## Changes
- All publisher requests carry the current Ops bound-wallet context; authorization remains server-side.
- Exact stored batch fingerprint/root required. Before wallet submission, PUT rebuilds live eligibility and simulation and inserts a unique chain/distributor/epoch attempt. No automatic expiry or unlock.
- The original attempt/hash survives refresh through scoped device recovery and server history. Recheck performs only read-only verification. Local storage never establishes authority.
- Verification requires chain 677, transaction+receipt, sender/recipient, exact publishEpoch calldata/value, publisher role at receipt block, EpochPublished event with exact epoch/root/allocation/window, canonical receipt block plus a successor block, stored proofs and live round state.
- The confirmation RPC locks attempt and batch and atomically updates verified publication plus one audit. Eight concurrent confirmations produced one confirmation and one audit in an isolated database.
- Post-round-2 builder discovery also rechecks the stored confirmed receipt before serving allocations; historical rounds 1/2 unchanged. Canonical claim readiness remains the notification source.
- Dropped, missing, rejected, reverted, mismatched or unknown submissions remain locked for investigation. This deliberately favors safety over automatic retry. No new transaction is sent on recheck.

## Verification
- 1,796 tests / 165 files passed; automatic production build/type validation OK.
- 35 new receipt identity, RPC recovery and authorization regressions.
- Exact migration atomic rollback test: correct hash, duplicate epoch rejection, idempotent one-audit confirmation, no residual test rows.
- Eight concurrent local database submissions: one epoch lock. Eight concurrent confirmations: one audit.
- Local BOT Mainnet fork: publishEpoch eth_call succeeded returning epoch 3; no broadcast or signature; epochCount remained 2; unauthorized eth_call reverted.
- Signed-in real account with simulated non-signing wallet transport: Ops Rewards loaded, authenticated history returned 200; absent wallet header 403; signed-out 401. 320/390/430/1280px without horizontal page overflow; empty Review & Publish disabled.
- Read-only Mainnet: epochs 2, round 1 index 0 claimed, round 2 index 0 claimed, unpaused; zero eligible funded wallets; automatic signing OFF.
- Fresh available security scan: no new actionable findings. External connector scanner unavailable.

## Limits / release evidence
Physical TokenPocket and real signed publisher acceptance are not performed; this task authorizes neither signatures nor real rounds. The successful on-chain-publication lifecycle is covered by mocks, isolated SQL concurrency and read-only fork simulation, not a new payout transaction.
Published and independently verified https://flowbridge.space: bound-wallet history 200; missing wallet 403; signed-out 401; empty Review & Publish disabled; zero eligible funded wallets; automatic signing OFF. Verified on phone and desktop sizes with simulated non-signing wallet transport. Final independently served Ops hotfix bundle: ops-1XH0UuF7.js, SHA256 93720d9fe9637602e606cbf7d6237b604ae5896950747ea11e34d5c32af3f3da. Confirmed attempts clear the local pending lock; the durable server epoch lock and original hash remain in history.
No contracts, treasury, roles, economics, program funding or payout rounds changed.
