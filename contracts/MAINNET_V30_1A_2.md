# FlowBridge V30.1A.2 — Missing Contract Source + Toolchain Parity

Zero-write gate. Mainnet deployments = 0, testnet deployments = 0, wallet
signatures = 0, blockchain transactions = 0, FLOW transfers = 0. Nothing here
authorises a deployment.

## 1. Imported sources (byte-preserving)

| Contract | Imported path | Source SHA-256 | Source parity |
| --- | --- | --- | --- |
| FlowBridgeRouterLens | `contracts/production/router-lens/FlowBridgeRouterLens.sol` | `db509056…708a36` | BYTE_IDENTICAL |
| FlowBridgeActivityRegistry | `contracts/production/activity-registry/FlowBridgeActivityRegistry.sol` | `2735de22…aeca6e` | BYTE_IDENTICAL |
| FlowBridgeBridgeAdapterV1 | `contracts/production/bridge-adapter-v1/FlowBridgeBridgeAdapterV1.sol` | `adc2eea7…a707700` | BYTE_IDENTICAL |

Supporting material imported unchanged: Adapter mocks, the reviewed Activity
Registry Solidity test, the ABI policy checker, the four Adapter scripts, the
size check, and the isolated toolchain (`contracts/toolchain/`) with its
`HANDOFF_MANIFEST.json` and `SHA256SUMS.txt`. All 43 supplied files verified
against `SHA256SUMS.txt` before import. No reformatting, refactor, rename,
optimization or compiler upgrade was applied. FlowBridgeRouterV4 was left
untouched.

## 2. Per-contract build matrix (no cross-contamination)

| Family | solc | Optimizer | viaIR | EVM target |
| --- | --- | --- | --- | --- |
| Router V4 (unchanged) | 0.8.20 | on, runs **200** | on | shanghai |
| Lens / Activity Registry / BridgeAdapter | 0.8.20+commit.a1b79de6 | on, runs **1** | on | shanghai |
| FLOW contracts (Token / Rewards / Staking) | 0.8.24 | on, runs 200 | off | paris |

Runs 1 was preserved deliberately; rewriting it to 200 would create new bytecode
and destroy parity with the reviewed artifacts.

## 3. Toolchain isolation

Compilation ran in a separate workspace installed from the supplied
`package-lock.json` with `npm ci` (67 packages, Hardhat 3, OpenZeppelin 5.6.1).
The application dependency graph, lockfile and build were not modified.

## 4. Parity results (reproduced locally)

| Contract | Creation bytecode | Runtime bytecode | Normalized ABI | Artifact JSON file |
| --- | --- | --- | --- | --- |
| FlowBridgeRouterLens | MATCH | MATCH | MATCH | wrapper bytes differ |
| FlowBridgeActivityRegistry | MATCH | MATCH | MATCH | wrapper bytes differ |
| FlowBridgeBridgeAdapterV1 | MATCH | MATCH | MATCH | wrapper bytes differ |

Hash conventions used: bytecode hashes are SHA-256 over the decoded bytes
(`0x` stripped, hex decoded); normalized ABI hash is
`sha256(JSON.stringify(artifact.abi))`. The artifact JSON *file* bytes differ
only in non-semantic Hardhat metadata fields — every compiled bytecode and ABI
identity is identical to the archived evidence.

## 5. Test / acceptance evidence

| Item | Result |
| --- | --- |
| Reviewed Activity Registry Solidity suite | **27 passing** — canonical `computeActivityId` abi.encode formula, duplicate rejection with original preserved, different logIndex/actionType ⇒ different id, intentHash does not affect id, role separation (attester ≠ admin, pauser cannot record/unpause), pause/unpause, fail-closed unknown reads, constructor zero/duplicate rejection |
| Activity Registry ABI policy checker | PASS — `ActivityRecorded.sourceLogIndex` is `uint256` (A2.1 parity); state-changing surface limited to `grantRole`, `pause`, `recordActivity`, `renounceRole`, `revokeRole`, `unpause` |
| Lens ↔ Router V4 interface compatibility | PASS — all 8 `IFlowBridgeRouterV4View` selectors resolve on the frozen Router V4 candidate with identical output tuples; Lens has no write authority |
| Adapter local smoke | PASS — double-refund blocked, refund after execution confirmation blocked, deposits blocked while paused, guardian cannot unpause or be zeroed, route-token custody protected, renounce disabled, event surface correct |
| Adapter adversarial security | PASS — fails closed on refunded+executed inconsistency and corrupted gateway state, pause does not censor refunds, governance cannot confiscate the refund asset |
| Adapter randomized accounting | PASS — 40 deterministic cases: preview fee == official accounting, refundable + fee == source amount, exact payer debit, immutable attribution, zero residue/allowance, exact refund claim, no claim after execution |
| Adapter gateway reentrancy / balance evidence | PASS — gateway→bridge callback blocked, balance-mutation fail-closed with atomic rollback, nonce unchanged, no residual allowance |
| Router V4 EIP-170 size check | NOT APPLICABLE here — the supplied script targets a Router artifact path outside this parity scope |

## 6. Readiness matrix (unchanged mainnet posture)

| Contract | Readiness | Mainnet 677 state |
| --- | --- | --- |
| FlowToken | BLOCKED (economics/treasury governance) | PROMOTION_PENDING |
| FlowRewardsDistributor | HARDENING_REQUIRED (solvency) | PROMOTION_PENDING |
| FlowStakingVault v1 | TESTNET_ONLY | PROMOTION_PENDING |
| FlowBridgeRouterV4 | HARDENING_REQUIRED (build identity still unproven) | PROMOTION_PENDING |
| FlowBridgeRouterLens | HARDENING_REQUIRED (constructor router address not frozen) | PROMOTION_PENDING |
| FlowBridgeActivityRegistry | HARDENING_REQUIRED (production role holders not assigned) | PROMOTION_PENDING |
| FlowBridgeBridgeAdapterV1 | BLOCKED for mainnet execution (refund/recovery blocker) | PROMOTION_PENDING |

No contract is `READY_FOR_MAINNET`. Every mainnet registry slot stays empty and
unverified. Canonical networks unchanged: BOT Mainnet 677, BOT Testnet 968,
`1024` remains UNVERIFIED LEGACY CONFIGURATION and fails closed. Router bridge
proxy execution and Adapter mainnet execution both remain DISABLED.

## 7. Verdict

**FLOWBRIDGE V30.1A.2 MISSING CONTRACT SOURCE TOOLCHAIN PARITY PASS**
