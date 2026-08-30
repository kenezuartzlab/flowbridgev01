# FlowBridge V30.2B R2 — Rewards Distributor Preflight (NOT SIGNED, NOT BROADCAST)

Replacement production `FlowRewardsMerkleDistributor` for BOT Mainnet 677, bound
exclusively to the V30.2B FlowToken. Read-only preflight only: nothing was
signed, broadcast, funded or activated.

Frozen workspace: `contracts/production/v30-2b-distributor/`
(`sources/`, `standard-input.json`, `abi.json`, `creation-bytecode.txt`,
`constructor-args.txt`, `constructor-args.js`, `unsigned-deployment-data.txt`,
`MANIFEST.json`, `SHA256SUMS.txt`).

## 1. Build policy (as required, no deviation)

| Setting | Value |
| --- | --- |
| solc | `0.8.24+commit.e11b9ed9` |
| optimizer | enabled, runs 200 |
| viaIR | **false** (no stack-too-deep; viaIR NOT required) |
| EVM version | cancun |
| metadata | bytecodeHash `ipfs`, appendCBOR `true` |
| OpenZeppelin | 5.6.1, vendored frozen copies (no npm refetch) |

Compiled twice cleanly from the identical input: creation bytecode, runtime
bytecode and ABI are **byte-identical** across both builds.

## 2. Artifact identity

| Item | Value |
| --- | --- |
| Source SHA-256 | `cbf90ce714c2c6ca6df9b55637a2a671e820da6a2a0404d7813590450bec0d43` |
| Creation SHA-256 | `b54e6071d7859265dbf12999f6804f5f5f26af759104aea5a2cb85a8b043f0f5` |
| Creation bytes | 7,684 |
| Runtime SHA-256 | `0d240fe4af5ebb24d16cead6aacd8175dbf6620e516754bd26809be35fa24713` |
| Runtime bytes | 6,629 (EIP-170 limit 24,576 — compliant) |
| ABI SHA-256 | `821333ca4a60c6c2ce6354835a95066b3f94c74acf2a657712646ea4e783fa79` |
| Standard-JSON SHA-256 | `bdfc4f689de0b2ee42d51421e31877e36d99b1e18eb4c44991b6674ec2cec091` |

Source SHA-256 and ABI SHA-256 equal the previously reviewed V30.1E.1
distributor evidence, i.e. **zero source drift and identical external
interface**. Creation/runtime hashes differ from the V30.1E artifact only
because that build used `viaIR: true`; this build is the required non-viaIR
compilation of the same reviewed source.

## 3. Standard-JSON verification package

`contracts/production/v30-2b-distributor/standard-input.json` — single entry
source (`FlowRewardsMerkleDistributor.sol`) with all 15 OpenZeppelin 5.6.1
dependencies resolved from the frozen vendored tree, and the exact settings in
section 1. Use it verbatim on `scan.botchain.ai` (Solidity Standard-JSON-Input)
with the ABI-encoded constructor arguments from `constructor-args.txt`.

## 4. Constructor arguments (human-readable)

| Argument | Value | Role |
| --- | --- | --- |
| `token_` | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` | V30.2B FlowToken (reward token) |
| `admin_` | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` | Governance Safe (DEFAULT_ADMIN_ROLE) |
| `budgetManager_` | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` | Governance Safe (BUDGET_MANAGER_ROLE) |
| `publisher_` | `0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94` | Root Publisher (PUBLISHER_ROLE) |
| `pauser_` | `0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF` | Operations Safe (PAUSER_ROLE) |
| `recoveryRecipient_` | `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` | Treasury Safe (only recovery destination) |
| `minPublishDelay_` | `86400` | 24-hour reward-root activation delay |

- ABI-encoded args: see `constructor-args.txt`
- Constructor-args keccak-256: `0xa4d993b870d7f3ca9be280d13c2c636cf7bffbaebc512962c641392038ed8b31`

Roles are identical to the previously approved authority model; only `token_`
changes, to the V30.2B FlowToken.

## 5. Live chain observations (read-only, `https://rpc.botchain.ai`)

| Item | Value |
| --- | --- |
| Chain ID | 677 |
| Block | 21,501,867 |
| Deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` (EOA, code `0x`) |
| Pending nonce | 10 |
| Balance | 2.17593088 BOT |
| Predicted CREATE address | `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922` |
| Predicted address code | `0x` (codeless — no collision) |
| Gas estimate | 1,686,518 |
| Buffered gas limit (+30%) | 2,192,473 |
| Gas price | 20 gwei (≈0.0439 BOT buffered cost — covered) |
| Deployment data | 7,908 bytes |
| Deployment-data keccak-256 | `0xdc112416d0f2366133b65ac6ddc52a7c25c1302ba2dd5ea0786338e0f17c1366` |

## 6. Reward-token binding confirmation

Live reads of `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`: runtime 1,786 bytes,
`name() = FlowBridge`, `symbol() = FLOW`, `decimals() = 18`,
`totalSupply() = 1,000,000,000 FLOW`. This is the settled, publicly verified
V30.2B FlowToken. The old quarantined FlowToken addresses appear nowhere in
this candidate.

## 7. Architecture preserved (unchanged reviewed source)

- Budgeted Merkle/epoch distributor; pre-funded rewards only.
- `publishEpoch` reverts unless `balance >= totalReserved + allocation` and
  `totalClaimed + totalReserved + allocation <= campaignBudget` — reserved
  obligations cannot become insolvent.
- No mint authority; the contract can only move FLOW it already holds.
- No cumulative EIP-712 entitlement path.
- `recoverFree` bounded by `freeBalance`, destination fixed to the Treasury Safe.
- Claims are leaf-committed, bitmap-replay-protected and `nonReentrant`.
- 24-hour root activation delay frozen via `minPublishDelay_ = 86,400`.
- Nothing was removed or weakened to reduce explorer payload size.

## 8. Economic state at deployment

Initial funding **0 FLOW**, initial reserved obligations **0**, campaign budget
**0**, epochs published **0**, no root publication, no staking or product
activation. Deployment alone grants no economic authority.

## 9. Verdict

**R2 PREFLIGHT PASS — NOT SIGNED, NOT BROADCAST.** No hard-stop condition
triggered: compiler succeeded, no source drift, roles match, token matches,
bytecode reproducible, predicted address codeless, viaIR not required.
Awaiting explicit owner authorization before any signing.
