# BOT Chain Bridge — Official Developer Reference

Canonical reference for wiring FlowBridge's cross-chain USDT transfers.
Source: https://dev-docs.botchain.ai/docs/Bridge/ (accessed 19 July 2026).
Full PDF: [`BOT_Chain_Bridge_Developer_Guide.pdf`](./BOT_Chain_Bridge_Developer_Guide.pdf).

> Always re-verify against live docs/contracts before deployment. Addresses
> and fees can change.

---

## 1. Networks

| Network          | Chain ID | USDT Standard |
| ---------------- | -------- | ------------- |
| BOT Chain (main) | 677      | USDT on BOT   |
| BOT Chain (test) | 968      | USDT (test)   |
| Ethereum         | 1        | ERC-20 USDT   |
| BNB Smart Chain  | 56       | BEP-20 USDT   |
| Tron             | Mainnet (non-EVM) | TRC-20 USDT |

Supported asset: **USDT only**. Tron is non-EVM — separate wallet/signing path.

---

## 2. Contract Addresses

### BOT Chain — Mainnet
| Contract      | Address |
| ------------- | ------- |
| BridgeRouter  | `0xef8DC669ECa13E612b67Ff09478352E85bD6CC53` |
| USDT          | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` |
| Multicall3    | `0x47FA21f684bBAD707A53a0f9BE59F1422F46C265` |

### BOT Chain — Testnet
| Contract      | Address |
| ------------- | ------- |
| BridgeRouter  | `0x6239404Aa276ba68486E2Fa40E90CDd36ff8ec3A` |
| USDT (test)   | `0x75edC9335175Fc0552D51D48439F229c10420fe3` |

### External BridgeGateway + USDT
| Network  | BridgeGateway | USDT |
| -------- | ------------- | ---- |
| Ethereum | `0x2945d3aF6f012e49f7421252b5fB57D1bb7E6Edd` | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| BSC      | `0x3cd6fB6b0CDdD3610f0f4769AA7Bb686Cd4a4b55` | `0x55d398326f99059fF775485246999027B3197955` |
| Tron     | `TGhXbQpjBgC6bDp5jAexzeQPHEXXsx5f35`        | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |

Shared USDT resource ID: `0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d`

---

## 3. Bridge Functions

| Function                | Purpose |
| ----------------------- | ------- |
| `deposit(...)`          | Standard cross-chain USDT transfer. |
| `depositWithBotGas(...)`| Bridge into BOT Chain and receive a small BOT allocation for gas; BOT cost deducted from USDT. |

For `depositWithBotGas`, UI must show BOT allocation, USDT deducted, and net USDT delivered before wallet confirmation.

---

## 4. Fees & Rules

| Direction        | Fee |
| ---------------- | --- |
| Into BOT Chain   | **0 USDT** (source gas still applies) |
| Out of BOT Chain | **0.1%, min 1 USDT** |

- Bridge-out formula: `fee = max(amount * 0.001, 1 USDT)`
- Recipient: `amount - fee`
- **Minimum transfer amount: > 10 USDT** (reject ≤ 10 in UI).

| Amount   | Fee | Recipient |
| -------- | --- | --------- |
| 11       | 1   | 10        |
| 500      | 1   | 499       |
| 1,000    | 1   | 999       |
| 10,000   | 10  | 9,990     |

---

## 5. Security Model

- **Lock & release** with native USDT vaults (no wrapped USDT).
- **Validators** attest to source-chain deposit events; **relayers** submit aggregated proofs; on-chain `BridgeValidator` enforces signature threshold.
- **Replay protection** via unique `transferId` (single-claim).
- **BOT Chain** = Physical Finality (near-instant). External chains wait for chain-specific confirmations.
- **Governance pause** available on BridgeRouter.

---

## 6. Implementation Checklist (FlowBridge relevance)

- Separate mainnet/testnet configs; default dev/QA to testnet.
- Validate connected chain + destination address format pre-submit.
- Read USDT decimals from the token contract.
- Approval and bridge submission are two txs — surface both.
- Persist tx hash immediately; track source confirmations → validator relay → destination release.
- Reject amounts ≤ 10 USDT; show fee separately from gas; show exact recipient amount.
- Handle Tron separately (non-EVM).
- Provide explorer links for both sides.
- Alert on paused router, failed relays, low liquidity, address changes.

---

## 7. Documentation Caveats

- Bridge landing page has an inconsistent chain-ID line; **detail page is authoritative**: 677 mainnet / 968 testnet.
- Exact external-chain confirmation counts and validator quorum are not published — read live contracts or ask the operator.
- Official docs footer may reference `bridge.bohr.life`; current ecosystem branding uses `botchain.ai`. Only use officially announced production URLs.

---

## 8. Source URLs

- Bridge index: https://dev-docs.botchain.ai/docs/Bridge/
- Introduction: https://dev-docs.botchain.ai/docs/Bridge/introduction/
- Supported chains: https://dev-docs.botchain.ai/docs/Bridge/supported-chains/
- Contract addresses: https://dev-docs.botchain.ai/docs/Bridge/contract-addresses/
- Core concepts: https://dev-docs.botchain.ai/docs/Bridge/core-concepts/
- Fees: https://dev-docs.botchain.ai/docs/Bridge/fees/
