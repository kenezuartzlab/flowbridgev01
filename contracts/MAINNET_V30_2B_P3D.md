# V30.2B P3D — 30D Mainnet Canary Locked Genesis Activation

Chain 677 (BOT Mainnet). Read-only pre-signing gate + fail-closed UI policy.
**Mainnet writes performed by this gate: 0.**

## Canonical contracts

| Role | Address |
| --- | --- |
| FLOW (R1) | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` |
| Reward Treasury (R4) | `0x96552909998F3DbAf5Ff4979dc158508b3442e65` |
| Staking Controller (R5) | `0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF` |
| Staking Vault V2 (R6) | `0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D` |
| Canary wallet | `0x3d8a7fa490f9db09dd8006b74688213ace9c0164` |

## Pre-signing gate — `scripts/p3d-preflight.mjs`

Block `21882347`, timestamp `1788395630`. **26 / 26 checks PASS, 0 failures.**

- Oracle `0x0000000000000000000000000000000000000000`; emergency mode false; vault unpaused.
- EPOCH_ROLE to controller: not granted. PUBLISHER_ROLE: not granted. No standard epoch.
- Product 1 active — lock `2592000s`, Genesis `2700 bps`, floor `800 bps`, min principal `1 FLOW`.
- Treasury free `9999999.999993013698630138 FLOW`; Genesis Year-1 remaining `999999.999993013698630138 FLOW`; standard Year-1 remaining `2000000 FLOW`.
- Canary balance `1.000006706621004566 FLOW`; allowance to R6 already exactly `1 FLOW`; Genesis quota remaining `7774776s`.
- Live `quoteOpen(1, canary, 1 FLOW)` matched independent arithmetic exactly:
  Genesis `2700 bps` / `2592000s` / `0.022191780821917808 FLOW`;
  floor `800 bps` / `0.006575342465753424 FLOW`; total reservation `0.028767123287671232 FLOW`.
- TX1 (`approve`) and TX2 (`openPosition`) both simulate successfully.

Evidence: `contracts/production/v30-2b-staking-locked-products/P3D_PREFLIGHT.json`.

## Authorized writes (user-signed only, not executed)

1. **TX1** — `FLOW.approve(0x15e7B1b4…790D, 1000000000000000000)` from the canary wallet.
2. **TX2** — `Vault.openPosition(1, 1000000000000000000)` from the canary wallet.

No batching, no auto-signing, no substitute wallet, no third transaction. No canary
signing key exists in this environment, so both must be signed in the wallet UI.

## UI policy shipped (fail-closed, currently gated off)

- `src/lib/staking/mainnetLockedStaking.ts` — locked-product execution policy driven
  strictly by live `quoteOpen()` + live pause / emergency / product / capacity / funding
  reads. APR only (never APY, never compounded). Exact allowance, never unlimited.
  Approval and opening are separate confirmations. Quote fingerprint freeze rejects any
  economic drift between the shown and signed quote.
- `src/lib/staking/useMainnetLockedStake.ts` — live per-wallet state and quote reads; any
  read failure yields an honest unavailable state rather than an optimistic default.
- `src/components/staking/MainnetLockedStakeCard.tsx` — 30D / 90D / 180D / 365D surface
  showing live Genesis APR, this wallet's remaining Genesis days, the reserved Genesis and
  floor obligations, the unlock date, and Genesis-then-floor-only phase copy for terms that
  outlive the wallet's Genesis coverage. Variable target / hard-cap rates are never shown
  as earnings.
- `V30_2B_FEATURE_ACTIVATION.lockedGenesisStakingEnabled = false` — the card renders
  nothing and the policy blocks until TX2 settles. Flipping that single flag to `true` is
  the whole activation step.

## Verdict

```
P3D: BLOCKED (pre-signing gate PASS, authorized canary writes not executed)
TX1 approve(R6, 1 FLOW): NOT BROADCAST — live allowance already exactly 1 FLOW
TX2 openPosition(1, 1 FLOW): NOT BROADCAST — requires canary wallet signature
PRODUCT STATES: 30D/90D/180D/365D policy shipped, gated off (flag false)
ORACLE: 0x0 UNCHANGED
ROLES: UNCHANGED
30D REAL MATURITY WITHDRAWAL: PENDING
```

**Next action:** sign TX2 `openPosition(1, 1000000000000000000)` on the Vault from
`0x3d8a…0164` (TX1 allowance is already exactly 1 FLOW), then run the settlement check and
set `lockedGenesisStakingEnabled` to `true`.
