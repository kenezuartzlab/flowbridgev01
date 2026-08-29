# V30.1E Stage D — Activity Registry settlement (BOT Mainnet 677)

## Result

`FLOWBRIDGE V30.1E STAGE D SETTLED — ON-CHAIN VERIFIED, PUBLIC SOURCE PENDING`

| Item | Value |
| --- | --- |
| Contract | `FlowBridgeActivityRegistry` |
| Address | `0xa80d8740f378989F649ca14C54e4B4a42E68753c` |
| Tx | `0xd636a12677f0f68a47595501a792861ceb83b18fd1c3fc8d0b6d76e226bf3b76` |
| Block | 21,353,823 |
| Receipt | status 1 |
| Nonce / value | 4 / 0 BOT |
| Gas estimate / limit / used | 733,319 / 953,314 / 726,387 |
| Fee | 0.01452774 BOT @ 20 gwei |
| Runtime parity | `53a83eea…76b3e03b`, 2,713 bytes — EXACT_MATCH |

## Build-line note

`missingContractPackage` is only the frozen build-line identifier in
`PRODUCTION_BYTECODE.json`. During revalidation solc `0.8.20+commit.a1b79de6`
and OpenZeppelin `5.6.1` both resolved, the double build was reproducible, and
source/creation/runtime/ABI hashes matched the manifest exactly. No missing
compiler dependency exists.

## Pre-sign revalidation (block 21,353,819)

chain 677 · signer = approved deployer · nonce 4 · balance 2.32765498 BOT ·
candidate `fnv1a64:19671fd13a81be19` · manifest `fnv1a64:9972234982dbe76f` ·
creation sha256 match · constructor-args match · unsigned-data keccak
`0xb802153f…13fed443` match · expected CREATE address empty.

## Post-settlement verification

- Governance Safe `0x88a4…9507` holds `DEFAULT_ADMIN_ROLE`
- Activity Attester `0xfa3d…7e47` holds `ATTESTER_ROLE`
- Operations Safe `0x1ce0…59ef` holds `PAUSER_ROLE`
- Deployer holds no role; admin ≠ attester (neither direction)
- 0 activities, 0 `ActivityRecorded` events, `paused() == false`
- `computeActivityId` equals `keccak256(abi.encode(uint256, bytes32, uint256, bytes32))`;
  log index changes identity; `DuplicateActivity` guard present
- no payable functions, no receive/fallback, no transfer/withdraw/claim/mint
  surface — no token or reward custody, no economic authority
- no attestation, funding, Router registry change, Safe transaction, or any
  unrelated write

## Public source verification

Blockscout v2 standard-JSON submission was accepted ("verification started") but
the contract did not become verified. Classified `EXPLORER_TRANSPORT_BLOCKED`
and the exact bundle is preserved at
`contracts/production/stage-d-verification/`.

This is not a source/compiler/runtime mismatch: the on-chain runtime is
byte-identical to the frozen artifact. Recompiling the same sources and settings
as an explicit multi-source standard-JSON input reproduces the same length,
metadata hash and per-source hashes but a different `viaIR` jump-destination
layout, which the explorer verifier cannot match. Router V4 and Lens verified
publicly because they are single-file sources with no imports; FlowToken, the
Rewards Distributor and this Registry all import OpenZeppelin and share the same
explorer-side limitation.

Router v3 remains the live production router. Stage E remains unauthorized.
