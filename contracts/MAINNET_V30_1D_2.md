# V30.1D.2 — Owner Approval + Mainnet Release Freeze

## Verdict: FLOWBRIDGE V30.1D.2 OWNER APPROVAL MAINNET RELEASE FREEZE BLOCKED

The approval machinery is complete, fail-closed and live behind the admin gate,
but **zero owner decisions have been recorded**. Nothing may be pre-approved, so
the freeze cannot pass. Public writes performed: **zero**.

## 1. Frozen technical baseline preserved

No Router V4, Rewards Distributor, Activity Registry, FlowToken or Staking v2
source was modified for this gate. `src/lib/deploy/mainnetReleaseFreeze.ts`
derives a candidate digest from the frozen production hashes
(`fnv1a64:19671fd13a81be19`); every approval record stores the digest it was
approved against, and any hash drift returns the affected decision to
`NEEDS_APPROVAL` automatically. BOT Mainnet 677 / Testnet 968 / fail-closed
legacy 1024 rules and the direct official BOT Bridge architecture (BridgeAdapter
and Router bridge proxy mainnet execution disabled) are untouched.

## 2. Single owner approval sheet

`POST /api/admin/mainnet-release-freeze` (admin-gated, `super_admin` may record;
`internal_operator` is read-only) exposes 13 decisions, each with proposal,
reason, impact, status, editability and `APPROVE` / `REJECT` / `REPLACE`.

- No decision is pre-checked; absence of a record means `NEEDS_APPROVAL`.
- Approval is never inferred from a page view, navigation, test fixture or env var.
- Records are append-only in `mainnet_release_decisions` with approving admin
  identity, timestamp, decision version `V30.1D.2`, candidate digest and the
  exact public values approved. The latest record per decision governs.
- Values are public-only: submissions containing key/mnemonic/seed/secret-like
  fields are rejected at the endpoint.
- These are FlowBridge release records, not blockchain signatures.

## 3. Decision sheet result

| Decision | Status |
| --- | --- |
| FLOW_ECONOMICS | BLOCKED — NEEDS_APPROVAL |
| GOVERNANCE_SAFE_PLAN | BLOCKED — NEEDS_APPROVAL |
| TREASURY_SAFE_PLAN | BLOCKED — NEEDS_APPROVAL |
| OPERATIONS_SAFE_PLAN | BLOCKED — NEEDS_APPROVAL |
| ROOT_PUBLISHER_ASSIGNMENT | BLOCKED — NEEDS_APPROVAL |
| ACTIVITY_ATTESTER_ASSIGNMENT | BLOCKED — NEEDS_APPROVAL |
| TIMELOCK_POLICY | BLOCKED — NEEDS_APPROVAL |
| REWARDS_LAUNCH_PLAN | BLOCKED — NEEDS_APPROVAL |
| STAKING_LAUNCH_PLAN | BLOCKED — NEEDS_APPROVAL |
| LIQUIDITY_AND_ORACLE_PLAN | BLOCKED — NEEDS_APPROVAL |
| GAS_BUDGET_PLAN | BLOCKED — NEEDS_APPROVAL |
| DEPENDENCY_SNAPSHOT | BLOCKED — NEEDS_APPROVAL |
| LEGAL_SIGNOFF | BLOCKED — NEEDS_APPROVAL |

## 4. Proposed (unapproved) values presented for decision

- **FLOW**: 1,000,000,000 FLOW, 18 decimals, ERC-20 + ERC-2612 Permit, no
  post-deployment mint authority; 50/15/15/10/5/5 allocation reconciling exactly
  to 1B; community reserves 200/100/75/50/30/45M reconciling to the 500M bucket;
  Year-1 community ceiling 20M including a 3M staking component; separate 10M
  Genesis recognition maximum; team 0% TGE / 12m cliff / 36m linear.
- **Safes**: Governance / Treasury / Operations each ≥3 distinct owners, 2-of-3
  minimum (3-of-5 preferred). Owners, threshold and address are owner-supplied —
  none is invented. Safes are **not** created here.
- **Root Publisher / Activity Attester**: dedicated addresses, rejected if equal
  to Governance/Treasury (publisher) or to the registry admin (attester).
- **Timelock**: 24h presented as the recommendation; a replacement delay requires
  an explicit rationale. Emergency pause may not move treasury assets or rewrite
  user obligations.
- **Rewards**: initial funding, launch budget (≤ funded inventory, ≤ Year-1
  community ceiling) and root delay within the contract range 1h–7d.
- **Staking**: reserve funding and `maxFlowPerEpoch` bounded by the 1M/2M/3M
  Year-1 ceilings, product set from Flexible/30D/90D/180D/365D, deployment-only
  (0 funding, no products) explicitly allowed; enabling products without funding
  is blocked; dynamic bonus stays 0 while the TWAP source is `PENDING_POOL`.
- **Liquidity/oracle**: BDEX V3 FLOW/USDT venue plan, maximum FLOW actually
  released (the 100M reserve is a ceiling), plus observation-window, freshness,
  minimum-liquidity and maximum-deviation thresholds.
- **Gas**: 21.5M gas units plus a safety-buffer percentage; BOT required is
  computed at preflight from the live gas price. A fixed BOT amount is rejected.
- **Dependencies**: frozen snapshot of the VERIFIED chain-677 evidence for WBOT,
  BDEX V2 Router02, V3 SwapRouter, V3 Factory, Universal Router, official
  BridgeRouter and USDT; the bridge USDT value stays a typed resource ID. This
  decision is evidence-derived and not owner-editable; bytecode is re-checked
  immediately before deployment and all mainnet slots stay `PROMOTION_PENDING`.

## 5. Fail-closed rules enforced (29 deterministic tests)

Unapproved decisions, supply/allocation mismatch, non-multisig token treasury,
Safe owner/threshold or duplicate-owner violations, zero/malformed addresses,
attester = admin, publisher = Governance/Treasury, Governance/Treasury
membership concentration without explicit approval, rewards budget above funding
or ceiling, out-of-range root delay, staking above 1M/2M/3M or annualised
`maxFlowPerEpoch`, dynamic staking while the oracle is `PENDING_POOL` or
thresholds are unapproved, testnet 968 / legacy 1024 contamination, and
production hash drift.

## 6. Release manifest freeze

`contracts/MAINNET_RELEASE_DECISIONS.json` is generated from the same canonical
object the endpoint returns: decision version, candidate hashes, per-decision
status/value/hash, dependency snapshot, activation plan and zero-write ledger.
Canonical object hash `fnv1a64:aabfd1737ab49b23`. It contains no keys, seed
phrases, Safe signing material or secrets. The later deployment gate consumes
this object instead of re-collecting values.

## 7. Staged readiness

Every deployable contract remains `SOURCE_READY`; nothing reaches
`DEPLOYMENT_READY` while owner approvals are outstanding. All features remain
inactive: Router swaps, direct bridge, rewards claims, staking genesis/floors,
dynamic staking, activity registry. BridgeAdapter mainnet execution stays
disabled.

## 8. Application gates

922 tests passing (82 files), typecheck clean, production build OK. No V26–V30
regression.

## 9. Remaining blockers before Safe creation and first deployment

All 13 owner decisions above, then: Safe creation, role transfer proving no
deployer authority remains, approved funding, approved liquidity seeding, live
Router/Bridge canaries, first funded reproducible rewards epoch, and TWAP
warm-up before any dynamic staking.

## 10. Zero-public-write confirmation

Safe creations 0 · BOT Mainnet deployments 0 · BOT Testnet deployments 0 ·
wallet signatures 0 · blockchain transactions 0 · FLOW transfers/funding 0 ·
liquidity actions 0 · rewards claims 0 · staking actions 0.
