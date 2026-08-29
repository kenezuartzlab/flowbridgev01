# FlowBridge V30.1E Stage C.1 — Router V4 Settlement (BOT Mainnet 677)

**Verdict: `STAGE C.1 SETTLED — RUNTIME PARITY EXACT — PUBLICLY SOURCE VERIFIED`**

Router Lens is **approved but NOT broadcast**. Router v3
(`0x986962de6f00d0ec571b1a34fa70aeeb445b5445`) remains the live production
router; no traffic migration, funding, registration or activation occurred.

## Pre-sign revalidation (immediately before signing)

| Check | Value | Result |
| --- | --- | --- |
| chainId | 677 | exact |
| deployer nonce | 2 | exact |
| candidate digest | `fnv1a64:19671fd13a81be19` | exact |
| decision manifest | `fnv1a64:9972234982dbe76f` | exact |
| creation SHA-256 | `ca4eb473…9041dec8` | exact |
| runtime SHA-256 | `5650a7c7…fc4a88f1` (19,720 bytes) | exact |
| unsigned data keccak | `0xfe972eb9bdd8377d8cd5331180d594f8307373d41f5f9a73de6c13d17fb27fb2` | exact |
| target address code | `0x` | empty |

Rebuilt from the frozen source with solc `0.8.20+commit.a1b79de6`, optimizer
200, `viaIR: true`, EVM `shanghai`.

## Settlement

- tx `0x142b41ea8b5e1b13bf3439212dbf7a24a29edb17267be782cd1f311e6e0ba46c`
- block `21,328,235`, status `1`, value `0 BOT`, nonce `2`
- address `0x3c6fdaf93F39c72be931AB80196292962ebe6B06` — equals expected `0x3c6f…6b06`
- gas used `4,415,998` of `5,787,876` at 20 gwei → fee `0.08831996 BOT`
- deployer balance after `2.36264266 BOT`

## Runtime parity

On-chain runtime SHA-256 `5650a7c7…fc4a88f1`, 19,720 bytes, **0 byte
differences** against the rebuilt artifact — exact match (no immutable
allowance needed).

## Observed configuration

| Field | Value |
| --- | --- |
| owner | Governance Safe `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` |
| pendingOwner | `0x0` |
| feeTreasury | Treasury Safe `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` |
| globalFeeBps | 0 |
| maxFeeBps | 500 |
| feeConfigNonce | 0 |
| paused | false |
| routerCount / bridgeCount | 0 / 0 |
| bridge execution | OFF (no bridge entry exists) |
| registryActivationDelay | 0 (max 604,800) |

**Activation-delay policy:** the zero delay is accepted only while the registry
is empty. Governance must configure and verify the approved non-zero production
delay **before** the first registration or activation. Enforced in code by
`activationDelayAcceptable()` in `src/lib/deploy/stageC1Settlement.ts`.

## Public source verification

`scan.botchain.ai` reports `is_verified: true`, `FlowBridgeRouterV4`,
compiler `v0.8.20+commit.a1b79de6`. The flattened-code route failed (it cannot
express `viaIR`); the Blockscout v2 **standard-json-input** route reproduced
the deployed bytecode exactly. Stage A/B source publication can now use the
same route.

## Stage C.2 — Lens, re-estimated against the deployed V4

Constructor target is now the real V4 (`0x3c6f…6b06`), not the v3 stand-in:

- creation SHA-256 `41a872fc…effbd1e`, runtime SHA-256 `62975561…424bffd`
- unsigned data 8,101 bytes, keccak `0x44efb54034d8c07c7437bd73c094ce2bfcff9f08bb463394623430327100b8a9` — **identical to preflight**
- gas estimate `1,764,435` (preflight stand-in `1,764,423`), buffered limit `2,293,765`
- nonce `3`, expected address `0x48338d23640b09acDf0e7246844a9d867DC8205c`

Payload and target are unchanged, so C.2 is ready for explicit authorization.
