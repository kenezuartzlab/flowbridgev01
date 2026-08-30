# FlowBridge V30.2A — Clean Redeploy + Verify One-by-One (PREFLIGHT)

**Verdict: FLOWBRIDGE V30.2A CLEAN REDEPLOY VERIFY ONE-BY-ONE PREFLIGHT PASS — NEW CANDIDATE READY, ZERO WRITES**

New candidate digest: `fnv1a64:e0ac31b5bb297880`. The V30.1 digests
(`fnv1a64:9972234982dbe76f`, `fnv1a64:19671fd13a81be19`) are superseded and must not be
reused — the digest input now includes the full compiler/bytecode matrix, so a build change
cannot silently inherit an old approval.

Evidence: `contracts/production/V30_2A_REDEPLOY_PREFLIGHT.json`.
Verification bundles: `contracts/production/v30-2a-candidate/standard-inputs/`.
Gate logic + tests: `src/lib/deploy/v302aRedeployCandidate.ts(.test.ts)`.

## 1. Replaced vs retained

| Stage | Contract | Action | viaIR |
| --- | --- | --- | --- |
| R1 | FlowToken | replace | false |
| R2 | FlowRewardsMerkleDistributor | replace | false |
| R3 | FlowBridgeActivityRegistry | replace | false |
| R4 | FlowStakingRewardTreasury | replace | false |
| R5 | FlowStakingController | replace | false |
| R6 | FlowStakingVaultV2 | replace | **true (documented exception)** |
| — | Router V4 / Router Lens / Router v3 | retained, untouched | unchanged |

## 2. Dependency graph

- New FlowToken (R1) forces R2 Distributor, R4 Reward Treasury and R6 Vault V2, all of
  which bind the FLOW token address directly at construction.
- R3 Activity Registry is FLOW-independent. It is redeployed to close its verification
  provenance defect (the deployed viaIR build is `LAYOUT_DIVERGENT` and no published
  solc 0.8.20 build reproduces it).
- R5 Controller has no FLOW binding and `setVault(address)` is `GOVERNOR_ROLE`-replaceable,
  so replacement is **not contractually forced**. It is replaced by owner decision for
  non-viaIR verification parity and clean Year-1 counters; the old Controller's counters are
  all zero (never funded, never activated), so no accounting state is lost. The old
  Controller is not pointed at a new Vault.
- R6 Vault V2 binds new token + new Controller + new Reward Treasury.

## 3. Non-viaIR result per contract

All builds compiled twice in a clean environment with pinned solc and byte-identical output,
zero Solidity warnings, all runtime sizes far inside EIP-170.

| Contract | solc | runs | EVM | runtime bytes | headroom | result |
| --- | --- | --- | --- | --- | --- | --- |
| FlowToken | 0.8.24 | 200 | cancun | 3,760 | 20,816 | non-IR GREEN |
| Rewards Distributor | 0.8.24 | 200 | cancun | 6,629 | 17,947 | non-IR GREEN |
| Activity Registry | 0.8.20 | 200 | shanghai | 3,082 | 21,494 | non-IR GREEN |
| Staking Reward Treasury | 0.8.24 | 200 | cancun | 4,827 | 19,749 | non-IR GREEN |
| Staking Controller | 0.8.24 | 200 | cancun | 7,997 | 16,579 | non-IR GREEN |
| Staking Vault V2 | 0.8.24 | 200 | cancun | 10,366 | 14,210 | non-IR FAILED → IR retained |

ABI parity: Activity Registry, Reward Treasury, Controller and Vault V2 reproduce the exact
normalized ABI hashes of the reviewed/deployed contracts, so the interface is unchanged.

Registry settings note: optimizer `runs` moves from 1 to 200 and `viaIR` is off. `runs=1`
existed only to protect Router V4's size budget; it never applied to this contract's own
requirements, and the source is byte-identical to the reviewed pack.

## 4. Only documented viaIR retention

`FlowStakingVaultV2` without viaIR fails hard:

```
CompilerError: Stack too deep. Try compiling with viaIR: true while enabling the optimizer.
  --> FlowStakingVaultV2.sol:331:39
331 |   p.varPaid = varPerTokenStored[productId];
```

Source is **not** rewritten to dodge the stack limit, because that would produce a new,
independently reviewable contract. R6 therefore keeps viaIR and needs an explicit owner
approval before it may be authorized.

## 5. Old deployment quarantine

Labeled `OLD_V30_1_DEPLOYMENT / DEPRECATED_PENDING_REPLACEMENT`:
FlowToken `0x535dDDA8…40aE9`, Distributor `0x3824681c…5673FB`, Activity Registry
`0xa80d8740…68753c`, Reward Treasury `0xA861152C…32d0e`, Controller `0x5095ecc7…1b52bf`,
Vault V2 `0x3cc0799f…B989c8`.

- The old 1,000,000,000 FLOW stays in Treasury Safe `0xeFc13d1A…29Ea4`. Not moved, not
  burned, no allowances granted.
- No old rewards funding, no old staking funding, no old staking activation, no old activity
  attestations, no liquidity, no user distribution, no canonical app exposure.
- Mainnet FLOW rewards config in the app still resolves `token=null`, `distributor=null`,
  `claimsEnabled=false`, so no old mainnet address is user-visible.
- All old addresses and settlement transactions remain recorded permanently for audit.

## 6. One-by-one rule (enforced in code)

`authorizeRedeployStage()` fails closed and blocks a stage unless: the candidate digest
matches the approved digest, the contract's build is in the frozen matrix, any viaIR use is
documented, the dependency stage is `SOURCE_VERIFIED`, the stage has explicit owner
approval, and the old stack is neither funded nor exposed. Every stage deploys
unfunded/unactivated, then must reach public source verification and constructor read-back
before the next dependent stage is authorized.

## 7. Router safety

No Router transaction exists in this gate. Router V4 stays promotion-pending with an empty
registry and `registryActivationDelay = 0`; Router Lens stays bound to the current V4;
Router v3 keeps serving live production routing.

## 8. Funding

Not authorized here. After the full replacement path is publicly verified and the canonical
registry points only at the new contracts: 1,000,000 FLOW to the new Distributor and
10,000,000 FLOW to the new Reward Treasury, each under separate Treasury Safe 2-of-3
approval. Funding old and new simultaneously is structurally forbidden.

## 9. What PASS authorizes

Only stage **R1 — New FlowToken**, and only after owner approval is frozen against candidate
digest `fnv1a64:e0ac31b5bb297880`. It authorizes no funding, no activation, no Router
migration, and no use of the old deployment stack.
