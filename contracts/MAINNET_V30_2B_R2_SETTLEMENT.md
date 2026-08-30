# FlowBridge V30.2B R2 — Rewards Distributor Settlement (BOT Mainnet 677)

Status: **PASS — settled, runtime parity confirmed, publicly source verified**

## Transaction

| Field | Value |
| --- | --- |
| Tx hash | `0x4b119a48458db324eada60c9942827eaa57e698df39d38cea4009d3aac977115` |
| Block | 21,502,392 |
| Receipt | success |
| Contract | `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922` (matches expected CREATE) |
| Deployer / nonce | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` / 10 |
| Gas used / limit | 1,672,080 / 2,192,473 |
| Value | 0 BOT |

Pre-broadcast revalidation passed on chain 677: pending nonce 10, predicted address codeless,
deployment-data keccak `0xdc1124…f17c1366`, constructor-args keccak `0xa4d993…ed8b31`,
creation SHA-256 `b54e6071…b043f0f5`, compiler settings and all seven constructor values unchanged.
Only the stored frozen payload bytes were signed.

## Runtime parity

- Frozen runtime SHA-256: `0d240fe4af5ebb24d16cead6aacd8175dbf6620e516754bd26809be35fa24713` (6,629 bytes)
- On-chain runtime SHA-256: `8fe7fbc2aca7362bd0d8e83f915e594e1830b4e9563923d53b2110e906b02ab2` (6,629 bytes)
- Differences: exactly 100 bytes in five 20-byte ranges (1352, 1528, 2019, 3141, 4682) — the inlined
  reward-token immutable, zero in the frozen artifact and `0xcaaB50F3…917fF` on chain. No other byte differs.

## On-chain state

| Check | Result |
| --- | --- |
| `token()` | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` (verified V30.2B FLOW) |
| `minPublishDelay()` | 86,400 s (floor 3,600 / ceiling 604,800) |
| `totalReserved()` / `totalClaimed()` | 0 / 0 |
| `epochCount()` / `campaignBudget()` / `budgetRemaining()` | 0 / 0 / 0 |
| `freeBalance()` and FLOW balance | 0 |
| `recoveryRecipient()` | `0xeFc13d…29Ea4` (Treasury Safe) |
| `paused()` | false |
| `DEFAULT_ADMIN_ROLE` / `BUDGET_MANAGER_ROLE` | Governance Safe `0x88A4CC…9507` |
| `PUBLISHER_ROLE` | Root Publisher `0x971E77…3F94` |
| `PAUSER_ROLE` | Operations Safe `0x1Ce0b1…59eF` |
| Deployer roles | none (admin/budget/publisher/pauser all false) |
| Campaign / root / epoch | none exists |
| Recovery bound | limited to free (unreserved) balance; reserved obligations 0 |

## Public source verification

Verified on `scan.botchain.ai` at 2026-08-30T17:46:45Z — `is_verified: true`, `is_fully_verified: true`,
name `FlowRewardsMerkleDistributor`, compiler `v0.8.24+commit.e11b9ed9`, optimizer enabled / 200 runs,
EVM `cancun`, viaIR false, license MIT, method Solidity Standard-JSON input.

Package: `contracts/production/v30-2b-distributor/verification-standard-input.json`
(SHA-256 `8f6cfa587fd2125f63252f0e0e3a2a00036906579e44729ecfd5c137b254fb16`) — the frozen build with all
16 sources (vendored OpenZeppelin 5.6.1) inlined; it recompiles byte-identically to the frozen
creation and runtime bytecode. Cloudflare rejected the multipart Blockscout v2 upload, so the same
Standard-JSON package was submitted through the Etherscan-compatible endpoint (guid
`7b805b…6a946c52`, `Pass - Verified`).

## Scope guards

No FLOW transfer, no distributor funding, no campaign budget, no root or epoch publication,
no R3 deployment, no product activation. Old V30.1 economic contracts remain quarantined.
