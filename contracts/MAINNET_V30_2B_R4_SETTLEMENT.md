# FlowBridge V30.2B R4 — Staking Reward Treasury Settlement (BOT Mainnet 677)

Verdict: **PASS — DEPLOYED, PUBLICLY VERIFIED, UNFUNDED AND UNWIRED**

## Transaction

| Field | Value |
| --- | --- |
| Tx hash | `0xf90eb5c65d7bf64f77b2ce3bdce11ec5d07d1491822fa156e438c90222644b11` |
| Block | 21,506,932 |
| Status | success |
| Deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` (nonce 12) |
| Contract | `0x96552909998F3DbAf5Ff4979dc158508b3442e65` |
| Gas used / limit | 1,151,495 / 1,510,341 |
| Deployment-data keccak | `0x2de68bf07e8e1296421602ffd6c59063f8fec32eb99df3b41cb7779c3a569fad` |

Signed from the frozen stored payload only; calldata was never reconstructed from chat text.

## Build identity

solc `v0.8.24+commit.e11b9ed9`, optimizer enabled (200 runs), `viaIR: false`, EVM `cancun`,
OpenZeppelin 5.6.1 vendored, 14 source units, MIT.

Source `963ce367…55d8a8` · Creation `d3b676d3…518360` · ABI `3cfeefcd…115065a` · Standard JSON `99848d1f…56896a`.

## Runtime parity

Frozen runtime `747a268c…a09cea`; deployed runtime `42e7a42d…437e1d6b`. Byte lengths are identical (4,827)
and the only divergences are the six immutable slots that the constructor populates with the FLOW token
address `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` (zeroed in the pre-deployment artifact). No other
byte differs — parity is exact modulo constructor immutables.

## Verified on-chain state

- Reward token = verified V30.2B FLOW `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` (FLOW, 1B supply)
- Recovery recipient = Treasury Safe `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4`
- `DEFAULT_ADMIN_ROLE` held by Governance `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` only (1 RoleGranted event)
- `VAULT_ROLE` and `CONTROLLER_ROLE` unassigned; deployer holds no role
- FLOW balance 0; reservedGenesis / reservedFloors / committedEpoch / accruedUnclaimed all 0
- `totalObligations()` = 0; `freeBalance()` = 0 (recovery capacity bounded to zero)

## Public source verification

`https://scan.botchain.ai/address/0x96552909998F3DbAf5Ff4979dc158508b3442e65` —
`is_verified: true`, `is_fully_verified: true`, name `FlowStakingRewardTreasury`,
compiler `v0.8.24+commit.e11b9ed9`, optimizer 200, EVM cancun, MIT, 14 sources,
submitted via the frozen non-viaIR Standard-JSON package.

## Not performed

10M FLOW transfer, Vault/Controller role grants, any reservation/epoch/accrual/payout,
recovery-recipient change, R5 deployment. The old V30.1 treasury `0xA861152C…32d0e` remains quarantined.

Machine evidence: `contracts/production/V30_2B_R4_SETTLEMENT.json`.
