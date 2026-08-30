# FlowBridge V30.2B R4 — Staking Reward Treasury PREFLIGHT (BOT Mainnet 677)

Verdict: **PASS — clean Reward Treasury candidate ready, nothing signed, broadcast, or funded.**
Package: `contracts/production/v30-2b-treasury/` (sources, standard input, ABI, bytecode, args, scripts).

## Build matrix (read from frozen V30.2A candidate evidence, R4 entry — not inferred)

| Setting | Value |
| --- | --- |
| Compiler | `0.8.24+commit.e11b9ed9` (`v0.8.24+commit.e11b9ed9`) |
| Optimizer | enabled, runs 200 |
| viaIR | **false** — attempted and satisfied; compiles clean, no `Stack too deep` |
| EVM target | `cancun` |
| Metadata | `bytecodeHash: ipfs`, `appendCBOR: true` |
| OpenZeppelin | 5.6.1, vendored verbatim (14 source units) |
| Double build | two clean compiles, byte-identical creation/runtime/ABI; 0 warnings |

## Artifact hashes

| Item | Value |
| --- | --- |
| Source SHA-256 | `963ce367246ebc673e1d915202759a5159604dd0a794484b68500f921155d8a8` |
| Creation SHA-256 / size | `d3b676d3da8cc38247be64b9ab83dc49cc0675cc4e4b41dbd3a638611d518360` / 5,377 bytes |
| Runtime SHA-256 / size | `747a268c8740d24099594de823af2a10b9472f09d85f61da5a17a597f7a09cea` / 4,827 bytes |
| ABI SHA-256 | `3cfeefcdd459ca697e3f6f1891e3ffe9a325896f544d9b32a7358fabb115065a` |
| Standard-JSON SHA-256 | `99848d1f1aa7ab20f56acb61ee77447e8608af30b53e1a50fafb130b2656896a` |
| EIP-170 | within limit, 19,749 bytes headroom |

All five hashes equal the frozen V30.2A R4 evidence exactly — no source drift. The normalized ABI is
identical to the quarantined viaIR treasury (`0xA861152C…2d0e`), so the interface is unchanged while the
bytes are now produced by the reproducible non-viaIR pipeline.

## Constructor and initial role matrix

`constructor(address token_, address admin, address recoveryRecipient_)`

| Argument | Value |
| --- | --- |
| `token_` (reward token) | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` |
| `admin` (Governance Safe) | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` |
| `recoveryRecipient_` (Treasury Safe) | `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` |

Encoded args: `0x…caab50f3…917ff` + `…88a4cc1f…9507` + `…efc13d1a…9ea4`
Constructor-args keccak: `0x3223b853bc48ce8e0125684cdd6a0f5df2708ab38be759cbd4fcaa444ce63957`

| Role | Holder at deployment |
| --- | --- |
| `DEFAULT_ADMIN_ROLE` | Governance Safe `0x88A4CC1F…9507` |
| `VAULT_ROLE` | **UNASSIGNED** — the frozen constructor grants none |
| `CONTROLLER_ROLE` | **UNASSIGNED** — the frozen constructor grants none |
| Deployer | no role |

Exactly one role grant occurs in the constructor. No Vault or Controller operational authority exists
until a separate, separately authorized wiring gate.

## Reward-token proof (live read)

`0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` — name `FlowBridge`, symbol `FLOW`, decimals 18,
totalSupply 1,000,000,000 FLOW, 1,786 bytes of code: the verified V30.2B FLOW from R1. The binding is
`immutable`. The quarantined old FlowToken `0x535ddda8…40ae9`, old treasury `0xA861152C…2d0e`, and old
staking addresses appear nowhere in the source, constructor args, or full deployment payload.

## Accounting and safety invariants (unchanged source)

- Segregated reward reserve: holds reward inventory only; user principal stays in `FlowStakingVaultV2`
  and has no path into this contract.
- Buckets preserved verbatim: `reservedGenesis`, `reservedFloors`, `committedEpoch`, `accruedUnclaimed`.
- T1: `balanceOf(this) >= reservedGenesis + reservedFloors + committedEpoch + accruedUnclaimed`.
- T2: `recoverFree` moves only `freeBalance()` (balance minus total obligations) and only to the
  configured `recoveryRecipient` — reserved, committed, and accrued funds are unreachable. At genesis
  `freeBalance() == 0`, so recovery capacity is zero.
- Zero mint authority, zero user-principal custody, non-upgradeable (no proxy, initializer, delegatecall).

## Initial state (all zero)

FLOW balance 0 (no constructor transfer, funding path is pull-only `deposit`), `reservedGenesis` 0,
`reservedFloors` 0, `committedEpoch` 0, `accruedUnclaimed` 0, `totalObligations()` 0, `freeBalance()` 0.
The planned 10,000,000 FLOW inventory transfer was **not** performed in this gate.

## Unsigned payload + live read-only preflight

| Field | Value |
| --- | --- |
| Chain ID | 677 (`https://rpc.botchain.ai`), block 21,506,492 |
| Deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` (EOA) |
| Pending nonce | 12 |
| Balance / gas price | 2.12641586 BOT / 20 gwei |
| Predicted CREATE address | `0x96552909998F3DbAf5Ff4979dc158508b3442e65` — `eth_getCode` returns `0x` (codeless), FLOW balance 0 |
| Deployment data | 5,473 bytes, keccak `0x2de68bf07e8e1296421602ffd6c59063f8fec32eb99df3b41cb7779c3a569fad` |
| Value | 0 BOT |
| Gas estimate / +30% limit | 1,161,801 / 1,510,341 |

## Hard stops

None triggered: no source drift, no token mismatch, no unexpected role assignment, bytecode reproducible,
viaIR not required, recovery capacity zero, no old-token or old-staking dependency.

**Nothing was signed, broadcast, funded, reserved, or wired. R4 awaits explicit authorization.**
