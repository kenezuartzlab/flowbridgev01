# MultiSend BOT Testnet Release

- [x] Add a pinned Solidity 0.8.20 / Shanghai compiler gate.
- [x] Generate ABI, bytecode, explorer input, hashes, and EIP-170 size evidence.
- [x] Add fail-closed BOT Testnet preflight and read-only post-deployment verification.
- [x] Record the approved BOT Testnet owner and fee-recipient addresses.
- [x] Complete baseline contract tests and static safety evidence (17/17 contract tests; 14/14 static checks).
- [x] Broadcast the chain-968 deployment transaction (0x535dDDA826142AC42cE288154e9595f080940aE9).
- [x] Confirm live chain state: owner, fee recipient, 1 bps fee, 100 recipient limit, nonce 0, unpaused.
- [ ] Run native/ERC-20 rehearsals for all three modes; blocked because the contract rejects batches
      whose sender is the fee recipient, and the approved owner wallet is also the fee recipient.
      Needs either an approved separate testnet fee-recipient address or an approved second source wallet.
- [ ] Verify the contract source on scan.bohr.life.
- [ ] Record the verified address in the app inventory and enable BOT Testnet MultiSend.
