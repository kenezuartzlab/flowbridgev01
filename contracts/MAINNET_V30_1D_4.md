# V30.1D.4 — Deployment Readiness Freeze

## Verdict: FLOWBRIDGE V30.1D.4 DEPLOYMENT READINESS FREEZE PASS

All three production Safes VERIFY against live BOT Mainnet 677 chain state (exact
3-owner membership, threshold 2) and all eleven `DEPLOYMENT`-gated owner decisions
are now recorded in the append-only store against candidate digest
`fnv1a64:19671fd13a81be19`. Staged readiness is **DEPLOYMENT_READY** — deployment
ready, **not deployed**. Public writes performed: **zero**.

Decision version `V30.1D.4` · candidate digest `fnv1a64:19671fd13a81be19` ·
manifest hash `fnv1a64:9972234982dbe76f`.

## 1. Recorded owner decisions (append-only, super_admin)

| Decision | Status | Gating |
| --- | --- | --- |
| FLOW_ECONOMICS | APPROVED | DEPLOYMENT |
| GOVERNANCE_SAFE_PLAN | REPLACED | DEPLOYMENT |
| TREASURY_SAFE_PLAN | REPLACED | DEPLOYMENT |
| OPERATIONS_SAFE_PLAN | REPLACED | DEPLOYMENT |
| ROOT_PUBLISHER_ASSIGNMENT | REPLACED | DEPLOYMENT |
| ACTIVITY_ATTESTER_ASSIGNMENT | REPLACED | DEPLOYMENT |
| TIMELOCK_POLICY | APPROVED | DEPLOYMENT |
| REWARDS_LAUNCH_PLAN | APPROVED | DEPLOYMENT |
| STAKING_LAUNCH_PLAN | REPLACED | DEPLOYMENT |
| GAS_BUDGET_PLAN | APPROVED | DEPLOYMENT |
| DEPENDENCY_SNAPSHOT | APPROVED | DEPLOYMENT |
| LIQUIDITY_AND_ORACLE_PLAN | NEEDS_APPROVAL | FEATURE_ONLY (non-blocking) |
| LEGAL_SIGNOFF | DEFERRED_NON_TECHNICAL | NON_TECHNICAL (non-blocking) |

Approved public values as frozen:

- FLOW economics: 1,000,000,000 FLOW · 18 decimals · no post-deployment mint
  authority · 50-15-15-10-5-5 allocation.
- Governance Safe `0x88A4…9507`, Treasury Safe `0xeFc1…9Ea4`, Operations Safe
  `0x1Ce0…59eF` — each 2-of-3 with the live-verified owner set.
- Root Publisher `0x971E…3f94`; Activity Attester `0xFA3D…7e47` — both distinct
  from every Safe authority and from each other.
- Timelock: 24h delay on Router registry, fee/governance, staking economics and
  oracle changes; emergency pause may neither move treasury nor rewrite
  obligations.
- Rewards launch: 86,400s Merkle root publish delay; funding and campaign budget
  stay 0 until real post-deployment funding is observed.
- Staking: reward-treasury **inventory 10,000,000 FLOW**; **Year-1 maximum
  release 3,000,000 FLOW** (Genesis ≤ 1,000,000, standard ≤ 2,000,000); maximum
  weekly reward budget **50,000 FLOW** (×52 = 2,600,000 ≤ Year-1 maximum); day-one
  enabled product set **none**; dynamic bonus and Genesis/floors inactive.
- Gas budget: 21,500,000 estimated gas units + 30% safety buffer; BOT cost
  computed at preflight, never hardcoded.
- Dependency snapshot: verified chain 677 snapshot frozen, re-checked immediately
  before actual deployment.

## 2. Read-only Safe verification (chain 677, `https://rpc.botchain.ai`)

Methods used: `eth_chainId`, `eth_getCode`, `eth_call getOwners()` (`0xa0e67e2b`),
`eth_call getThreshold()` (`0xe75235b8`). No transaction, no signature.
All three addresses carry 171 bytes of proxy code with code hash
`0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`.

| Authority | Address | Live owners | Live threshold | State |
| --- | --- | --- | --- | --- |
| Governance | `0x88A4…9507` | 3 | 2 | VERIFIED |
| Operations | `0x1Ce0…59eF` | 3 | 2 | VERIFIED |
| Treasury | `0xeFc1…9Ea4` | 3 | 2 | VERIFIED |

## 3. Staking semantics

Reward-treasury **inventory** and Year-1 **distribution authority** remain
separate quantities: funded inventory (10,000,000 FLOW) is reserve inventory
only and can neither raise APR nor bypass the hard-capped Year-1 release
authority (≤ 3,000,000 FLOW). A launch product set still requires funded
reserves plus an explicit owner activation approval; deployment readiness never
implies activation.

## 4. Gating classification

| Gating | Decisions |
| --- | --- |
| `DEPLOYMENT` | FLOW economics, three Safe plans, Root Publisher, Activity Attester, timelock, rewards launch, staking launch, gas budget, dependency snapshot |
| `FEATURE_ONLY` | Liquidity and oracle plan — `PENDING_POOL`; gates swap/oracle feature activation only |
| `NON_TECHNICAL` | Legal sign-off — informational, outside technical readiness |

Neither `LIQUIDITY_AND_ORACLE_PLAN` nor `LEGAL_SIGNOFF` can block
`DEPLOYMENT_READY`; both are reported separately.

## 5. Staged model preserved

`SOURCE_READY → DEPLOYMENT_READY → DEPLOYED_VERIFIED → FUNDED_READY →
FEATURE_ACTIVE` is unchanged. Current staged readiness: **DEPLOYMENT_READY**.
Router swaps, direct bridge, rewards claims, staking genesis/floors, dynamic
staking and the activity registry all stay inactive. The dynamic staking bonus
stays 0 while the FLOW/USDT TWAP source is `PENDING_POOL`. BridgeAdapter mainnet
execution stays disabled.

## 6. Application gates

Release-freeze tests pass; full suite green; typecheck clean; production build OK.
No V26–V30 regression.

## 7. Zero-public-write confirmation

Safe creations 0 · Safe configuration changes 0 · mainnet deployments 0 · testnet
deployments 0 · wallet signatures 0 · blockchain transactions 0 · FLOW
transfers/funding 0 · liquidity actions 0 · rewards claims 0 · staking actions 0.
All chain access this session was read-only JSON-RPC; the approvals recorded here
are FlowBridge release records, never blockchain signatures.
