# Owner decision summary — V1.16 direct-EOA governance exception

**Status: OWNER_DIRECT_EOA_CHOICE_RECORDED / OWNER_EOA_EXCEPTION_PROPOSED / LAUNCH HOLD.**

| Decision | Current record | Still required |
|---|---|---|
| D-01 quote trust | **OPEN.** User-approved `minNetOut`; no signed server quote trust root selected. | Confirm quote trust and acknowledge caller-provided snapshot/MEV limits. |
| D-02 Guardian | **DIRECT EOA PREFERENCE SELECTED:** `0x351E236a636c8be4Fa0B602cb096d72346D1a412`. | Separate explicit acknowledgment of all single-key/immutable risks; refreshed two-RPC final-preparation evidence; separately authorized control verification and deployment gate. |
| D-03 Treasury/rate | **DIRECT EOA RECIPIENT SELECTED:** `0xb7322660B40561ae7C224F963e51583e923F7fC8`. **FEE BPS UNSELECTED.** | Select 0/5/10 bps, consent to actual payable configuration, establish issuer/transfer eligibility and refresh evidence. |
| D-04 freshness/slippage | **OPEN.** Existing 30-second/100-block review bounds and user floor remain candidate rules. | Confirm final freshness, size and slippage policy after wallet/device acceptance. |
| D-05 WalletConnect | **OPEN.** Installed vulnerable transitive Zod remains; WalletConnect globally OFF. | Owner decision on removal/upstream fix; advisory remains OPEN. |

The preferred governance standard remains separate BNB56 Safe multisigs, preferably 2-of-3. `assessSafePolicy` and the Safe readiness path were not relaxed. The direct-EOA exception is exact-address-only and cannot configure roles, select fees, bypass human review, suppress Slither findings or authorize deployment.

Current shared gates: six Slither HIGH OPEN; zero substantive signed human reviews; physical devices UNVERIFIED; WalletConnect/Zod HIGH OPEN; `BNB_EXECUTION_ENABLED=false`; `LAUNCH_HOLD=true`; `launchGate.go=false`. No mainnet deployment, contract write, signature, funding, fee activation, production publication or BNB/RWA execution is authorized by this record.
