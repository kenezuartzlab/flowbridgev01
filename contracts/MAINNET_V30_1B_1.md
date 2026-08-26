# FlowBridge V30.1B.1 — Router V4 EIP-170 Production Size Gate

Status: **PASS** for the size objective. No deployment, signature, transaction or
FLOW transfer was performed at any point in this gate.

## 1. Independent measurement (before any source change)

Measured in an isolated pinned workspace (Hardhat 3, solc 0.8.20, viaIR,
optimizer runs 200, EVM shanghai), reading the artifact directly:

| Candidate | Creation (init) code | Deployed / runtime code | EIP-170 (24,576) |
| --- | --- | --- | --- |
| Router V4 @ V30.1B | 29,074 | **28,703** | OVER LIMIT |
| Router Lens (runs 1) | 8,069 | 7,829 | ok |

The 28,703 figure previously recorded was the **runtime** length — the EIP-170
subject — so the blocker was real, not a creation/runtime confusion.

## 2. Size-safe candidate

| Candidate | Creation | Runtime | Headroom |
| --- | --- | --- | --- |
| Router V4 @ V30.1B.1 | 20,020 | **19,720** | 4,856 bytes (also inside the 23,500 preferred budget) |

Hashes (source layout `src/<Name>.sol`; solc embeds the source path in metadata,
so hashes only reproduce with that layout):

- source SHA-256 `bb43445af143d8c4a36fd144315c2d99f13fe28c73eca63c4f3736709e3ba905`
- creation SHA-256 `7dc0c1869a3eab59afae396294256b3d968a00de33e0554be9c6b63c30ff1195`
- runtime SHA-256 `93a922d67c281bf076d87bcf71de186f0998a8feb9c3dccafe592d097000a0f9`
- normalized ABI SHA-256 `913ace626b49a5e32b24457bf0fc6982ecca2fbfdcafff6d616ab67fc095d6df`

Lens (unchanged source, runs 1): creation `c075879e…a319b`, runtime
`05cde179…6ca3`, normalized ABI `0ee994f3…7042`.

## 3. Attribution of the reduction (8,983 runtime bytes)

1. **Legacy non fee-bound swap wrappers removed** — `swapV2`, `swapV3Single`,
   `swapV3Multi`, `swapNativeToToken`, `swapTokenToNative`, `swapMultiHop`.
   Only the `*Safe` entry points remain, so every mainnet swap is bound to a
   `maxProtocolFee` the caller actually read.
2. **Disabled bridge proxy execution removed** — `bridgeWithFee`, `bridgeBot`
   and their internals. Bridging remains the direct official BOT Bridge
   architecture; bridge registry metadata reads are unchanged.
3. **Read-only discovery/quote reads removed** — `getActiveRouters`,
   `getActiveBridges`, `getBridgeRouteConfig`, `getBestV2Rate`,
   `getV2RatesPage`. `FlowBridgeRouterLens` already serves those signatures plus
   the hardened `findBestV2Rate` / `getRoutersPage` / `getBridgesPage`.
4. **Revert strings → custom errors** — 107 string requires became 58 custom
   errors; conditions and ordering are byte-for-byte equivalent in behaviour.
   Mapping: `contracts/production/router-v4/V30_1B1_ERROR_MAP.json`.

No swap-security invariant was weakened: exact-input collection (fee-on-transfer
rejection), allowance clearing, `nonReentrant`, deadline checks, path validation,
fee ceiling (≤10% absolute), fee-nonce quote binding, pause and Ownable2Step
remain intact.

## 4. ABI migration

- `src/lib/flowbridge/routerV4Abi.ts` adds `FLOW_BRIDGE_ROUTER_V4_MAINNET_ABI`
  (the exact size-safe surface) and `V30_1B1_REMOVED_ROUTER_FUNCTIONS`.
- The Lens ABI gained `findBestV2Rate`, `getRoutersPage`, `getBridgesPage`.
- `swapMethodPolicy` now fails closed if any legacy swap call is ever selected on
  BOT Mainnet 677 — those selectors do not exist on the candidate. The BOT
  Testnet 968 deployment keeps its legacy-compatible ABI for compatibility only.

## 5. Tests

Isolated Solidity suites: **35 passing** — Router baseline (8), V30.1B hardening
and Lens (8), and the new V30.1B.1 matrix (19) in
`contracts/production/router-v4/test/V30_1B1_SizeSafe.t.sol`: V2 token→token,
V3 single, V3 multihop, native→token, token→native, cross-router multihop,
fee-change rejection, slippage floor, expired deadline, malformed V2/V3 paths,
fee-on-transfer input rejection, malicious downstream reentrancy, pause/unpause,
owner-only rescue, owner-only registry administration, deactivate→mutate→early
reactivate rejection, absence of bridge proxy execution selectors, and the
absolute fee ceiling.

## 6. Static analysis

Slither 0.11.3 with pinned solc 0.8.20 (`--optimize --optimize-runs 200
--via-ir`), informational/low excluded: 10 contracts, 63 detectors, **3 results**,
all triaged and none actionable (owner-configured fee treasury transfer; the
intentional exact-input strict equality; a false-positive reentrancy report on a
local struct copy of `routers[routerId]` under `nonReentrant`).

## 7. Governance preparation (nothing deployed)

Owner (Ownable2Step) must be an approved multisig behind a timelock, accepted
through the two-step handshake after deployment; `registryActivationDelay` and
`feeTreasury` must be set to approved values before any activation. No address
is assigned — **V30.1B-G1 stays open**.

## 8. Remaining release blockers (unchanged by this gate)

`V30.1B-D1` rewards solvency, `V30.1B-S1` staking v1 exclusion, `V30.1B-B1`
adapter refund/recovery rehearsal, `V30.1B-G1` approved governance owner.

## 9. Zero-write attestation

No deployments, no signatures, no broadcast transactions, no FLOW transfers.
BOT Mainnet 677 registry slots remain `NOT_DEPLOYED` / `PROMOTION_PENDING`.

**FLOWBRIDGE V30.1B.1 ROUTER V4 EIP170 PRODUCTION SIZE PASS**
