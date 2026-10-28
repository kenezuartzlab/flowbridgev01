# Finish existing Liquidity V1 safely

## Scope
- Preserve Smart Trade, FlowBridge swap routing and the direct CaSwap CA route.
- Finish the existing Add, Create Pool, My Positions, Remove and Collect flows rather than rebuild them.
- Correct exact initial-price math, stale wallet/network handling, approvals, transaction previews and uncertain receipt handling.
- Show unavailable reads honestly and prevent stale positions from being acted on after account/network changes.

## Safety and acceptance
- Verify BOT Mainnet router/factory/wrapped-token relationships and deployed contract support with read-only calls.
- Keep unsupported CaSwap add/create disabled; V2 fees remain inside LP reserves rather than a separate claim.
- Keep Mainnet liquidity writes closed until separately authorized canaries pass. No contract deployments or financial transactions during this work.
- Run targeted safety tests, swap regressions, fresh security checks and desktop/mobile checks at 320, 390 and 430px.
- Publish only when mandatory acceptance passes; report remaining wallet/canary blockers explicitly.

## Technical details
- Extend the existing liquidity adapters, pure math modules and shared transaction executor.
- Enforce chain, account and adapter capabilities before every approval/signature, not only through disabled buttons.
- Use bigint rational arithmetic for pool initialization and deposit ratios; confirm success only from receipts.