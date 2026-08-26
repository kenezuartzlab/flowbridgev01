# V30.1D — Mainnet Economic + Governance Prerequisite Closure

## Verdict: FLOWBRIDGE V30.1D MAINNET PREREQUISITE CLOSURE BLOCKED

Every prerequisite has been modelled, made fail-closed and preflighted in code.
None of the required **external** production inputs is approved, so no contract
reaches READY_FOR_DEPLOYMENT. Public-chain writes performed: **zero**.

## 1. Contract readiness matrix

| Contract | Readiness | Mainnet 677 state |
| --- | --- | --- |
| FlowToken | BLOCKED | PROMOTION_PENDING (supply/treasury unfrozen) |
| FlowRewardsMerkleDistributor | HARDENING_REQUIRED | PROMOTION_PENDING (funding/roles unfrozen) |
| FlowBridgeRouterV4 | HARDENING_REQUIRED | PROMOTION_PENDING (governance + BDEX config) |
| FlowBridgeRouterLens | HARDENING_REQUIRED | PROMOTION_PENDING (needs Router address) |
| FlowBridgeActivityRegistry | HARDENING_REQUIRED | PROMOTION_PENDING (admin/attester/pauser) |
| FlowStakingVaultV2 / Controller / RewardTreasury | HARDENING_REQUIRED | PROMOTION_PENDING (token, oracle, funding, roles) |
| FlowBridgeBridgeAdapterV1 | BLOCKED | mainnet execution disabled |
| FlowStakingVault v1 + cumulative EIP-712 rewards | TESTNET_ONLY | historical, BOT Testnet 968 only |

## 2. FLOW token freeze — BLOCKER

Name, symbol, fixed supply, treasury recipient and allocation plan are all
unapproved. Decimals = 18 is fixed by source. Constructor calldata cannot be
generated until supply + treasury multisig are frozen.

## 3. Governance / role matrix — BLOCKER

All 18 required roles (Router owner/pauser/registry/feeTreasury; Rewards
admin/campaignManager/rootPublisher/pauser; Registry admin/attester/pauser;
Staking vaultAdmin/governor/publisher/treasuryAdmin/recoveryRecipient/pauser;
FLOW treasury recipient) are unassigned. The model rejects any assignment that
is not a reviewed multisig with a named responsible owner, rejects reuse of a
BOT Testnet address, and hard-blocks Activity Registry `admin == attester`.
Timelock minimum delay is undocumented.

## 4. Rewards launch funding — BLOCKER

Initial distributor funding, treasury allocation, enabled campaign budgets,
root delay and replenishment/recovery policy are unapproved. Budgets above
funded inventory are rejected by the gate.

## 5. Staking Year-1 funding — BLOCKER

Ceilings remain 1,000,000 Genesis / 2,000,000 standard / 3,000,000 total FLOW as
maximums. Launch funding, `maxFlowPerEpoch` and the enabled product set are
unapproved; the gate blocks any product enabled without funded genesis/floor
capacity and any funding above the ceilings.

## 6. FLOW/USD oracle — BLOCKER

No production reference exists on BOT Mainnet 677. All five oracle checks
(source identified, live with verified bytecode, ≥7-day averaging window with
cadence, explicit freshness/liquidity/deviation thresholds, proven fail-closed
behaviour) evaluate BLOCKED. Manual, browser-sourced or AI-generated prices are
forbidden, so standard dynamic-rate staking stays unavailable and the UI shows
"awaiting rate activation" rather than a fabricated APR.

## 7. RPC / explorer / BDEX / direct-bridge dependencies — BLOCKER

`botMainnetRpc`, `botMainnetExplorer`, `bdexSwapRouter`, `wrappedNative` and
`directBridgeGateway` are all unfrozen. Contract-bearing entries require
verified 677 bytecode; any 968 address or legacy 1024 identifier blocks the
mainnet manifest.

## 8–11. Simulations (no broadcast)

Deployment order: governance → FlowToken → Rewards Distributor → Router V4 →
Lens → Activity Registry → Staking Reward Treasury → Staking Controller →
Staking Vault V2 → role grants/transfers/acceptance → registry activation. Every
constructor argument is simulated; dependent steps stay unresolved while earlier
mainnet addresses do not exist. Funding order is FLOW genesis mint (constructor
only) → Rewards funding → Staking reserve funding → epoch activation → product
activation, each gated on verified runtime hashes and on-chain observation, and
principal is never commingled with reward inventory. Estimated deployment gas:
**~21.5M units** (16.6M contracts + role transfers, +30% buffer); no BOT gas
budget is approved yet.

## 12–13. Launch feature matrix + dashboard

Router swaps, rewards claims, staking and Activity Registry all evaluate
disabled; the direct official BOT Bridge remains the bridge path but its gateway
verification is outstanding; BridgeAdapter mainnet execution stays disabled.
`POST /api/admin/mainnet-prerequisites` (admin-gated) renders every prerequisite
as VERIFIED / NEEDS_APPROVAL / BLOCKED with public values only.

## 14–16. Gates

Acceptance tests cover wrong chain, testnet contamination, legacy 1024,
unapproved treasury/Router owner, admin == attester, weak oracle, funding above
ceilings, unbacked products, over-budget rewards, unverified direct bridge, and
a successful role-transfer simulation with approved addresses. Public-chain
writes: deployments 0 (mainnet and testnet), signatures 0, transactions 0, FLOW
transfers 0, rewards claims 0, staking deposits/claims/withdrawals 0.

## Remaining blockers before the first BOT Mainnet broadcast

1. Approved FLOW supply, treasury multisig and allocation plan.
2. All 18 governance role addresses with timelock delay and emergency policy.
3. Rewards launch funding + enabled campaign budgets + root delay.
4. Staking launch funding, `maxFlowPerEpoch` and enabled product set.
5. A production FLOW/USD reference source with signed thresholds.
6. Verified 677 RPC/explorer/BDEX/wrapped-native/direct-bridge dependency set.
7. Signed BOT gas budget for the full deployment sequence.
