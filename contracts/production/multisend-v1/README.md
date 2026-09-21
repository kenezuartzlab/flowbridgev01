# FlowBridge MultiSend V1

Production-candidate implementation package for three user modes:

- One -> Many / Distribute
- Many -> One / Consolidate
- Many -> Many / Advanced

## Core authorization rule

The contract executes **one source wallet per on-chain call**. This is intentional and is the safe model for ordinary EOAs.

- One -> Many normally requires one source authorization.
- Many -> One groups the plan by source. Each independent source wallet authorizes its own transaction.
- Many -> Many groups all rows by source. Each independent source wallet authorizes one transaction for its rows.
- Smart-account / ERC-4337 wallets may bundle source-authorized operations at the account layer when supported.

FlowBridge must never request or store private keys to fake multi-wallet control.

## Fees

- Default: 1 basis point = 0.01%.
- Admin adjustable: 0 to 100 basis points.
- Hard contract maximum: 100 basis points = 1.00%.
- Fee is paid in the same asset being transferred.
- For multi-source sessions, each source pays the fee on that source's own transferred total. The UI sums those fees for the session total.
- Network gas is separate.
- `feeBps` plus `configNonce` are snapshotted into every send. If reviewed configuration changes before execution, the transaction reverts instead of silently using new economics.

## Asset safety

- Native and conventional ERC-20 transfers.
- ERC-20 recipient balance deltas are checked, rejecting fee-on-transfer/deflationary behavior rather than promising an amount the recipient did not receive.
- Optional EIP-2612 permit path for compatible tokens.
- No swaps, bridges, staking, minting, upgrade proxy, arbitrary user-selected calls, or server-held signer.
- Batch sends are atomic per source transaction.

## Networks

Initial focus:
- BOT Chain mainnet 677 / testnet 968.
- BNB Smart Chain mainnet 56 / testnet 97.

Deploy a separate verified instance per network.

## Required release gate

This package is source-level only until it passes the FlowBridge pinned Solidity toolchain, automated contract tests, static analysis, testnet deployment rehearsal, UI simulation tests, explorer verification, and owner/treasury governance approval.

## BOT Testnet release commands

```text
bun run multisend:compile
bun run multisend:preflight
bun run multisend:verify
```

`multisend:compile` is network-free and writes the pinned compiler artifact plus explorer standard input. `multisend:preflight` never signs or broadcasts; it fails closed until the approved owner and fee recipient are recorded in `contracts/config/multisend-bot-testnet.json`. After a wallet-authorized deployment, its receipt belongs in `contracts/deployments/multisend-bot-testnet.json`; `multisend:verify` then checks chain 968, deployed code, ownership, treasury, fee, recipient limit, nonce, and pause state. The app inventory remains `null` until explorer verification is separately confirmed.
