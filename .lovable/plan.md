# MultiSend V1 — BOT Testnet Release Gate

## Goal
Prepare and validate the MultiSend contract for BOT Testnet (chain 968), then deploy only through an explicit wallet-authorized transaction.

## Work
1. Normalize the contract package so the pinned Solidity 0.8.20 compiler resolves all sources consistently.
2. Complete the contract test coverage required by the V1 brief, including ownership, pause, rescue, limits, stale review protection, permit, reentrancy, and atomic failure cases.
3. Add repeatable release scripts that compile with Shanghai settings, report contract-size headroom, produce frozen ABI/bytecode fingerprints, and run static safety checks.
4. Add a BOT Testnet deployment flow that validates chain 968, constructor owner and fee-recipient addresses, deployed bytecode, default 1 bps fee, recipient limit, nonce, pause state, and ownership before recording an address.
5. Keep deployment wallet-authorized: no private keys or recovery phrases in the app, repository, or scripts. Stop for approval before the contract-creation transaction.
6. After deployment, verify the contract and run small native BOT and supported ERC-20 rehearsals for Distribute, Consolidate, and Advanced modes.
7. Add the verified testnet address to the canonical deployment inventory, enable BOT Testnet signing, and verify mobile/desktop Review, signing queue, partial completion, Activity, and CSV receipts.

## Hard Gates
- No BOT Mainnet, BNB Testnet, or BNB Mainnet deployment.
- No Router, Bridge, Rewards, Staking, token, liquidity, oracle, or governance changes.
- Do not enable the app from an unverified address.
- Deployment owner and fee recipient must be explicitly approved before broadcasting.

## Approval Needed at Broadcast
The deployment transaction requires the approved BOT Testnet owner wallet and fee-recipient wallet. The app will request the wallet signature; no signing secret will be collected.
