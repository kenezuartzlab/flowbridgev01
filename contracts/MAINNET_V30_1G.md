# FlowBridge V30.1G — Funding Readiness + Source Verification Closure

Read-only gate. Chain BOT Mainnet 677, observed at block 21,389,568.
Nothing was signed or broadcast: 0 transactions, 0 FLOW moved, 0 role changes,
0 configuration writes, 0 registry entries.

## 1. V30.1F wiring snapshot closed

| Check | Observed |
| --- | --- |
| F.2b — Reward Treasury `CONTROLLER_ROLE` → Staking Controller | true |
| F.2a — Reward Treasury `VAULT_ROLE` → Vault V2 | true (retained) |
| F.3 — Vault `PAUSER_ROLE` → Operations Safe | true |
| F.3 — Governance retains Vault `PAUSER_ROLE` + `DEFAULT_ADMIN_ROLE` | true / true |
| F.4 — Controller `maxFlowPerEpoch` | `50000000000000000000000` (50,000 FLOW) |
| F.4 — `weeklyUsdBudget8` | `0` |
| Oracle | `0x0000…0000` (unset) |
| Controller `vault` | `0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8` |

Economic emptiness: Reward Treasury FLOW balance, freeBalance, obligations,
reservedGenesis, reservedFloors, committedEpoch and accruedUnclaimed are all 0;
Vault FLOW 0, `totalPrincipal` 0, `nextPositionId` 0, unpaused; Distributor
FLOW 0, `totalReserved` 0, `epochCount` 0. No epoch or reward publication.

Router boundary unchanged: V4 `registryActivationDelay = 0`, `routerCount = 0`,
`bridgeCount = 0`, Router v3 remains the live production router, no migration.

## 2. Public source-verification state (scan.botchain.ai)

| Contract | State |
| --- | --- |
| FlowStakingRewardTreasury | PUBLICLY_VERIFIED |
| FlowStakingController | PUBLICLY_VERIFIED |
| FlowBridgeRouterV4 | PUBLICLY_VERIFIED |
| FlowBridgeRouterLens | PUBLICLY_VERIFIED |
| FlowToken | SOURCE_PENDING |
| FlowRewardsMerkleDistributor | SOURCE_PENDING |
| FlowStakingVaultV2 | SOURCE_PENDING |
| FlowBridgeActivityRegistry | SOURCE_PENDING |

## 3. Preserved-package retries (no source, compiler or artifact change)

- FlowToken (183,110 B), Distributor (88,281 B), Vault V2 (67,001 B): HTTP 403
  Cloudflare HTML on the v2 `standard-input` multipart route and the legacy v1
  `verifysourcecode` urlencoded route. A gzip-encoded v1 body passed the edge but
  the explorer returned `400 Bad request` (it does not decode gzip), confirming
  an edge body-size/content rule rather than an artifact mismatch.
- Activity Registry (22,866 B): submission accepted twice (autodetect and explicit
  constructor args `Governance Safe`, `Attester`, `Operations Safe`), explorer
  returned `Fail - Unable to verify`. Independent of funding; it continues to block
  production attestation activation.

Closure path stays the one-click browser submission of the unchanged bundles in
`contracts/production/stage-a-verification/`, `stage-b-verification/` and
`stage-e-verification/`.

## 4. Rewards funding — PREPARED, NOT BROADCAST

Treasury Safe `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` → FlowToken
`0x535ddda826142ac42ce288154e9595f080940ae9`, value 0, CALL, 2-of-3.

```
transfer(0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB, 1000000 * 10^18)
0xa9059cbb0000000000000000000000003824681c3560a63e1c9cedabbfcab2691c5673fb00000000000000000000000000000000000000000000d3c21bcecceda1000000
calldataHash 0xdfb6499dc319e219dd9e8cc847170a8babf6964c2f80539a59cf9abfb3ff2c7d
```

Simulates OK from the Treasury Safe (51,714 gas, returns `true`); reverts
`ERC20InsufficientBalance` from the deployer EOA. Expected delta: Treasury −1M
FLOW, Distributor +1M FLOW, `totalReserved` 0, `epochCount` 0.
**BLOCKED_BY_SOURCE** — requires FlowToken + Distributor public verification.

## 5. Staking funding — PREPARED, NOT BROADCAST

```
transfer(0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e, 10000000 * 10^18)
0xa9059cbb000000000000000000000000a861152ca3676bccf7b5fdafb9eb6a57b9d32d0e000000000000000000000000000000000000000000084595161401484a000000
calldataHash 0x875f551af0ac0bfa831823917036181e1a72b59398915354c7d45f2a634fde9d
```

Simulates OK from the Treasury Safe (51,726 gas); reverts from the deployer EOA.
Expected delta: Reward Treasury `freeBalance` +10M FLOW with every reserved /
obligation bucket unchanged at 0. Inventory only, not an emission allowance:
Year-1 release ≤ 3,000,000 FLOW (Genesis ≤ 1,000,000, Standard ≤ 2,000,000),
`maxFlowPerEpoch` 50,000 FLOW / 7-day epoch, `weeklyUsdBudget8` 0, oracle unset.
**BLOCKED_BY_SOURCE** — requires FlowToken + Vault V2 public verification.

## 6. Funding is not activation

`evaluateFundingPath` in `src/lib/deploy/stageGFundingReadiness.ts` is
fail-closed twice over: a path is executable only when every required contract
is publicly verified *and* a fresh owner execution approval is supplied. Later
verification success never auto-executes a transfer. Rewards roots/claims,
public staking, dynamic bonus, auto-stake and FLOW Points conversion all remain
inactive and separately gated.

## 7. Verdict

`FLOWBRIDGE V30.1G FUNDING READINESS SOURCE VERIFICATION CLOSURE PASS - PREPARED, NOT FUNDED`

Evidence: `contracts/production/STAGE_G_FUNDING_READINESS.json`,
`src/lib/deploy/stageGFundingReadiness.ts` + `.test.ts`.
