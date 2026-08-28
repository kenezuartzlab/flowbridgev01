# FlowBridge V30.1E.4 — Stage A Broadcast and Settlement (BOT Mainnet 677)

**Verdict: STAGE A SETTLED — FLOWTOKEN LIVE ON BOT MAINNET 677. STOPPED BEFORE STAGE B.**

## 1. Signer

The protected server-side deployer secret was used. Its derived address is
`0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` — an exact match for the approved
Stage A deployer. No key material is written to the repository or logs.

## 2. Pre-broadcast revalidation (block 21,188,992)

| Check | Result |
| --- | --- |
| `eth_chainId` = 677 | PASS |
| Signer == approved deployer | PASS |
| Deployer is an EOA (`eth_getCode` = `0x`) | PASS |
| Nonce | 0 — PASS |
| Balance | 2.500000 BOT — PASS |
| Gas price | 20 gwei (unchanged) |
| Candidate digest / decision manifest | unchanged — PASS |
| FlowToken creation sha256 | `200a6a55…2107a2` — PASS |
| Unsigned data keccak256 | `0x9415ef65…ae45f` — **exact match** |
| Unsigned data sha256 / size | `0xceebd8d7…13a56` / 5,916 bytes — PASS |

## 3. Broadcast (Stage A only)

| Field | Value |
| --- | --- |
| Tx hash | `0xa96c2b788b17f9a492bff10f0a002618ed69cb970f7dcc97784ef8330dcb1517` |
| Block | 21,189,014 |
| Status | success |
| Gas used | 942,745 of 1,236,812 |
| Effective gas price | 20 gwei |
| Fee paid | 0.0188549 BOT |
| Contract address | `0x535ddda826142ac42ce288154e9595f080940ae9` |

## 4. Automatic settlement verification

- **Runtime bytecode**: 3,539 bytes on chain, exactly the frozen runtime length.
- **Runtime hash**: on-chain sha256 `7f1e5cf1…c3579e`; frozen `f7be82e4…226edf`.
  Recompiling `contracts/FlowToken.sol` (solc `0.8.24+commit.e11b9ed9`,
  optimizer 200 runs, viaIR, evmVersion cancun, OpenZeppelin 5.6.1) reproduces
  the frozen creation **and** runtime hashes byte-identically. The on-chain code
  differs in exactly **131 bytes, all of which fall inside the compiler-reported
  EIP-712 immutable slots** (cached this-address, chain id, domain separator,
  hashed name/version) written by the constructor. Verdict:
  **RUNTIME PARITY PROVEN MODULO IMMUTABLES** — the expected and only permissible
  deviation class for an immutable-bearing contract.
- **Supply**: `totalSupply()` = 1,000,000,000 FLOW (18 decimals) — exact.
- **Treasury balance**: `balanceOf(0xeFc1…9Ea4)` = 1,000,000,000 FLOW — the
  Treasury Safe holds the entire supply; one mint `Transfer` log in the receipt.
- **Constructor invariants**: `name()` = `FlowBridge`, `symbol()` = `FLOW`,
  `decimals()` = 18 — all match the authorized review.

## 5. Public source verification (`scan.botchain.ai`)

Submission is **blocked by the explorer edge**: both the Blockscout v2
(`/api/v2/smart-contracts/{address}/verification/via/standard-input`) and v1
(`?module=contract&action=verifysourcecode`) endpoints return HTTP 403 from a
Cloudflare challenge for programmatic requests. The exact, hash-reproducing
Standard-JSON bundle plus the ABI-encoded constructor args are committed at
`contracts/production/stage-a-verification/` for a single browser submission.
This is the only open Stage A item; it does not affect on-chain correctness.

## 6. Stage B

**NOT STARTED.** No further deployment, funding, transfer or Safe transaction
was prepared or broadcast.
