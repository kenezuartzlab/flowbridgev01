# FlowBridge V30.1E Stage D — Activity Registry Preflight

**Verdict: `FLOWBRIDGE V30.1E STAGE D PREFLIGHT PASS — APPROVED, NOT BROADCAST`**

Read-only. No signature, no broadcast, no attestation, no fabricated activity, no
asset transfer, no unrelated role grant, no funding, no Router registry change,
no Router v3 traffic migration.

## Build matrix (Registry's own frozen line)

| Field | Value |
| --- | --- |
| build line | `missingContractPackage` |
| solc | `0.8.20+commit.a1b79de6.Emscripten.clang` |
| optimizer | enabled, **runs 1** |
| viaIR | true |
| EVM | shanghai |
| OpenZeppelin | 5.6.1 |

Router (`runs 200`) and Staking (`0.8.24` / `cancun`) settings are explicitly not
inherited; either would produce different bytecode and destroy manifest parity.

## Artifact parity — exact match to `PRODUCTION_BYTECODE.json`

| Hash | Value |
| --- | --- |
| source | `2735de22c1f59a4c7ba7c4c66a2944b03db19aa3c76d670d0ef9a20ff5aeca6e` |
| creation | `25ec99e2bc31648d9e0cb2376c00063c404d2b535afe887f1b9cb37ebfc2cc6d` |
| runtime | `53a83eea932da41016a7021926113e4ed50612525768bb6ba0eb1ec876b3e03b` |
| normalized ABI | `e021c7402ce241fe89624df8c395b30347b82bdac888758530e4bfe597a8978d` |

Creation 3,490 bytes · runtime 2,713 bytes (EIP-170 `WITHIN_LIMIT`) ·
double build `REPRODUCIBLE`.

## Constructor arguments

```
admin    = 0x88a4cc1f5771523baeb83daeea07d323a3ce9507  (Governance Safe)
attester = 0xfa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e47  (Activity Attester)
pauser   = 0x1ce0b1df5d2055f6e92122d8cb7669609c2359ef  (Operations Safe)
```

ABI-encoded tail:
`0x...88a4cc1f5771523baeb83daeea07d323a3ce9507` +
`0x...fa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e47` +
`0x...1ce0b1df5d2055f6e92122d8cb7669609c2359ef`

## Role matrix at genesis

| Role | Holder |
| --- | --- |
| `DEFAULT_ADMIN_ROLE` | Governance Safe |
| `ATTESTER_ROLE` | Activity Attester |
| `PAUSER_ROLE` | Operations Safe |
| unpause | `DEFAULT_ADMIN_ROLE` only |

`admin != attester` (constructor reverts `AdminAttesterMustDiffer`, and
`grantRole` keeps the separation permanently). Deployer receives no role.

## Chain observation — BOT Mainnet 677, block 21,349,018

| Item | Value |
| --- | --- |
| chainId | 677 |
| deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`, code `0x` |
| nonce | 4 |
| balance | 2.32765498 BOT |
| gas price | 20 gwei |
| Governance / Operations / Treasury Safes | 3 owners, threshold 2, verified |
| Activity Attester | EOA, exact frozen address |

## Unsigned creation transaction

| Field | Value |
| --- | --- |
| to | `null` (contract creation) |
| value | 0 BOT |
| nonce | 4 |
| gas estimate | 733,319 |
| gas limit (+30%) | 953,314 |
| data size | 3,586 bytes |
| data keccak256 | `0xb802153f8ac61914fb7bf2fc78d45972e5f545051d7b180c8df75ada13fed443` |
| expected CREATE address | `0xa80d8740f378989F649ca14C54e4B4a42E68753c` (currently empty) |
| fee estimate | 0.01466638 BOT (buffered 0.01906628 BOT) |

## Predicted genesis state

Zero recorded activities, unpaused, attestations pausable, canonical
`uint256 sourceLogIndex`, `activityId = keccak256(abi.encode(sourceChainId,
sourceTxHash, sourceLogIndex, actionType))` with `DuplicateActivity` protection,
no FLOW custody, no reward authority, no economic execution authority.

## Verification package readiness

Blockscout v2 Standard JSON — the exact route that publicly verified Router V4
and Router Lens. Package ready with the frozen settings above and MIT license.
A repeat of the demonstrated explorer edge rejection is classified
`EXPLORER_TRANSPORT_BLOCKED` with the package preserved verbatim; a genuine
source/runtime/compiler mismatch is a hard stop.

Router v3 remains the live production router. Stage E (Staking v2 trio) is next
and separately authorized.
