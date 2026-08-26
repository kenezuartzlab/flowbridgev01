# FlowBridge V30.1B — Smart Contract Production Security Gate

Status: **BLOCKED**. No deployment, signature, transaction or FLOW transfer was
performed at any point in this gate.

## Scope audited

| Contract | Deployed bytes | EIP-170 (24,576) | Verdict |
| --- | --- | --- | --- |
| FlowBridgeRouterV4 (runs 200, viaIR, shanghai) | 28,703 | **OVER LIMIT** | blocked |
| FlowBridgeRouterLens (runs 1) | 7,577 | ok | hardened |
| FlowBridgeActivityRegistry (runs 1) | 2,761 | ok | accepted |
| FlowBridgeBridgeAdapterV1 (runs 1) | 12,660 | ok | mainnet execution disabled |
| FlowRewardsDistributor | 3,829 | ok | blocked (solvency) |
| FlowStakingVault | 4,743 | ok | TESTNET_ONLY / DEPRECATED |
| FlowToken | 3,539 | ok | freeze verified |

## Source changes made in this gate

Router V4 (`contracts/production/router-v4/FlowBridgeRouterV4.sol`)
- `_rearmRouterActivation` / `_rearmBridgeActivation`: every material integration
  mutation (`updateRouterWrappedNative`, `updateBridgeSupportedTokens`,
  `setBridgeTokenResource`, `setBridgeSupportsBotGas`,
  `setBridgeProxyExecutionEnabled`) now re-arms the activation delay and emits
  `IntegrationActivationScheduled`.
- Lowering `registryActivationDelay` still cannot accelerate a pending
  activation (activation times are absolute timestamps) — now regression-tested.
- New source SHA-256 `d6fdd281b5bd0c3211aca95fba94bf38c4031973c175d12d4b26455a5c584a46`;
  creation `51bd139b…f75f4`, runtime `81453edb…380eb` (build line unchanged).

Router Lens (`contracts/production/router-lens/FlowBridgeRouterLens.sol`)
- Constructor rejects non-contract targets.
- `findBestV2Rate` returns an explicit `found` flag (removes the routerId-0
  ambiguity of `getBestV2Rate`).
- `getRoutersPage` / `getBridgesPage` provide bounded, paginated discovery.
- New source SHA-256 `8a5e1c842d6177b380c93b6670eb8e47ef58f00eb5e10bcc4508a3b16ff71aa2`;
  creation `a7d48eb7…ecc31`, runtime `ea98f95e…187e90`.

Activity Registry, BridgeAdapter, FlowToken, Staking v1: **no source change** —
no concrete audit finding required one.

## Evidence

- Isolated pinned workspace rebuild (solc 0.8.20 for candidates, 0.8.24/cancun
  for FLOW contracts, viaIR, per-contract optimizer settings preserved).
- Solidity suites: **44 passing** — 9 Router, 27 Activity Registry, 8 new
  V30.1B hardening regressions
  (`contracts/production/router-v4/test/V30_1B_Hardening.t.sol`).
- Adapter local smoke / adversarial / randomized accounting / gateway
  reentrancy evidence from V30.1A.2 remains valid (adapter bytes unchanged).
- Lens ↔ Router selector parity verified for all view selectors.
- Findings, authority matrix and the fail-closed verdict are machine-readable in
  `src/lib/deploy/securityGate.ts`.

## Open blockers (all must be closed externally)

1. **V30.1B-R1** Router V4 exceeds EIP-170 (28,703 bytes) — requires splitting
   execution surface; a settings change cannot fix it.
2. **V30.1B-D1** Rewards Distributor has no enforceable solvency reservation;
   one canonical design (reservations, or budgeted Merkle/epoch) must be chosen
   with approved economics.
3. **V30.1B-S1** Staking v1 strands unearned emissions and division remainders;
   stays excluded, staking v2 is a separate gate.
4. **V30.1B-B1** Official refund → Adapter → user recovery rehearsal not
   performed; mainnet adapter execution stays disabled.
5. **V30.1B-X1** Slither/static analyzer unavailable in this sandbox; an
   external run is a required release input.
6. **V30.1B-G1** No approved production multisig/timelock governance owner.

## Zero-write attestation

No deployments, no signatures, no broadcast transactions, no FLOW transfers.
BOT Mainnet 677 registry slots remain `NOT_DEPLOYED` / `PROMOTION_PENDING`.

**FLOWBRIDGE V30.1B SMART CONTRACT PRODUCTION SECURITY BLOCKED**
