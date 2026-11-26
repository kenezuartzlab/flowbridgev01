# Threat model (V1.13, PRIVATE)
| Threat | Control | Residual |
|---|---|---|
| Arbitrary target / calldata | Fixed WBNB/USDT/Pancake router constants; no generic call | Relies on those contracts' code |
| Reentrancy via callbacks | `guarded()` lock; pause also blocked while locked | 6 Slither HIGH OPEN pending human review |
| Fee-on-transfer / donations | Exact balance deltas; mismatch reverts | Donations can only cause revert (griefing) |
| Stale quote / MEV | User-approved `minNetOut`, deadline, block-age; quote snapshot is **caller-provided, not an oracle** | Sandwich within user slippage remains possible |
| Fee mis-config | Constructor rejects WBNB/USDT/router as guardian or recipient; fee cap immutable | Direct EOA Treasury preference recorded; rate UNSELECTED and issuer restriction UNKNOWN (D-03) |
| Guardian abuse | Pause-only immutable guardian; no sweep/upgrade/owner | Direct EOA preference gives one key pause/unpause; compromise toggles pause; lost key cannot rotate and a paused contract may remain blocked (D-02) |
| Immutable recipient custody | Constructor fixes feeRecipient; no sweep/rotation | Treasury compromise can divert received fees; USDT issuer/transfer restrictions remain UNKNOWN; replacement requires redeployment |
| Wrong chain/tier | chainId 56; tiers 500/2500 only | — |
| Wallet phishing / signing | Execution disabled; review policy `canSign: false` | Device tests unverified |
| WalletConnect zod@3.22.4 | Disabled on every host (code hold) | Package still INSTALLED — advisory OPEN |
