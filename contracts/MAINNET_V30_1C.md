# V30.1C — Flow Staking v2 Production Gate Report

## Verdict: FLOWBRIDGE V30.1C FLOW STAKING V2 PRODUCTION GATE BLOCKED

The Staking v2 candidate passed every implementable gate (implementation, tests,
fuzz, Slither, reproducible build, parity, UI, compatibility). Promotion to
BOT Mainnet 677 stays BLOCKED on external prerequisites that cannot be closed
in-repo. Public-chain writes performed: **zero**.

## Delivered

- `contracts/production/staking-v2/FlowStakingVaultV2.sol` — non-upgradeable
  principal custody; exact principal/reward accounting; five products
  (Flexible, 30D, 90D, 180D, 365D); lifetime Genesis quota (90 reward-days per
  wallet, anti-reset lineage: re-opening a position never refreshes the quota);
  locked-floor reservations; Genesis repricing to target rate when global or
  wallet capacity is exhausted; variable-epoch accumulators with exact
  zero-staker reconciliation; pause + reentrancy guards.
- `contracts/production/staking-v2/FlowStakingController.sol` — bounded
  economic authority only: canonical product matrix; Year-1 caps 1M Genesis /
  2M standard / 3M total FLOW; `maxFlowPerEpoch`; 7-day epochs; ±10% weekly
  rate guard; dynamic standard rate fail-closed on missing / stale /
  low-liquidity / high-deviation oracle.
- `contracts/production/staking-v2/FlowStakingRewardTreasury.sol` — segregated
  pre-funded reward inventory in four buckets (genesis / floor / epoch /
  accrued); pays out only from reserved inventory; recovery bounded by
  free balance; zero recovery recipient rejected; holds no principal.
- `contracts/production/staking-v2/test/FlowStakingV2.t.sol` and
  `contracts/production/staking-v2/BUILD_EVIDENCE.json` (frozen
  source/creation/runtime/ABI SHA-256), Slither JSON triage exports.

## Evidence

- Solidity suite: **29/29 passing**, incl. both 256-run fuzz accounting
  properties (principal exactness; reward conservation vs treasury buckets).
- Build: solc 0.8.24, optimizer 200 runs, viaIR, evm cancun. Runtime sizes
  10,366 / 7,108 / 4,137 bytes — all under EIP-170 (24,576).
- Slither 0.11.3 (direct per-contract, `--via-ir --optimize`): **no High**.
  Mediums triaged: reentrancy-no-eth all target immutable constructor-pinned
  counterparties behind `nonReentrant`/role gates (covered by a reentrancy
  test that proves the callback path fails closed); strict-equality hits are
  the flexible-sentinel (`maturityAt == 0`) and integer zero tests;
  divide-before-multiply is conservative rounding in the ±10% guard only;
  unused-return hits are intentional partial tuple destructures. All
  uninitialized-local and the missing zero-check were fixed in source.
- App TS parity: `src/lib/staking/stakingV2Matrix.ts` mirrored constant-for-
  constant against the contract source; drift fails
  `stakingV2Matrix.parity.test.ts` (9 tests).
- UI: `/stake` renders the five-option v2 Preview (APR only, Genesis vs steady
  state separated, per-option estimates, availability states incl. oracle-
  unavailable / funding-insufficient / genesis-exhausted, wallet-confirmation
  wording, honest dynamic-rate status). It signs and submits nothing.
- Compatibility: v1 `FlowStakingVault` (BOT Testnet 968) unchanged and marked
  HISTORICAL/TESTNET_ONLY; V13.2 testnet staking, mission stake handoff
  (V17.1D/E) and Flow AI decisioning untouched; no registry mainnet address
  added.

## Open blockers (before any mainnet promotion)

1. Production FLOW token on BOT Mainnet 677 does not exist (FlowToken BLOCKED).
2. No production FLOW/USD reference oracle → dynamic standard rate stays
   fail-closed; floor-only operation would need an explicit governance choice.
3. Approved multisig/timelock for admin / governor / publisher / recovery
   recipient not assigned.
4. Year-1 reward funding (≤3M FLOW) not provisioned; reserve must be fully
   pre-funded before the first position.
5. Weekly USD budget / `maxFlowPerEpoch` economics not signed off.
