# V30.2B P3B — Genesis Mainnet Lifecycle Canary Settlement (read-only)

Evidence: `contracts/production/v30-2b-staking-genesis-canary/P3B_SETTLEMENT.json`
(script `scripts/p3b-settlement.mjs`, chain 677). Nothing was signed or sent.

## Result — PASS (56/56 checks)

```
V30.2B P3B GENESIS MAINNET LIFECYCLE CANARY PASS
```

Both user receipts are `status: success` on chain 677:

| Step | Tx |
| --- | --- |
| Reward claim | `0x1514c6db432b5fe9f974da4d319ae3705b424c3028c52eda3ea80d835dae1570` |
| Principal withdrawal | `0x531116aba0310af070e4312660d5f737d56d97e88628e047f48e764288ab57e9` |

## Lifecycle economics

- Claim moved a positive, contract-computed FLOW reward to the canary and did
  not touch principal.
- Withdrawal returned exactly `1 FLOW` principal; the position is closed
  (`status == 1` — the vault encodes 0 = open, 1 = closed) and the historical
  principal figure on the closed record is audit metadata only.
- No principal liability remains: `totalPrincipal == 0` and the vault holds
  `0 FLOW`.
- Genesis reservation is fully conserved:
  `claimed + released + earned-dust == 0.044383561643835616 FLOW`, the exact
  amount reserved at open. `reservedGenesis`, `reservedFloors` and
  `committedEpoch` are all back to `0`.
- The only outstanding treasury obligation is `0.000000279680365296 FLOW` of
  reward the canary earned during the withdrawal settle and has not claimed —
  legitimately owed, fully backed. Free reward inventory is
  `9,999,999.999993013698630138 FLOW`; the treasury is solvent.

## Untouched accounting

Rewards Distributor, Points and Campaign state are unchanged by the staking
canary: 1 published epoch, `totalClaimed == 1 FLOW`, `totalReserved == 0`
(epoch 1 fully claimed during P2E), campaign budget `1 FLOW`,
`budgetRemaining 0`, distributor inventory `999,999 FLOW`, and the staking
transactions emitted no distributor logs.

## Reconfirmed posture

```
oracle = 0x0
weeklyUsdBudget8 = 0
standardYear1Used = 0
no live standard epoch
EPOCH_ROLE -> Controller = false
PUBLISHER_ROLE -> 0x05F7…aB22 = false
standard/dynamic staking = disabled
emergencyMode = false, vault unpaused
```

## Public activation (fast-track authorized)

Flexible Genesis staking is now live on BOT Mainnet 677:

- `stakingExecutionEnabled` and `genesisFlexibleStakingEnabled` are true;
  `dynamicStakingEnabled`, `oracleConfigured` and `stakingPublisherAssigned`
  stay false.
- `src/lib/staking/mainnetGenesisStaking.ts` allows exactly one executable
  product id (`0`, the lock-free Flexible product). 30D / 90D / 180D / 365D are
  displayed as reference only and cannot be submitted — their safety is not
  inferred from this canary.
- `src/lib/staking/useMainnetGenesisStake.ts` re-reads vault pause, controller
  emergency mode, live product terms (active, `lockSeconds == 0`,
  `minPrincipal`), remaining Year-1 Genesis capacity, treasury free inventory,
  and the wallet's balance / allowance / positions before any action unlocks.
  Every failure blocks execution.
- `src/components/staking/MainnetGenesisStakeCard.tsx` on `/stake` approves an
  exact allowance (never unlimited), opens Flexible positions, and offers claim
  (rewards only) and withdraw (exact principal) per position.
- The legacy V13.2 mainnet execution path remains hard-disabled.
