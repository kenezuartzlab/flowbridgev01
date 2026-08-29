# FlowBridge V30.1E.6 — Explorer-Blocked Parallel Deployment Gate + Stage B Preflight

## Verdict: FLOWBRIDGE V30.1E STAGE B PREFLIGHT PASS — APPROVED, NOT BROADCAST

Zero public writes in this gate: no deployment, no signature, no Safe
transaction, no funding, no role grant, no approval on chain. Every observation
below is a read-only JSON-RPC call against BOT Mainnet 677 at block 21,317,120.

## 1. FlowToken release status (accepted, source still pending)

| Field | Value |
| --- | --- |
| Address | `0x535ddda826142ac42ce288154e9595f080940ae9` |
| Status | `DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING` (not `DEPLOYED_VERIFIED`) |
| Runtime parity | `PROVEN_MODULO_IMMUTABLES` (131 bytes, all EIP-712 immutable slots) |
| Supply | 1,000,000,000 FLOW, 100% held by Treasury Safe `0xeFc1…9Ea4` (re-read live) |
| Explorer | `EXPLORER_TRANSPORT_BLOCKED` — Cloudflare/request-size rejection, never treated as source mismatch |
| Verification bundles | frozen, unchanged: `contracts/production/stage-a-verification/**` |

FlowToken is not redeployed and its compiler configuration is unchanged. It is
promoted to `DEPLOYED_VERIFIED` only when public explorer verification succeeds,
without any redeployment.

## 2. Progression rule now in force

Public source publication is a **release-completion** blocker, not a blocker to
deploying the next unfunded contract, provided the settled stage has proven
on-chain parity plus a frozen verification bundle. Encoded in
`src/lib/deploy/stageBDeployer.ts` (`FLOW_TOKEN_RELEASE_STATUS`,
`EXPLORER_BLOCK_CLASSIFICATION`).

- Stage B may deploy after a fresh preflight plus explicit owner approval.
- Every deployed contract still attempts Hardhat, then Standard-JSON verification immediately after settlement.
- `EXPLORER_TRANSPORT_BLOCKED` keeps a contract `SOURCE_PENDING` and preserves its bundle.
- `VERIFICATION_MISMATCH` (bytecode/constructor/compiler/source) remains a hard STOP and is not eligible for this exception.
- Economic activation stays blocked while `SOURCE_PENDING`: no rewards funding, no staking funding, no reward roots, no staking product enablement, no Router V4 traffic migration (v3 keeps production traffic), no production attestations.

## 3. Stage B artifact rebuild (frozen parity)

`FlowRewardsMerkleDistributor` rebuilt twice from clean compiler state on its own
frozen build line — solc `0.8.24+commit.e11b9ed9`, optimizer runs 200, viaIR,
`cancun`, OpenZeppelin 5.6.1 — and reproduced byte-identically.

| Hash | Rebuilt | Frozen V30.1E.1 | Match |
| --- | --- | --- | --- |
| source sha256 | `cbf90ce714…0bec0d43` | same | ✓ |
| creation sha256 | `21c96796f0…d5157581` | same | ✓ |
| runtime sha256 | `a708b596b8…fca40d367` | same | ✓ |
| normalized ABI sha256 | `821333ca4a…e4783fa79` | same | ✓ |

creation 7,181 bytes · runtime 5,861 bytes (EIP-170 within limit) · double build `REPRODUCIBLE`.

## 4. Constructor binding (exact, from the frozen manifest)

| Argument | Value | Authority |
| --- | --- | --- |
| `token_` | `0x535ddda826142ac42ce288154e9595f080940ae9` | settled Stage A FlowToken (3,539-byte runtime confirmed live) |
| `admin_` | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` | Governance Safe |
| `budgetManager_` | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` | Governance Safe |
| `publisher_` | `0x971E7790FE6C8F77dc666Bb05D4aedA362653f94` | Root Publisher |
| `pauser_` | `0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF` | Operations Safe |
| `recoveryRecipient_` | `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` | Treasury Safe |
| `minPublishDelay_` | `86400` | frozen 24h root delay |

Initial state at deployment: `campaignBudget = 0`, `totalReserved = 0`,
`totalClaimed = 0`, FLOW funding `0`, zero published roots. The contract has no
mint path and cannot move FLOW it does not hold.

## 5. Live revalidation (read-only, block 21,317,120)

| Check | Observed | Result |
| --- | --- | --- |
| `eth_chainId` | `0x2a5` = 677 | PASS |
| deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`, code `0x` | EOA PASS |
| nonce | 1 (Stage A consumed nonce 0; no other broadcast since) | PASS |
| balance | 2.4811451 BOT | covers 1,522,268 gas +30% at 20 gwei (0.039579 BOT) PASS |
| gas price | 20 gwei | unchanged PASS |
| FlowToken | code present, 3,539 bytes | PASS |
| total supply / Treasury balance | 1,000,000,000 FLOW / 1,000,000,000 FLOW | PASS |
| Safes | Treasury, Governance, Operations — 3 owners, threshold 2 | VERIFIED |
| candidate digest | `fnv1a64:19671fd13a81be19` | unchanged PASS |
| decision manifest | `fnv1a64:9972234982dbe76f` | unchanged PASS |

## 6. Unsigned Stage B review (nothing signed)

| Field | Value |
| --- | --- |
| chainId | 677 |
| from | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` |
| to | `null` (contract creation) |
| value | 0 |
| nonce | 1 |
| type | legacy |
| gasPrice | 20 gwei |
| gasEstimate / gasLimit | 1,522,268 / 1,978,948 (estimate +30%) |
| data | 7,405 bytes (7,181 creation + 224 encoded args) |
| data keccak256 | `0xddf141657b99ecdcbe0f21744d64df213efd2d81ba070453422e2ef4facc3e01` |
| data sha256 | `0x1187777125e430ed65ad3fc66ab9c8810d52bcee5e96c36672ed3da55548344e` |
| estimated fee | 0.030445 BOT (0.039579 BOT buffered) |

A one-time Stage B approval is bound to exactly this artifact creation hash,
constructor-args hash, deployer and chain (`buildStageBApproval()`); it
authorizes no funding, no root publication and no later stage.

**Owner approval: NOT RECORDED. Stage B: NOT BROADCAST.**

## 7. Final V30.1E PASS rule

V30.1E cannot receive final PASS while any required production contract remains
publicly `SOURCE_PENDING`. Explorer operator delay postpones final PASS but does
not idle safe deployment work. Funding and feature activation remain separate,
stricter gates.

## 8. Artifacts added

- `src/lib/deploy/stageBDeployer.ts` — Stage B preflight evaluation, frozen artifact identity, constructor binding, one-time approval builder, unsigned review.
- `src/lib/deploy/stageBDeployer.test.ts` — 10 tests (pass/blocked paths, drift, approval binding, unfunded review).
- `contracts/production/STAGE_B_PREFLIGHT.json` — full machine-readable preflight record.
