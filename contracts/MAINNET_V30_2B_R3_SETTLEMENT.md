# FlowBridge V30.2B R3 — Activity Registry SETTLEMENT (BOT Mainnet 677)

Verdict: **PASS — deployed, byte-exact runtime parity, roles correct, registry empty, publicly source verified.**

## Transaction

| Field | Value |
| --- | --- |
| Tx hash | `0xcacba32e89d8ee54199950fce56979f7782978168e953377f883e7f9b6c13921` |
| Block / status | 21,505,671 / success |
| Deployer / nonce | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` / 11 |
| Deployed address | `0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814` (matches expected) |
| Gas used / limit | 803,671 / 1,054,582 |
| Value | 0 BOT |

Pre-signing revalidation passed on every frozen invariant: chain 677, pending nonce 11, predicted CREATE
address unchanged and codeless, source/creation/ABI hashes, constructor-args keccak
`0xbf9ffd…d01ba`, deployment-data keccak `0x355312…46ba5`, build matrix
(solc `v0.8.20+commit.a1b79de6`, optimizer runs 200, viaIR false, shanghai), byte-identical double build,
admin ≠ attester.

## Runtime parity

Deployed runtime SHA-256 `9f4b0026beb3b139065313193309605aa312d06343af34def8dd46b178b9df78`, 3,082 bytes —
**byte-exact** with the frozen build. The contract has no immutables, so there are no constructor-populated
substitutions.

## Authorities

| Role | Holder | Verified |
| --- | --- | --- |
| DEFAULT_ADMIN_ROLE | Governance Safe `0x88A4CC1F…9507` | yes |
| ATTESTER_ROLE | Activity Attester `0xfa3de5cf…7e47` | yes |
| PAUSER_ROLE | Operations Safe `0x1Ce0b1DF…59eF` | yes |

Deployer holds none of the three roles; admin does not hold ATTESTER_ROLE. The only events in the
deployment block are the three constructor `RoleGranted` logs.

## Initial state

- `ActivityRecorded` event count: **0** — registry is empty; no production activity was recorded.
- `paused` = `false` (Pausable default, the intended initial state); attestation capability exists but no
  attestation was performed or authorized in this gate.

## Public source verification

Verified on `scan.botchain.ai` from the frozen non-viaIR Standard-JSON package
(`standard-input.json`, SHA-256 `8ccef593…8976f`): `is_verified: true`, `is_fully_verified: true`,
name `FlowBridgeActivityRegistry`, compiler `v0.8.20+commit.a1b79de6`, optimizer runs 200, EVM shanghai,
MIT, verified at `2026-08-30T18:05:56Z`. This closes the provenance/layout problem — the old registry
`0xa80d8740…753c` (viaIR, runs 1, layout-divergent, unverifiable) stays quarantined and untouched.

## Scope

No production attestation, no role change, no funding or token transfer, no Router/Lens change, and **no R4
deployment**. Evidence: `contracts/production/V30_2B_R3_SETTLEMENT.json`.
