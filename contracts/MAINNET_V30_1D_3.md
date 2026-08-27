# V30.1D.3 — Owner Decision Session

## Verdict: FLOWBRIDGE V30.1D.3 OWNER DECISION SESSION BLOCKED

Eleven owner decisions were recorded through the live V30.1D.2 admin release-freeze
endpoint by `kenezuartzlab@gmail.com` (`super_admin`). Seven are frozen; four were
recorded but fail the frozen fail-closed rules, and two were never submitted.
No machinery was weakened to obtain a green status. Public writes performed: **zero**.

Manifest hash: `fnv1a64:00afcfd1deed33b5` (was `fnv1a64:aabfd1737ab49b23` with zero
decisions). Candidate digest unchanged: `fnv1a64:19671fd13a81be19`.

## 1. Decision results

| Decision | Status | Change from proposal |
| --- | --- | --- |
| FLOW_ECONOMICS | APPROVED | none — canonical proposal approved as presented |
| GOVERNANCE_SAFE_PLAN | BLOCKED | owner-supplied Safe recorded; fails the owner-count rule |
| TREASURY_SAFE_PLAN | BLOCKED | owner-supplied Safe recorded; fails the owner-count rule |
| OPERATIONS_SAFE_PLAN | BLOCKED | owner-supplied Safe recorded; fails owner-count and threshold rules |
| ROOT_PUBLISHER_ASSIGNMENT | REPLACED | address set to `0x971E7790FE6C8F77dc666Bb05D4aedA362653f94` |
| ACTIVITY_ATTESTER_ASSIGNMENT | REPLACED | address set to `0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47` |
| TIMELOCK_POLICY | APPROVED | none — 24h delay, bounded emergency pause |
| REWARDS_LAUNCH_PLAN | REPLACED | funding 1,000,000 FLOW; launch budget 1 FLOW; root delay 24h |
| STAKING_LAUNCH_PLAN | BLOCKED | 10,000,000 FLOW reserve exceeds the 3,000,000 Year-1 ceiling |
| LIQUIDITY_AND_ORACLE_PLAN | NEEDS_APPROVAL | not submitted — release amount and liquidity floor absent |
| GAS_BUDGET_PLAN | APPROVED | none — 21.5M units + 30% buffer, computed at preflight |
| DEPENDENCY_SNAPSHOT | APPROVED | none — evidence-derived, not owner-editable |
| LEGAL_SIGNOFF | NEEDS_APPROVAL | not submitted — no external reference recorded |

## 2. Outstanding blockers

1. **Governance Safe** `0x770ECD301da28aB7170610327bE22C8786e40588` — 2 owners
   recorded; at least 3 distinct owners are required (threshold 2 accepted).
2. **Treasury Safe** `0xa08ce999CEE03B89e2592036c15337Ea4790862c` — 2 owners
   recorded; at least 3 distinct owners are required.
3. **Operations Safe** `0xf42D0E115e8715e9BaFa615d67ac9cCd09C75C1E` — 2 owners and
   threshold 1; requires at least 3 owners and threshold ≥2.
4. **Staking reserve** — reduce to ≤3,000,000 FLOW (Genesis ≤1,000,000, standard
   ≤2,000,000). `maxFlowPerEpoch` 50,000 annualises to 2,600,000 and is accepted.
5. **Liquidity/oracle** — needs the owner-approved FLOW released at launch, the
   minimum liquidity threshold, venue/pair confirmation and the counter-asset amount.
6. **Legal sign-off** — needs an explicit external reference.

Because the Treasury Safe plan is not approved, the cross-decision rule
`FLOW genesis treasury recipient is not an approved multisig plan` also stands,
so FlowToken cannot advance even though FLOW economics is approved.

## 3. Advisory observations (not hard blockers)

- The Activity Attester `0xFA3D…7e47` and the Pauser `0xA7d0…30a2` are also
  recorded as Governance Safe owners. Operational role keys doubling as governance
  signers reduces the separation this gate exists to protect.
- `0xA7d0…30a2` sits on both the Governance and Treasury Safes.
- The Operations Safe owner list contains the previously-supplied Treasury Safe
  address, coupling the pause path back toward treasury custody.

## 4. Staged readiness

No contract advanced to `DEPLOYMENT_READY`: governance, treasury and staking
decisions remain unapproved. Every feature stays inactive — Router swaps, direct
bridge, rewards claims, staking genesis/floors, dynamic staking, activity registry.
BridgeAdapter mainnet execution stays disabled. The dynamic staking bonus remains 0
while the FLOW/USDT TWAP source is `PENDING_POOL`.

## 5. Application gates

29 release-freeze tests pass; 922 tests across 82 files; typecheck clean; production
build OK. No V26–V30 regression.

## 6. Zero-public-write confirmation

Safe creations 0 · BOT Mainnet deployments 0 · BOT Testnet deployments 0 · wallet
signatures 0 · blockchain transactions 0 · FLOW transfers/funding 0 · liquidity
actions 0 · rewards claims 0 · staking actions 0. The only writes in this session
were append-only FlowBridge release records in `mainnet_release_decisions`.
