# FlowBridge V30.2A R1 — New FlowToken Settlement

**Verdict: FLOWBRIDGE V30.2A R1 NEW FLOWTOKEN SETTLED — ON-CHAIN PASS, PUBLIC SOURCE VERIFICATION PENDING**

Evidence: `contracts/production/V30_2A_R1_SETTLEMENT.json`.

## 1. Pre-sign revalidation (immediately before signing)

Calldata was NOT reconstructed from chat. It was rebuilt from the frozen non-viaIR
Standard-JSON input and matched every approved hash before signing:

| Check | Result |
| --- | --- |
| standard-input sha256 | `d8188e02…d73590` match |
| double build | byte-identical |
| creation sha256 | `f15c4875…7258d5` match |
| constructor-args sha256 | `06b40677…3b631a` match |
| unsigned-data keccak | `0xa2f4737d…46e423e` match |
| candidate digest | `fnv1a64:e0ac31b5bb297880` match |
| deployer nonce | 8 |
| expected address code | `0x` (codeless) |
| signer | equals `0x8512…f3dD` |

## 2. Transaction

- tx `0xcafe321d1ec270518ab6e69ccd8ed5af209738da183456c392439a0946b5c0c6`
- status **success**, block 21,472,677, gasUsed 985,911 of limit 1,293,373, value 0 BOT
- contract **`0x123E64D074FD5d66DBd4BD62Dc4e71da7101DB63`** — matches expected CREATE address

## 3. Runtime parity

On-chain runtime is 3,760 bytes. 131 bytes differ from the compiled artifact, and all of
them fall inside constructor-populated ERC20Permit/EIP712 immutable slots (cached address
`0x123e64…db63`, cached chainId `0x02a5` = 677, cached domain separator, hashed name and
version, literal `FlowBridge` / `1`). Every non-immutable byte is identical to the approved
build — parity **MATCH_MODULO_EIP712_IMMUTABLES**.

## 4. Token state

`FlowBridge` / `FLOW`, 18 decimals, totalSupply 1,000,000,000 FLOW, entire supply held by
Treasury Safe `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4`.

## 5. Public source verification — PENDING

Submission to `https://scan.botchain.ai/api/v2/smart-contracts/<addr>/verification/via/standard-input`
was attempted twice and returned **HTTP 403 (Cloudflare)** from this environment; explorer
GET works and reports `is_verified: null`. The verification package is preserved verbatim:

- Standard JSON: `contracts/production/v30-2a-candidate/standard-inputs/FlowToken.standard-input.json`
- compiler `v0.8.24+commit.e11b9ed9`, optimizer on / runs 200, viaIR **false**, evm cancun
- contract `FlowToken.sol:FlowToken`, license MIT
- constructor args (ABI hex) as recorded in the settlement JSON

## 6. Gate status

receipt success ✅ → expected address ✅ → runtime parity ✅ → 1B FLOW in Treasury Safe ✅ →
public source VERIFIED ❌ (pending).

R1 therefore does not yet pass in full. Old FlowToken `0x535dDDA8…40aE9` remains
`DEPRECATED_PENDING_REPLACEMENT` and untouched; Router stack untouched.
**R2 is not prepared and stays blocked until R1 is publicly source verified.**
