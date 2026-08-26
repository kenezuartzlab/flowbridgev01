# V30.1D.1 — Mainnet Decision Pack + Staged Product Activation

## Verdict: FLOWBRIDGE V30.1D.1 MAINNET DECISION PACK READY

Every value derivable from canonical FlowBridge specification or verified public
BOT Chain sources is now populated. What remains is exactly ten owner approvals
plus post-deployment activation conditions. READY is **not** authorization to
broadcast. Public writes performed: **zero**.

## 1. Updated prerequisite model — staged readiness

`src/lib/deploy/mainnetDecisionPack.ts` replaces the "everything is a
deployment prerequisite" model with five explicit stages:
`SOURCE_READY → DEPLOYMENT_READY → DEPLOYED_VERIFIED → FUNDED_READY → FEATURE_ACTIVE`.
Feature blockers carry `blocksDeployment: false` structurally, so a missing
FLOW/USD oracle can never block FlowToken deployment and missing rewards funding
can never block Router deployment.

## 2. Canonical FLOW proposal — pre-filled, not approved

1,000,000,000 FLOW, 18 decimals, no post-deployment mint authority. Allocation
50% community / 15% team / 15% treasury / 10% liquidity / 5% partners / 5%
security sums to exactly 100% and 1B FLOW; community internal reserves
(200/100/75/50/30/45M) sum to the 500M community bucket; the Year-1 staking
component maximum (3M FLOW) equals the staking-v2 contract Year-1 total cap.
Year-1 community ceiling 20M; one-time Genesis/legacy ceiling 10M, not
automatic. Team 0% TGE / 12m cliff / 36m linear; strategic partners 0% / 12m /
24m. State: `CANONICAL_PROPOSAL_NEEDS_OWNER_APPROVAL`.

## 3. Official BOT Mainnet dependency matrix — bytecode verified

Read-only public RPC observation of `https://rpc.botchain.ai`:
`eth_chainId = 0x2a5 (677)`.

| Dependency | Address | Runtime bytecode | State |
| --- | --- | --- | --- |
| WBOT | 0xD545…bd30 | 2,317 bytes | VERIFIED |
| BDEX V2 Router02 | 0x1414…9e76 | 21,987 bytes | VERIFIED (documented, unused) |
| BDEX V3 SwapRouter | 0x0703…3929 | 10,088 bytes | VERIFIED |
| BDEX V3 Factory | 0x1C51…5419 | 24,535 bytes | VERIFIED |
| BDEX Universal Router | 0xaE6a…7655 | 18,242 bytes | VERIFIED (not used by design) |
| BOT BridgeRouter | 0xef8D…cC53 | 2,227 bytes | VERIFIED |
| BOT USDT | 0xaBab…7a3C | 6,188 bytes, decimals = 6 | VERIFIED |

Explorer `https://scan.botchain.ai` is navigation/status only. The bridge USDT
resource id `0xac58…cd1d` is treated as a resource identifier, never a chain id
or address, and stays DOCUMENTED_OFFICIAL until checked against a live bridge
deposit config. Testnet 968 and legacy 1024 observations are rejected.

## 4. Governance consolidation — 5 authorities, not 18 wallets

Governance Safe (Router owner/registry, Rewards admin, Staking admin/governor/
treasury admin, Registry admin, behind a TimelockController), Treasury Safe
(FLOW recipient, fee treasury, recovery recipient), Operations authority
(pausers, campaign manager), Root Publisher (epoch roots only — no budget, no
recovery, no role grants) and Activity Attester (append-only). Enforced
invariants: attester ≠ admin/governance/operations, publisher ≠ governance and
≠ treasury, Safe minimum 2-of-3 with distinct owners, governance timelock delay
required (24h default proposal), and Treasury/Governance membership
concentration blocked unless the owner explicitly approves it. No signer is
invented; every address is owner-supplied.

## 5. Oracle verdict

No official Chainlink or Pyth deployment can be assumed for BOT Chain. Candidate
after launch: FLOW/USDT BDEX V3 pool TWAP, gated on official-factory provenance,
token ordering/fee tier, `observe()` support, observation cardinality, a ≥7-day
accumulated window, minimum liquidity, and approved freshness/deviation
thresholds. Current status `PENDING_POOL` — the pool cannot exist before FLOW
does. Dynamic standard staking stays INACTIVE with variable bonus 0; Genesis and
locked floors are oracle-independent and may activate on funded reservations
alone.

## 6. Deployment vs feature blockers

- Deployment blockers: owner approvals (supply/allocation, Safes, timelock, gas
  budget). Dependencies are already VERIFIED.
- Feature-activation blockers only: rewards funding + first reproducible epoch,
  staking reserve funding, Router/Bridge live canaries, oracle TWAP warm-up and
  liquidity for dynamic staking. BridgeAdapter mainnet execution stays disabled.

## 7. Owner decision sheet (no hidden defaults)

FLOW supply/allocation · Governance Safe owners+threshold+address · Treasury Safe
owners+threshold+address · timelock delay + emergency pauser model · Root
Publisher and Activity Attester authorities · Rewards funding/budget/root delay ·
Staking funding/maxFlowPerEpoch/day-one products · liquidity plan and maximum
FLOW actually released (100M is a ceiling, not an instruction) · BOT gas budget
after a live gas-price preflight · legal/compliance sign-off (external only).

## 8. Activation sequence

Stage 1 deploy+verify with product writes disabled → 2 role transfer, prove no
deployer authority → 3 fund only approved amounts → 4 seed approved liquidity →
5 enable Router swaps and direct Bridge after canaries → 6 activate Rewards
after the first funded reproducible epoch → 7 activate staking to the extent
obligations are provably funded; dynamic bonus last.

## 9. Application gates

893 tests passing (72 files), typecheck clean, build OK.

## 10. Zero-write confirmation

Mainnet deployments 0 · Safe creations 0 · wallet signatures 0 · FLOW transfers 0
· liquidity provisioning 0 · rewards funding/claims 0 · staking funding/actions 0.
Only read-only `eth_chainId`, `eth_getCode` and `decimals()` calls were made.
