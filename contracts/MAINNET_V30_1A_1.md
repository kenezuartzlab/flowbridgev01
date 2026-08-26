# FlowBridge V30.1A.1 — Production Contract Source Consolidation

Zero-write gate. Mainnet deployments = 0, testnet deployments = 0, wallet
signatures = 0, blockchain transactions = 0, FLOW transfers = 0. Nothing here
authorises a deployment.

## 1. Imported contracts and selected candidate

| Contract | Candidate selected | Path | Selection |
| --- | --- | --- | --- |
| FlowBridgeRouterV4 | reviewed reference pack, `FlowBridgeRouterV4-stackfix.sol` | `contracts/production/router-v4/FlowBridgeRouterV4.sol` | PRODUCTION_CANDIDATE |
| FlowBridgeRouterV4 (original variant) | reviewed reference pack, `FlowBridgeRouterV4.sol` | `contracts/archive/router-v4/FlowBridgeRouterV4-original.sol` | ARCHIVED_REFERENCE (never selectable) |
| FlowBridgeRouterLens | **none supplied** | — | ABSENT |
| FlowBridgeActivityRegistry | **none supplied** | — | ABSENT |
| FlowBridgeBridgeAdapterV1 | **none supplied** | — | ABSENT |

Only one variant is marked PRODUCTION_CANDIDATE. The stackfix variant was chosen
because it is the compiler-compatible source with an identical external ABI; the
only recorded difference is that `getBridgeRouteConfig()` assigns its seven named
return values sequentially instead of returning one seven-value tuple. No
reformatting, refactor, optimization or version upgrade was applied.

## 2. Source-parity result

| Artefact | SHA-256 | Result |
| --- | --- | --- |
| `FlowBridgeRouterV4.sol` (candidate) | `eb2069e5d5b2eef8c6c34cc8d9826417d767792d3812dbcebbe318397e46cebd` | matches reviewed pack byte-for-byte |
| `FlowBridgeRouterV4-original.sol` (archived) | `8d5ebab2e9e5506074f9dae4a5b922d63f889d55edcac6477dcbbe16f0833d91` | matches reviewed pack |
| `FlowBridgeRouterV4.t.sol` | `629f5fd75d1074b1de3f985d070054120ee65061b1ad59a79248788b3b457a11` | matches reviewed pack |
| `FlowBridgeRouterV4.abi.ts` | `7d25b676013777112996fecc036eacbcfc7f09635ddd9b7dd7b6e1cbacddff73` | matches reviewed pack |
| Creation (artifact) hash | — | **not reproducible here** (no Solidity toolchain) |
| Runtime bytecode hash | — | **not reproducible here** |
| Normalised ABI hash | — | **not reproducible here** (requires a compile) |

Source parity: CONFIRMED for every artefact that was supplied.
Build parity: UNPROVEN — fails closed, not repaired automatically.

## 3. Compiler / optimizer / viaIR / EVM-target matrix

| Family | Compiler | Optimizer | viaIR | EVM target |
| --- | --- | --- | --- | --- |
| Router V4 line (preserved verbatim) | 0.8.20 | on, 200 runs | on | shanghai |
| FLOW contracts (Token / Rewards / Staking) | 0.8.24 | on, 200 runs | off | paris |

## 4. Canonical network rules (unchanged)

BOT Mainnet = 677, BOT Testnet = 968. `1024` remains UNVERIFIED LEGACY
CONFIGURATION and fails closed for every network-facing production use. No
`1024` configuration was reintroduced with the imported source.

## 5. Test / audit results

| Item | Result |
| --- | --- |
| Router tests (safe swap paths, fee ceilings, slippage/deadline, downstream approvals, unsupported route rejection, pause, registry controls, bridge proxy disabled) | **NOT RUN** — reviewed suite imported; no Solidity test runner exists in this workspace |
| Activity Registry tests + `uint256 sourceLogIndex` parity proof | **NOT POSSIBLE** — source absent |
| Router Lens checks (canonical Router state, interface binding, no write authority, reproducible identity) | **NOT POSSIBLE** — source absent |
| BridgeAdapter tests | **NOT RUN** — source absent; mainnet execution stays DISABLED, refund/recovery blocker unresolved |

Bridge architecture unchanged: user wallet → official BOT Bridge gateway. Router
bridge proxy execution remains disabled for mainnet.

## 6. Updated mainnet readiness matrix

| Contract | Readiness | Mainnet 677 state |
| --- | --- | --- |
| FlowToken | BLOCKED (economics/treasury governance) | PROMOTION_PENDING |
| FlowRewardsDistributor | HARDENING_REQUIRED (solvency) | PROMOTION_PENDING |
| FlowStakingVault v1 | TESTNET_ONLY | PROMOTION_PENDING |
| FlowBridgeRouterV4 | HARDENING_REQUIRED (source now consolidated) | PROMOTION_PENDING |
| FlowBridgeRouterLens | BLOCKED (source absent) | PROMOTION_PENDING |
| FlowBridgeActivityRegistry | BLOCKED (source absent) | PROMOTION_PENDING |
| FlowBridgeBridgeAdapterV1 | BLOCKED for mainnet execution (source absent + refund blocker) | PROMOTION_PENDING |

No contract is `READY_FOR_MAINNET`.

## 7. Repository organization

- `contracts/production/**` — the single production package; the only tree that
  deployment tooling resolves (`src/lib/deploy/productionContractPackage.ts`).
- `contracts/archive/**` — historical copies, never selectable.
- No production address or artifact is inferred from any archived testnet
  manifest; every mainnet registry slot stays empty and unverified.

## 8. Verdict

**FLOWBRIDGE V30.1A.1 PRODUCTION CONTRACT CONSOLIDATION BLOCKED**

Reasons:
1. FlowBridgeRouterLens, FlowBridgeActivityRegistry and FlowBridgeBridgeAdapterV1
   reviewed sources, tests and ABIs were not supplied to this workspace.
2. Router V4 creation/runtime bytecode and ABI identity cannot be reproduced here,
   so build parity against the reviewed candidate is unproven.
3. The reviewed Router / Adapter Solidity test suites cannot be executed here.

To reach PASS: supply the reviewed Lens, Activity Registry and BridgeAdapter
sources plus their tests and ABIs, and a Solidity build/test toolchain (compiler
0.8.20, optimizer 200 runs, viaIR on, EVM target shanghai) so artifact, runtime
and ABI hashes can be reproduced and compared.
