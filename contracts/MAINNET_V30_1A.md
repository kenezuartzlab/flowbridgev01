# FlowBridge V30.1A — Lovable Mainnet Foundation

Zero-transaction gate. Mainnet broadcasts = 0, mainnet wallet signatures = 0,
mainnet FLOW transfers = 0. Nothing in this document authorises a deployment.

## 1. Canonical network identity

| Network | Canonical EVM chain id |
| --- | --- |
| BOT Mainnet | **677** |
| BOT Testnet | **968** |

Single source of truth: `src/lib/network/canonicalNetworks.ts`.
`1024` is classified as **UNVERIFIED LEGACY CONFIGURATION** and fails closed for
every production/network use (`isProductionNetworkIdentifierAllowed`,
`assertProductionNetworkIdentifier`).

### Every remaining `1024` occurrence and its classification

| Location | Classification | Action taken |
| --- | --- | --- |
| `src/lib/bridge/officialBridgeConfig.ts` (`botMainnet`) | stale/incorrect production configuration | replaced with canonical `677` |
| `src/components/campaigns/activityPresentation.ts` explorer map | stale/incorrect production configuration | remapped to `677` + `968` |
| `src/lib/campaign/campaignStudio.ts` chain label | stale UI label | relabelled `BOT Chain (677)` |
| `src/lib/ai/intentBridgeRoute.ts` alias comment | stale AI routing assumption | canonical identities only |
| `src/components/shell/navModel.test.ts`, `src/lib/layout/tradeShell.test.ts` | UI/layout breakpoint number (px) | kept, not a network identifier |

No proven official BOT Bridge domain identifier of `1024` exists in this
repository, so it is not used anywhere network-facing. If the official gateway
ever requires a distinct domain id, it must be proven from current official
configuration and stored explicitly — never inferred from a chain id.

## 2. Bridge architecture (unchanged)

Production path stays: user wallet → official BOT Bridge gateway (approval
spender = official gateway). FlowBridgeRouter V4 is **not** the depositor.
Router bridge proxy execution and BridgeAdapter mainnet execution remain
disabled.

## 3. Contract inventory and readiness

Source of truth: `src/lib/deploy/contractInventory.ts`.

| Contract | Source present | Readiness | Mainnet 677 state |
| --- | --- | --- | --- |
| FlowToken | yes | BLOCKED (economics not frozen) | PROMOTION_PENDING |
| FlowRewardsDistributor | yes | HARDENING_REQUIRED (solvency) | PROMOTION_PENDING |
| FlowStakingVault | yes | TESTNET_ONLY | PROMOTION_PENDING |
| FlowBridgeRouterV4 | **no** | BLOCKED (source absent here) | PROMOTION_PENDING |
| FlowBridgeRouterLens | **no** | BLOCKED (source absent here) | PROMOTION_PENDING |
| FlowBridgeActivityRegistry | **no** | BLOCKED (source absent here) | PROMOTION_PENDING |
| FlowBridgeBridgeAdapterV1 | **no** | BLOCKED (refund/recovery + source absent) | PROMOTION_PENDING |

No contract is `READY_FOR_MAINNET`.

## 4. Compiler / EVM-target matrix

| Family | Compiler | Optimizer | viaIR | EVM target |
| --- | --- | --- | --- | --- |
| FLOW contracts (Token / Rewards / Staking) | 0.8.24 | on, 200 runs | off | paris |
| Router V4 build line (preserved) | 0.8.20 | on, 200 runs | on | shanghai |

Compiler families are not unified. Any source/setting change regenerates
bytecode and requires new hashes plus repeated review.

## 5. Mainnet registry

Every BOT Mainnet 677 record starts `PROMOTION_PENDING` with `address = null`.
Testnet addresses are never promoted; regression tests enforce both rules.

## 6. Known economic blockers before first mainnet deployment

1. **Rewards solvency (V30.1B)** — outstanding signed cumulative entitlements are
   not reserved; owner funding withdrawal can make authorized claims insolvent.
2. **Staking v2 (V30.1C)** — existing vault has no fixed-duration 30/90/180/365
   positions, no per-position identity, no locked-floor reservation, and unearned
   scheduled reward inventory after epoch expiry is not reconcilable. Genesis
   Boost must be capped at 90 reward-days and never applied for a full 180D/365D
   lock.
3. **Frozen token economics** — exact supply, treasury recipient, allocation
   policy and treasury governance are not formally frozen.
4. **Router/Activity/Adapter sources absent** in this workspace, so their
   hardening (registry activation-delay bypass, fee bounds, rescue paths,
   `uint256 sourceLogIndex` parity, custody-free proofs) cannot be evidenced here.
5. **Governance** — no approved multisig/timelock owner declared for Router,
   fees, integration registry, pause, treasury, rewards signer/funding, staking
   controller or Activity Registry roles. A developer wallet must never be the
   final production authority.

## 7. Governance / role matrix (target)

| Privileged operation | Who | Value impact | Timelock | Multisig | Affects existing obligations |
| --- | --- | --- | --- | --- | --- |
| Router ownership | governance multisig | full router config | yes | yes | yes |
| Fee configuration | governance multisig | user swap proceeds | yes | yes | yes |
| Integration registry | operator → delayed activation | routing targets | yes | yes | yes |
| Emergency pause | operator (fast) | halts flows only | no | yes | no |
| Token treasury | treasury multisig | FLOW supply custody | yes | yes | yes |
| Rewards owner / signer | governance multisig | claim authority | yes | yes | yes |
| Reward funding / recovery | governance multisig | claim solvency | yes | yes | yes |
| Staking owner / funding | governance multisig | reward inventory | yes | yes | yes |
| Activity admin / attester / pauser | separated roles | evidence only, no value | no | yes (admin) | no |

## 8. Deployment tooling

`src/lib/deploy/mainnetPreflight.ts` (pure, fail-closed) plus the admin-gated
`POST /api/admin/mainnet-preflight`. Secrets stay server-side and are reported
only as presence booleans. A deterministic plan is emitted only when all checks
pass; today it is always `null` because inventory blockers stand.

Secret scan verdict: **CLEAR** (no key, mnemonic or signer secret in repository,
build output, client bundle or logs; deployment secret paths are git-ignored).
