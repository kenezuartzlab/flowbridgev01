# FLOW Staking — V13.1 Owner Parameter Lock (BOT Testnet 968)

Status: **PARAMETER LOCK BLOCKED — nothing deployed, nothing broadcast.**

Canonical config (single source of truth): `contracts/config/staking-bot-testnet.json`
Report/dry-run command: `bun contracts/scripts/paramlock.staking.bot-testnet.ts`

## Owner-approval table

| Parameter | Verdict | Value / required decision | Authoritative source |
| --- | --- | --- | --- |
| Staking token | APPROVED | `0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac` (existing fixed-supply FLOW) | `contracts/deployments/bot-testnet.json`, `src/lib/staking/flowStakingPolicy.ts` |
| Vault owner | BLOCKED | exact public address (deployer is NOT assumed owner) | none |
| Reward-funding treasury | BLOCKED | wallet supplying FLOW reward inventory | none |
| Minimum stake | BLOCKED | exact FLOW amount in wei (0 only if explicitly approved) | none |
| Maximum stake / wallet | NONE (unlimited) | approve an amount or keep NONE | config `economics.maxStakePerWallet: null` |
| Testnet reward budget | BLOCKED | finite pre-funded FLOW amount (wei) | none |
| Reward duration | BLOCKED | exact seconds for one funded schedule | none |
| Schedule start | BLOCKED | absolute timestamp, or the literal `immediate-on-activation` policy | none |
| Lock period | NONE | approve seconds or keep NONE | config `economics.lockSeconds: null` |
| Cooldown | NONE | approve seconds or keep NONE | config `safety.cooldownSeconds: null` |
| Early-withdraw penalty | NONE (no slashing) | approve rule or keep NONE | config `economics.earlyWithdrawPenaltyBps: null` |
| Emergency withdraw policy | BLOCKED | must be exactly `principal-withdraw-always-available` | none |
| Mainnet staking economics | BLOCKED (PROMOTION_PENDING) | mainnet stays all-null | `src/lib/staking/flowStakingRegistry.ts` |

No conflicting approved values were found anywhere in source control; UI copy and
docs were treated as non-authoritative.

## Pause / emergency-withdraw verdict

`contracts/FlowStakingVault.sol`:

- `withdraw()` and `exit()` are **not** `whenNotPaused` — principal is withdrawable
  while paused, so a pause can never trap user funds.
- `pause()` blocks `stake()` and `claimReward()` only.
- `recoverUncommittedRewards()` is bounded by `uncommittedRewards()`; there is no
  owner path to principal or to committed/accrued rewards.
- No `mint`, no slashing, no early-withdraw penalty.

The code already implements the preferred model, but it is only recorded as
APPROVED once `safety.emergencyWithdrawPolicy` is set to
`principal-withdraw-always-available` by the owner.

## Funding solvency rule (enforced, awaiting numbers)

```text
rewardRate        = budget / durationSeconds        (integer floor)
maxEmission       = rewardRate * durationSeconds    (<= budget)
requiredInventory = maxEmission
activateSchedule() reverts unless budget <= uncommittedRewards()
```

Reward inventory is funded by a separate `fundRewards` transfer and is never
counted as principal (`totalStaked`). Top-ups raise available inventory only and
cannot change stake balances or already-earned rewards.

## APY policy

The owner approves a **finite budget + duration**, never an APY. Any rate shown
after activation must be derived live from on-chain `rewardRate` and
`totalStaked`; `/stake` shows no rate until a funded schedule exists.

## To unblock (owner action)

Fill these keys in `contracts/config/staking-bot-testnet.json` and re-run the
lock script — it then executes the funded local dry-run automatically:

`vaultOwner`, `rewardTreasury`, `economics.minStake`,
`economics.rewardBudgetPerEpoch`, `economics.epochDurationSeconds`,
`economics.startTime`, `safety.emergencyWithdrawPolicy`.
