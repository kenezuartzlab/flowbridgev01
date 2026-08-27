# V30.1E.3 — Stage A Owner Authorization & Unsigned Transaction Handoff

**Status: AUTHORIZED — READY FOR EXTERNAL SIGNATURE (NOT YET BROADCAST)**

## Authorization

- Decision: **OWNER_AUTHORIZED** ("Authorized", 2026-08-27T23:33:00Z)
- Scope: **Stage A only — FlowToken deployment**
- Excludes: every later stage, any funding/transfer, any Safe transaction
- Signing model: **external wallet only** — no private key, seed, or keystore exists in this repo or in any server function. The owner signs and broadcasts from their own wallet.

## Preflight re-verified live at authorization (chain 677, block 21,186,479)

| Check | Result |
| --- | --- |
| eth_chainId | 0x2a5 = 677 ✓ |
| eth_getCode(deployer) | 0x (EOA) ✓ |
| Balance | 2.500000 BOT ✓ (required release envelope ≈ 0.56 BOT) |
| Nonce | 0 ✓ (matches unsigned review) |
| Gas price | 20 gwei (unchanged) ✓ |
| FlowToken creation rebuild | sha256 `200a6a55…2107a2` — byte-identical to V30.1E.1 evidence ✓ |

## Unsigned transaction (exact, sign as-is)

File: `contracts/production/STAGE_A_UNSIGNED_TX.json`

| Field | Value |
| --- | --- |
| chainId | 677 |
| from | 0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD |
| to | null (contract creation) |
| value | 0 |
| nonce | 0 |
| gasPrice | 20000000000 (20 gwei) |
| gasLimit | 1,236,812 (estimate 951,394 + 30%) |
| data | 5,916 bytes — frozen creation bytecode + constructor args |

Fingerprints (all re-verified byte-for-byte against the frozen V30.1E.2 review):

- creation bytecode sha256: `200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2`
- unsigned data keccak256: `0x9415ef65a40a2b1e6e61ac0a513b62bb1dcc3173ee07741ed2c6e096d55ae45f`
- unsigned data sha256: `0xceebd8d754c215812371d2ca6c3fd8d59c6ea21b15994a609fd765996f113a56`

## Effect on success

Deploys FlowToken ("FlowBridge", FLOW, 18 decimals) and mints the full fixed
supply of **1,000,000,000 FLOW** to the Treasury Safe
`0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` (2-of-3). Estimated fee
0.019028 BOT (0.024736 buffered).

## How to sign

Import `STAGE_A_UNSIGNED_TX.json` into any wallet/tooling that accepts an
unsigned transaction envelope (e.g. `eth_signTransaction` flow, or cast
`cast tx --json` style signing), verify the keccak256 of `data` matches the
fingerprint above, sign with the deployer key, and broadcast to chain 677.
After broadcast, return the transaction hash for Stage A settlement
verification (receipt status, contract address, runtime hash `f7be82e4…`,
and supply landing at the Treasury Safe).
