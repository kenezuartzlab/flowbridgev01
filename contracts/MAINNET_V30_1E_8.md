# V30.1E Stage C — Router V4 + Router Lens Preflight

**Verdict: STAGE C PREFLIGHT PASS — APPROVED, NOT BROADCAST**

Read-only. Nothing was signed, broadcast, funded, registered, activated or migrated.
Router v3 (`0x986962de6f00d0ec571b1a34fa70aeeb445b5445`) remains the live production
router and keeps all app traffic. Deploying V4 does not replace v3.

## 1. Rebuild parity (double build, clean compiler state)

| Contract | solc | optimizer | viaIR | EVM | runtime SHA-256 | bytes | creation SHA-256 | parity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FlowBridgeRouterV4 | 0.8.20+commit.a1b79de6 | 200 | true | shanghai | `5650a7c7b744b1eebdc2a5167edfd6ae486bda4e7c2af5e606a1c42dfc4a88f1` | 19,720 | `ca4eb47368ce6b3eae3df8822d39e1af86c672bed07baae1c230f64f9041dec8` | PROVEN |
| FlowBridgeRouterLens | 0.8.20+commit.a1b79de6 | 1 | true | shanghai | `629755614256eccd980c134e427292aa064cf620d828f79696d93385a424bffd` | 7,829 | `41a872fc048e1c8071bc8dfd8764c3669a229240e94cd5c080a80304feffbd1e` | PROVEN |

Source hashes: Router `bb43445a…9e3ba905`, Lens `8a5e1c84…6ff71aa2`.
Normalized ABI: Router `913ace62…c095d6df`, Lens `0ee994f3…02dc7042`.
Both `doubleBuild = REPRODUCIBLE`, both within EIP-170. V30.1E.1 evidence unchanged.

## 2. Chain and deployer (BOT Mainnet 677, block 21,321,532)

- deployer `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`, `eth_getCode = 0x` (EOA)
- nonce **2** (Stage A used 0, Stage B used 1)
- balance **2.45096262 BOT**, gas price 20 gwei
- candidate `fnv1a64:19671fd13a81be19`, manifest `fnv1a64:9972234982dbe76f`
- Treasury / Governance / Operations Safes verified (3 owners, threshold 2)
- frozen BDEX/BOT dependency addresses unchanged

## 3. Unsigned deployment transactions (ordered)

**1 — FlowBridgeRouterV4**, nonce 2, value 0
`initialOwner = 0x88a4cc1f5771523baeb83daeea07d323a3ce9507` (Governance Safe),
`initialFeeTreasury = 0xefc13d1a1dc30ba2da0bb005ba5a783c6b229ea4` (Treasury Safe)
data 20,084 bytes, keccak `0xfe972eb9bdd8377d8cd5331180d594f8307373d41f5f9a73de6c13d17fb27fb2`
gas estimate 4,452,213 → limit 5,787,876
expected address `0x3c6fdaf93f39c72be931ab80196292962ebe6b06` = CREATE(deployer, 2)

**2 — FlowBridgeRouterLens**, nonce 3, value 0
`flowRouter_ = 0x3c6fdaf93f39c72be931ab80196292962ebe6b06`
data 8,101 bytes, keccak `0x44efb54034d8c07c7437bd73c094ce2bfcff9f08bb463394623430327100b8a9`
gas estimate 1,764,423 → limit 2,293,749
expected address `0x48338d23640b09acdf0e7246844a9d867dc8205c` = CREATE(deployer, 3)

The Lens constructor reverts unless its target already holds code, so its estimate
was taken read-only against the live Router v3 as an equal-shape stand-in, and the
Lens must be the second transaction. Combined buffered fee **0.1616325 BOT** — covered.

## 4. Expected genesis configuration

owner Governance Safe · pendingOwner zero · feeTreasury Treasury Safe ·
globalFeeBps 0 · maxFeeBps 500 · feeConfigNonce 0 · paused false ·
routerCount 0 · bridgeCount 0 · registryActivationDelay 0 (`MAX_REGISTRY_ACTIVATION_DELAY`
= 7 days compiled in) · `bridgeProxyExecutionEnabled` false for every id ·
BridgeAdapter mainnet execution OFF.

Registry is empty at genesis: every router/bridge registration and activation is a
separate Governance action subject to the activation delay, which Governance must set
before the first activation.

## 5. Correction found during preflight

The frozen Router V4 payload definition carried only `initialOwner`. The contract's
constructor is `(address initialOwner, address initialFeeTreasury)`, and the
one-argument payload reverted on live `eth_estimateGas`. `deploymentPayloads.ts` now
binds the Treasury Safe as `initialFeeTreasury`, per the frozen decision manifest.
Bytecode identity is unchanged; only the Router constructor-args hash changed.

## 6. Stage C approval bindings

Two one-time approvals (`buildStageCApprovals()`), one per contract, each bound to
stage `C_ROUTER_V4_AND_LENS`, chain 677, the deployer, the exact creation hash and the
exact constructor-args hash. They authorize deployment only — never funding, registry
registration/activation, bridge enablement or Router v3 → V4 promotion.

## 7. Promotion rule

V4 promotion requires, in order: correct Router + Lens settlement, completed public
source verification, proven governance/configuration, and an explicit migration
approval. Until then v3 stays authoritative.

Evidence: `contracts/production/STAGE_C_PREFLIGHT.json`, `src/lib/deploy/stageCDeployer.ts`.
