# FlowBridge MultiSend V1 — BOT Chain Testnet Acceptance Report

Contract `0x535dDDA826142AC42cE288154e9595f080940aE9` · chain 968 · fee 1 bps (0.01%) ·
recipient cap 100 · paused false · fee recipient `0x628e237b73C5a37EF3968527563FA1a26b32BB97` ·
owner `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`.

No BOT Mainnet, BNB Mainnet or BNB Testnet deployment was performed. No contract safety rule was
weakened at any point.

## Gate results

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | Native rehearsals remain green (Distribute / Consolidate / Advanced, exact credit, 0 custody) | PASS | `release/bot-testnet-rehearsal-native.json` |
| 2 | ERC-20 rehearsal — all three modes, exact amounts, fee in the transferred token, exact allowance, zero residual allowance, zero contract custody | PASS | `release/bot-testnet-rehearsal-erc20.json` (4 positive flows) |
| 3 | ERC-20 negative paths — insufficient allowance, insufficient token balance, MAX+1, expired deadline, fee/config changed, zero/self recipient, zero amount, length mismatch, empty batch, >100 recipients, non-token address, unauthorized admin calls | PASS | `release/bot-testnet-rehearsal-erc20.json` (17 rejections) |
| 4 | Adversarial contract suite — zero address, zero amount, over-cap, reverting recipient rollback, fee-on-transfer token, non-standard ERC-20, reentrancy, unauthorized config/pause/rescue, two-step ownership, renounce disabled | PASS | 41/41 forge tests (`test/FlowBridgeMultiSend.t.sol`, `test/FlowBridgeMultiSendAdversarial.t.sol`) |
| 5 | Live pause behaviour — batches rejected while paused, accepted after unpause, state restored | PASS | `release/bot-testnet-pause-acceptance.json` |
| 6 | Three primary modes present in the interface | PASS | `/multisend` renders Distribute, Consolidate, Advanced |
| 7 | Recipient input — manual entry, paste list, spreadsheet paste, CSV import, camera QR scan, uploaded QR image; QR only parses an address and never initiates, approves, signs or sends | PASS | `src/lib/multisend/csv.ts`, `qr.ts` (+14 unit tests), `QrScanButton.tsx` (scan and "Upload QR image", result feeds an input field only) |
| 8 | Amount controls — same amount, equal split, custom amounts, percentage of balance, MAX with protected native gas reserve plus service fee | PASS | `planner.ts` (`quotePercentRecipientsTotal`, `spendableBalance`, `equalSplit`) + 14 planner tests |
| 9 | Multi-wallet authorization — grouped by source wallet, explicit signing queue, never a single-transaction claim, shared `clientBatchId`, pending / confirmed / failed / cancelled / partial completion / resume, no private keys requested or stored | PASS | `session.ts` (+6 tests), signing queue in `MultiSendWorkspace.tsx` |
| 10 | Review screen — network, mode, token, source wallet count, recipient count, recipients receive, FlowBridge fee, current fee %, estimated network gas, total required per source, remaining balance after transfer; fee and gas always separate | PASS | Review block in `MultiSendWorkspace.tsx` (per-source gas estimate via `estimateContractGas`, balance-after row) |
| 11 | Fee-lock — fee/config re-read as fresh chain state before every signature, refreshed review required on change | PASS | `signSource` staleness check; contract rejects stale `expectedFeeBps` / `expectedConfigNonce` |
| 12 | Grouped receipt and Activity — one session with mode, `clientBatchId`, network, token, source wallets, recipients, amount, fee, each transaction hash and status, total confirmed | PASS | `MultiSendSessionsPanel.tsx` on `/activity`; CSV receipt export in `csv.ts` |
| 13 | Explorer verification bundle — compiler, optimizer, EVM target, constructor args, source, creation and runtime bytecode, ABI, deployment tx, address; published source reproduces deployed bytecode | PASS (reproduction) / PENDING (explorer submission) | `release/bot-testnet-source-reproduction.json`: exact runtime match, solc v0.8.20+commit.a1b79de6, optimizer on/200, viaIR, shanghai |
| 14 | Network gating — BOT Testnet enabled on the verified address; BOT Mainnet, BNB Mainnet, BNB Testnet and every other chain locked; no cross-chain address fallback; fail closed without an approved deployment | PASS | `deployments.ts` (only chain 968 has an address); `/multisend` shows LIVE on testnet and SOON elsewhere |
| 15 | Mainnet gate — no BOT Mainnet deployment performed | PASS (held) | Deployment inventory unchanged for chain 677 |

## Overall

`FLOWBRIDGE MULTISEND BOT TESTNET ACCEPTANCE PASS`

Residual item, not blocking testnet acceptance: the explorer at scan.bohr.life exposes no public
verification API, so the frozen standard JSON input must be submitted manually. Source reproduction
against the live runtime bytecode is already proven byte-for-byte.

## BOT Mainnet readiness

All technical gates are green. Mainnet remains withheld pending the manual explorer publication and
an explicit owner instruction.
