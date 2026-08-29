# FlowBridge V30.1E.7 — Stage B Managed Signing, Broadcast and Settlement

## Verdict: FLOWBRIDGE V30.1E STAGE B SETTLED — SOURCE PENDING (`EXPLORER_TRANSPORT_BLOCKED`)

Exactly **one** public write occurred in this gate: the reviewed
`FlowRewardsMerkleDistributor` creation transaction. Zero funding, zero FLOW
transfers, zero role grants, zero approvals, zero Safe transactions, zero root
publications, no Stage C work.

## 1. Pre-signing revalidation (any mismatch would have stopped the gate)

| Check | Observed | Result |
| --- | --- | --- |
| `eth_chainId` | 677 | PASS |
| deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`, code `0x` | EOA PASS |
| signer identity | protected secret derives to the approved deployer | PASS |
| nonce | 1 | PASS |
| balance / gas price | 2.4811451 BOT / 20 gwei | PASS |
| candidate digest | `fnv1a64:19671fd13a81be19` | unchanged PASS |
| decision manifest | `fnv1a64:9972234982dbe76f` | unchanged PASS |
| double build | byte-identical across two clean builds | REPRODUCIBLE |
| creation sha256 | `21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581` | matches frozen PASS |
| constructor-args hash | `6fb84b64d49e59f14266c8ce88c20b0fe40fd24a9fcff20aa5080884c936f65d` | matches approval PASS |
| unsigned data | 7,405 bytes, keccak `0xddf141657b99ecdcbe0f21744d64df213efd2d81ba070453422e2ef4facc3e01` | exact match PASS |
| FlowToken | code present, 3,539 bytes | PASS |

Revalidated at block 21,317,984, immediately before signing.

## 2. Transaction, block and address

| Field | Value |
| --- | --- |
| Tx hash | `0x289727efd8830a6b767a2be05cdd1dec6f70900ac98877f336c5242b775ad4da` |
| Block | 21,317,987 |
| Deployed address | `0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB` |
| Nonce / type | 1 / legacy |
| `to` / value | `null` (creation) / 0 BOT |

## 3. Receipt

| Field | Value |
| --- | --- |
| Status | `success` (1) |
| Gas used | 1,509,124 of 1,978,948 limit |
| Effective gas price | 20 gwei |
| Fee paid | 0.03018248 BOT |
| Logs | 6 (role grants emitted by the constructor only) |

## 4. On-chain runtime parity

On-chain runtime is 5,861 bytes, sha256
`419095319aa817e2f0e94327ab9aaddbfedd71017c90af41066e5849cc40ce9f`, versus the
frozen `a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367`.

Exactly **100 bytes differ, and every one lies inside the five
`immutableReferences` slots** solc reports for `IERC20 public immutable token`
(`[436,468] [1025,1057] [2908,2940] [3690,3722] [4799,4831]`), which the
constructor writes at deploy time. Verdict: `PROVEN_MODULO_IMMUTABLES`.

## 5. FlowToken binding

`token()` = `0x535dDDA826142AC42cE288154e9595f080940aE9` — exactly the Stage A
FlowToken. Live re-read: total supply 1,000,000,000 FLOW, Treasury Safe balance
1,000,000,000 FLOW (unchanged).

## 6-9. Authority and parameter invariants

| Invariant | On chain |
| --- | --- |
| `DEFAULT_ADMIN_ROLE` → Governance Safe `0x88A4…9507` | true |
| `DEFAULT_ADMIN_ROLE` → deployer | **false** |
| `BUDGET_MANAGER_ROLE` → Governance Safe | true |
| `PUBLISHER_ROLE` → Root Publisher `0x971E…3f94` | true |
| `PUBLISHER_ROLE` → deployer | **false** |
| `PAUSER_ROLE` → Operations Safe `0x1Ce0…59eF` | true |
| `recoveryRecipient` → Treasury Safe `0xeFc1…9Ea4` | true |
| `minPublishDelay` | 86400 |

## 10-12. Empty, unfunded, no epoch

`campaignBudget = 0`, `totalReserved = 0`, `totalClaimed = 0`,
`freeBalance = 0`, `epochCount = 0`, `paused = false`, and the distributor's
FLOW balance is **0**. No root and no epoch was published; no claim is possible.

## 13. Public source verification attempt (exact result)

Primary — Hardhat, Blockscout custom chain 677 (`apiURL https://scan.botchain.ai/api`):

```
Compiled 16 Solidity files successfully (evm target: cancun).
hardhat-verify found one or more errors during the verification process:

Etherscan:
A network request failed. This is an error from the block explorer, not Hardhat.
Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Secondary — Blockscout v2 `verification/via/standard-input` with the complete
16-source standard JSON (88,002 bytes): the same Cloudflare HTML challenge
(body-size rejection). Blockscout v1 `verifysourcecode` accepts a small
single-file body (`status 1`, guid `3824681c…6a924b36`) but cannot carry the 15
imported OpenZeppelin sources, so `checkverifystatus` returns
`Fail - Unable to verify`. Explorer public state: `is_verified: false`.

Classification: **`EXPLORER_TRANSPORT_BLOCKED`** — a transport rejection, not a
bytecode, constructor-argument, compiler or source mismatch. The exact package is
preserved at `contracts/production/stage-b-verification/` and reproduces the
frozen creation and runtime hashes byte-identically. No redeployment and no
compiler-setting change was made to force verification.

## 14. Accounting — nothing else happened

Deployer nonce went 1 → 2 (one transaction). Balance 2.4811451 → 2.45096262 BOT,
the exact fee. Funding transactions: 0. Role-grant transactions: 0. Approvals: 0.
Safe transactions: 0. FLOW transfers: 0. The Rewards Distributor was **not**
funded and Stage C was not started.

## 15. Release status

`FlowRewardsMerkleDistributor` = `DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING`,
same as `FlowToken`. Economic activation (rewards funding, root publication,
staking funding, product enablement, Router V4 traffic migration) remains
blocked, and final V30.1E PASS still requires public source publication for
both contracts.

## 16. Artifacts added

- `contracts/production/STAGE_B_DEPLOYMENT.json` — full machine-readable settlement.
- `contracts/production/stage-b-verification/` — preserved standard JSON input (16 sources) plus submission instructions.
- `src/lib/deploy/stageBSettlement.ts` + tests — settlement record and invariant assertions.
