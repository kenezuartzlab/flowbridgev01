# FlowBridge V30.1E — BOT Mainnet 677 Deployment + Verification Gate

## Verdict: FLOWBRIDGE V30.1E BOT MAINNET DEPLOYMENT VERIFICATION BLOCKED

No contract was deployed. Public writes performed: **zero** — zero deployments,
zero signatures, zero Safe transactions, zero FLOW transfers, zero funding,
zero role grants, zero approvals. Every read below was a read-only JSON-RPC call
against BOT Mainnet 677.

Release inputs used for evaluation (unchanged):

- candidate digest `fnv1a64:19671fd13a81be19`
- decision manifest `fnv1a64:9972234982dbe76f`
- baseline: V30.1D.4 PASS · staged readiness `DEPLOYMENT_READY` (not deployed)

## 1. Confirmed release inputs

Both digests re-read from the frozen sources and are byte-identical to the
V30.1D.4 approval. No source file under `contracts/production/**` was modified in
this gate; a source change would require a new candidate digest and a new
approval cycle.

## 2. Chain identity and preflight (read-only)

| Check | Observed |
| --- | --- |
| `eth_chainId` | `0x2a5` = **677** (exact match; 968 and legacy 1024 rejected) |
| `eth_blockNumber` | `0x14338ed` at observation time |
| RPC endpoint | `https://rpc.botchain.ai` (read-only) |

## 3. Safe authority verification immediately before deployment

All three Safes are live 171-byte proxies with identical proxy code hash
`sha256 a8a0fbd3cdf49e751346664e01b529a58322a814cf8df8d85deb20e63bd6415e`,
exactly three owners each and threshold **2**.

| Authority | Address | Threshold | Owners | State |
| --- | --- | --- | --- | --- |
| Treasury Safe | `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` | 2 | 3 (matches approved set) | VERIFIED |
| Governance Safe | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` | 2 | 3 | VERIFIED |
| Operations Safe | `0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF` | 2 | 3 | VERIFIED |

Root Publisher `0x971E7790FE6C8F77dc666Bb05D4aedA362653f94` and Activity
Attester `0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47` remain assigned to their
single respective roles only, and are distinct from all three Safes.

## 4. Frozen dependency snapshot (read-only)

Every frozen mainnet dependency still has code at its recorded address:

| Dependency | Address | Runtime bytes |
| --- | --- | --- |
| WBOT | `0xd5452816194a3784dba983426cce7c122f4abd30` | 2,317 |
| BOT USDT | `0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c` | 6,188 |
| BDEX V2 Router02 | `0x1414eD29FdFD322c3c0a830330ed982E2D629e76` | 21,987 |
| BDEX Router | `0xaE6ae8630f7A888dEc0B9195C85F7515d5887655` | 18,242 |
| BDEX Factory | `0x117115f3b72c8d1989178089a67d0c26f8ee0aa3` | 13,849 |
| Official BridgeRouter | `0xef8dc669eca13e612b67ff09478352e85bd6cc53` | 2,227 |
| USDT/BOT V3 pool | `0x64f418471a1a7932a190e10da5a8551db5abec05` | 22,142 |
| FlowBridgeRouter v3 (existing production) | `0x986962de6F00D0eC571b1a34Fa70AEeB445b5445` | 17,779 |

No dependency address is code-less. Runtime hashes were recorded, but the frozen
snapshot does not carry a per-dependency reference runtime hash for every entry,
so `DEPENDENCIES_UNCHANGED` cannot be asserted as a byte-level match yet.

## 5. Hard blockers preventing broadcast

The staged gate `src/lib/deploy/mainnetDeploymentGate.ts` returns
`authorized: false` for **Stage A** and therefore for every later stage:

1. **`DEPLOY_CREDENTIAL_PRESENT` fails.** No mainnet deployment credential
   (`MAINNET_DEPLOYER_PRIVATE_KEY`) and no `BOT_MAINNET_RPC_URL` deployment
   endpoint are configured. Lovable cannot sign or broadcast a BOT Mainnet
   transaction, and private keys must never be pasted here.
2. **`ARTIFACT_BUILD_PARITY_PROVEN` fails for Router V4.**
   `contracts/production/MANIFEST.json` records
   `FlowBridgeRouterV4.runtimeSha256 = null` and
   `buildParity = UNPROVEN_NO_REVIEWED_BYTECODE_REFERENCE`. Deployed bytecode
   could not be compared to a frozen reference, so Stage C cannot pass its
   post-deployment runtime hash check.
3. **No frozen production artifacts exist for the Stage A/B/E candidates.**
   `contracts/artifacts/` holds only the earlier testnet build line
   (`FlowToken`, `FlowRewardsDistributor`, `FlowStakingVault`). The canonical
   budgeted `FlowRewardsMerkleDistributor` and the staking-v2 trio
   (`FlowStakingRewardTreasury`, `FlowStakingController`, `FlowStakingVaultV2`)
   have source plus build evidence but no reviewed creation/runtime bytecode in
   the production manifest.
4. **`GAS_BUDGET_COVERED` fails.** No approved deployer address or balance
   exists to check against the 21.5M gas plan plus 30% buffer.
5. **`STAGE_APPROVED_BY_OWNER` is unrecorded.** Per-stage broadcast approval
   through the Safe flow has not been given for any stage.

Because of (1), stages A–E were **not attempted**. Nothing was deployed, so
Stage-level runtime/source verification, explorer verification, role handoff and
the post-deployment invariant snapshot are all `NOT_APPLICABLE — NOT DEPLOYED`.

## 6. What this gate added

- `src/lib/deploy/mainnetDeploymentGate.ts` — pure, fail-closed evaluation of
  per-stage broadcast authorization (digest immutability, chain 677, staged
  ordering, live Safe authority match, dependency drift, artifact build parity,
  credential presence, gas envelope, explicit approval), the post-deployment
  invariant snapshot (1B supply, genesis mint to Treasury, zero rewards balance
  and `totalReserved`, zero staking liabilities/positions/epochs, Router bridge
  proxy OFF, BridgeAdapter inactive, empty Activity Registry, admin ≠ attester,
  Router owner = Governance Safe, fee treasury = Treasury Safe, five staking
  products, 1M/2M/3M Year-1 caps, 50k weekly cap, 90 Genesis reward-days,
  dynamic bonus unavailable while `PENDING_POOL`, no unexpected allowances), and
  the two separate funding checkpoints (1,000,000 FLOW rewards and 10,000,000
  FLOW staking inventory, Treasury-Safe-origin only).
- `src/lib/deploy/mainnetDeploymentGate.test.ts` — 14 tests covering
  authorization, ordering, drift, invariants, funding and verdict computation.
- This report.

No signing path, no broadcast path and no registry mutation was introduced.

## 7. Feature activation state (unchanged)

- Liquidity/oracle stays `PENDING_POOL` — feature-activation only, not a
  deployment failure and not part of technical readiness.
- Router bridge proxy execution remains OFF; the BridgeAdapter mainnet path
  remains disabled. The direct official BOT Bridge path is unaffected.
- Rewards claim UX stays inactive: no funded epoch exists and no root is
  published.
- Staking products stay inactive; the dynamic standard bonus remains
  unavailable pending a verified FLOW/USDT price reference.
- The mainnet Router in the execution registry remains the existing production
  `v3-legacy` deployment. No production address was replaced or hardcoded.
- No UI surface displays fabricated live APR, claimable FLOW, liquidity or
  campaign availability.

## 8. Remaining blockers to reach PASS

1. Provide a reproducible reviewed runtime/creation bytecode reference for the
   Router V4 candidate, the budgeted rewards distributor, FlowToken and the
   staking-v2 trio, built on their own frozen compiler lines
   (Router: solc 0.8.20 / runs 200 / viaIR / shanghai; missing-contract package:
   solc 0.8.20+commit.a1b79de6 / runs 1 / viaIR / shanghai — do not unify).
2. Configure the mainnet deployment credential and RPC endpoint outside Lovable,
   with the approved deployer funded for the 21.5M gas plan plus 30% buffer.
3. Record explicit per-stage broadcast approval, one stage at a time, reviewing
   each receipt before the next dependent stage.
4. Re-verify all three Safe owner sets and thresholds immediately before the
   first broadcast (they verify as of this report).
