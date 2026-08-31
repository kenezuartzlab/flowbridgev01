# V30.2B P1 — Canonical Mainnet Registry Integration Preflight

**Verdict: PASS — PREPARED, NOT PUBLISHED.** Read-only. 0 signatures, 0 broadcasts,
0 FLOW moved, 0 roots, 0 epochs, no oracle, no publisher, no activation.

Evidence: `contracts/production/v30-2b-registry-integration/P1_PREFLIGHT.json`
(28/28 live checks passed, BOT Mainnet 677, block 21,541,092).

## F2 settlement reconciliation (live)

| Contract | Live FLOW balance |
| --- | --- |
| Rewards Distributor `0x7b805B03…19b922` | 1,000,000 |
| Staking Reward Treasury `0x96552909…442e65` | 10,000,000 |
| Staking Vault V2 `0x15e7B1b4…B6790D` | 0 |
| Treasury Safe `0xeFc13d1A…229Ea4` | 989,000,000 |

Controller: `vault == 0x15e7B1b4…B6790D`, `maxFlowPerEpoch == 50,000 FLOW`,
`weeklyUsdBudget8 == 0`.

## Canonical registry (BOT Mainnet 677 only)

| Contract | Stage | Address | Status |
| --- | --- | --- | --- |
| FlowToken | R1 | 0xcaaB50F36252a57529AFeF651fa6B9f9281917fF | FUNDED_READY |
| FlowRewardsMerkleDistributor | R2 | 0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922 | FUNDED_READY |
| FlowBridgeActivityRegistry | R3 | 0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814 | DEPLOYED_VERIFIED |
| FlowStakingRewardTreasury | R4 | 0x96552909998F3DbAf5Ff4979dc158508b3442e65 | FUNDED_READY |
| FlowStakingController | R5 | 0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF | DEPLOYED_VERIFIED |
| FlowStakingVaultV2 | R6 | 0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D | DEPLOYED_VERIFIED |

No entry is FEATURE_ACTIVE.

## Superseded — audit history only, never canonically selectable

V30.1: FlowToken `0x535dDDA8…0940aE9`, Distributor `0x3824681c…5673FB`,
Activity Registry `0xa80d8740…E68753c`, Staking Treasury `0xA861152C…9d32d0e`,
Controller `0x5095ecc7…1b52bf`, Vault V2 `0x3cc0799f…7B989c8`.
V30.2A: FlowToken candidate `0x123E64D0…101DB63`.

All seven verified at 0 FLOW and rejected by `assertCanonicalSelection`.

## Registry diff

- **Added** `src/lib/deploy/v302bCanonicalRegistry.ts` — six canonical entries,
  lifecycle ladder DEPLOYED_VERIFIED → FUNDED_READY → FEATURE_ACTIVE, superseded
  quarantine list, all-false feature switchboard, `resolveCanonicalAddress`
  (677 only; 968/1024/foreign → null), `assertCanonicalSelection`,
  `activationMatrix`, `canPrepareMainnetEconomicAction`.
- **Added** `src/lib/deploy/v302bCanonicalRegistry.test.ts` (9 tests).
- **Changed** `src/lib/rewards/flowRewardsRegistry.ts` — mainnet `token`/`distributor`
  now resolve from the canonical registry; `claimsEnabled` bound to
  `rewardClaimsEnabled` (false).
- **Changed** `src/lib/staking/flowStakingRegistry.ts` — mainnet `token`/`vault`
  now resolve from the canonical registry; `stakingEnabled` bound to
  `stakingExecutionEnabled` (false).
- **Changed** three existing tests: mainnet blocked reason moves from
  `mainnetPromotionPending` to `claimsDisabled` / `stakingDisabled` — still
  fail-closed, no signing, no preparation.
- **Untouched**: Router v3 live, Router V4 unpromoted, official BOT Bridge direct,
  `src/lib/flowbridge/executionRegistry.ts`, testnet 968 config.

## Activation-state matrix

| Feature | Flag | State |
| --- | --- | --- |
| Reward claims | rewardClaimsEnabled | false |
| Reward root / epoch | rewardRootPublished | false |
| Staking execution | stakingExecutionEnabled | false |
| Dynamic staking | dynamicStakingEnabled | false |
| Oracle | oracleConfigured | false |
| Staking publisher | stakingPublisherAssigned | false |
| Router v3 | routerV3Live | true (unchanged) |
| Router V4 | routerV4Promoted | false (unchanged) |
| Official BOT Bridge | officialBridgeDirect | true (unchanged) |

## Gate results

- Tests: **1137 passed / 102 files**, 0 failed.
- Typecheck: clean.
- Production build: success.
- No 968/1024 contamination; no superseded address resolvable as canonical;
  no Stake/Claim transaction can be prepared while flags stay disabled.

Awaiting approval before publishing the registry change.
