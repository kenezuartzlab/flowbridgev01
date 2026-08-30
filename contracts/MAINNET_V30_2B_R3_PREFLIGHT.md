# FlowBridge V30.2B R3 — Activity Registry PREFLIGHT (BOT Mainnet 677)

Verdict: **PASS — clean registry candidate ready, nothing signed or broadcast.**
Package: `contracts/production/v30-2b-registry/` (manifest, standard input, ABI, bytecode, args, scripts).

## Build matrix (read from frozen V30.2A candidate evidence, R3 entry — not inferred)

| Setting | Value |
| --- | --- |
| Compiler | `0.8.20+commit.a1b79de6` (`v0.8.20+commit.a1b79de6`) |
| Optimizer | enabled, runs 200 |
| viaIR | **false** (not required; compiles clean) |
| EVM target | `shanghai` |
| Metadata | `bytecodeHash: ipfs`, `appendCBOR: true` |
| OpenZeppelin | 5.6.1, vendored verbatim (7 source units) |
| Double build | two clean compiles, byte-identical; 0 warnings |

## Artifact hashes

| Item | Value |
| --- | --- |
| Source SHA-256 | `2735de22c1f59a4c7ba7c4c66a2944b03db19aa3c76d670d0ef9a20ff5aeca6e` |
| Creation SHA-256 / size | `cc61be5fadf4fd164a6c996e3f30874197702795c8ebe99c70124e85f0d0037e` / 3,661 bytes |
| Runtime SHA-256 / size | `9f4b0026beb3b139065313193309605aa312d06343af34def8dd46b178b9df78` / 3,082 bytes |
| ABI SHA-256 | `e021c7402ce241fe89624df8c395b30347b82bdac888758530e4bfe597a8978d` |
| Standard-JSON SHA-256 | `8ccef59346968e5d800f237ca0deecd9ea51970f0c90b7bbb88c1a4ce4b8976f` |
| EIP-170 | within limit, 21,494 bytes headroom |

All five hashes equal the frozen V30.2A R3 evidence exactly — no source drift.

## Provenance / layout closure

- Old registry `0xa80d8740f378989F649ca14C54e4B4a42E68753c` was built with `viaIR: true`, optimizer runs 1
  (runtime `53a83eea…b3e03b`). No published solc 0.8.20 build reproduces those bytes — local rebuilds from
  the same sources and settings yield `c164c24b…377aa6`, so explorer verification is impossible for it.
  It stays **quarantined and is not promoted**.
- The replacement uses the reproducible non-viaIR pipeline with runs 200 (21 KB of size headroom makes
  runs 1 unnecessary; runs 1 existed only to protect Router V4). Two clean compiles are byte-identical and
  match the frozen hashes, and the normalized ABI is identical to the old deployment — same interface,
  reproducible bytes.

## Constructor / authorities

| Argument | Value |
| --- | --- |
| `admin` (Governance Safe) | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` |
| `attester` (Activity Attester) | `0xfa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e47` |
| `pauser` (Operations Safe) | `0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF` |

Admin ≠ attester (constructor reverts `AdminAttesterMustDiffer` otherwise). Deployer receives no role.
Constructor-args hash (keccak): `0xbf9ffd3a7d092cacdc704d5d1399a0629c3a1dfb6d22a0fe247259e6c3ed01ba`.

## Safety invariants

- Activity ID encoding preserved verbatim: `keccak256(abi.encode(sourceChainId, sourceTxHash, sourceLogIndex, actionType))`.
- Evidence semantics preserved: append-only, `DuplicateActivity` on replay, `getActivity` / `isRecorded` reads unchanged.
- Zero token custody (no `IERC20`, no transfer path, no `payable`), zero reward-moving authority, zero mint authority.
- Non-upgradeable: no proxy, no initializer, no `delegatecall`.
- Write surface only: `recordActivity` (ATTESTER_ROLE), `pause`/`unpause` (PAUSER_ROLE), role admin (DEFAULT_ADMIN_ROLE).
- Registry begins **empty**; no production attestation was written in this gate.

## Unsigned payload + live read-only preflight

| Field | Value |
| --- | --- |
| Chain ID | 677 (`https://rpc.botchain.ai`), block 21,504,805 |
| Deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` |
| Pending nonce | 11 |
| Balance / gas price | 2.14248928 BOT / 20 gwei |
| Predicted CREATE address | `0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814` — `eth_getCode` returns `0x` (codeless) |
| Deployment data | 3,757 bytes, keccak `0x35531219108b86eac22474e3760b4a41ae7d45eccf36521eec5b21f243446ba5` |
| Value | 0 BOT |
| Gas estimate / +30% limit | 811,217 / 1,054,582 |

## Hard stops

None triggered: no source drift, bytecode reproducible, roles match, admin ≠ attester, no token/reward/mint
authority, target address codeless, viaIR not required.

**Nothing was signed, broadcast, funded, attested, or wired. R3 awaits explicit authorization.**
