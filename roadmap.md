# MultiSend BOT Testnet Release

- [x] Add a pinned Solidity 0.8.20 / Shanghai compiler gate.
- [x] Generate ABI, bytecode, explorer input, hashes, and EIP-170 size evidence.
- [x] Add fail-closed BOT Testnet preflight and read-only post-deployment verification.
- [x] Record the approved BOT Testnet owner and fee-recipient addresses.
- [x] Complete baseline contract tests and static safety evidence (17/17 contract tests; 14/14 static checks).
- [x] Broadcast the chain-968 deployment transaction (0x535dDDA826142AC42cE288154e9595f080940aE9).
- [x] Confirm live chain state: owner, fee recipient, 1 bps fee, 100 recipient limit, unpaused.
- [x] Point the testnet service fee to the approved separate wallet (0x628e...BB97, config nonce 1).
- [x] Run live native rehearsals for Distribute, Consolidate, and Advanced with exact recipient credit,
      1 bps fee, and zero contract custody afterwards.
- [x] Record the verified testnet address in the app inventory and enable BOT Testnet MultiSend.
- [ ] Submit the source for explorer verification on scan.bohr.life (standard JSON input is frozen at
      contracts/production/multisend-v1/verification/standard-input.json; no public verify API available here).
- [ ] Run an ERC-20 rehearsal once a supported testnet token balance is available on the source wallet.
- [ ] BOT Mainnet remains out of scope until testnet evidence is frozen and approved.
