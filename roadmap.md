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
- [x] Prove the frozen source reproduces the deployed bytecode exactly (release/bot-testnet-source-reproduction.json).
- [ ] Submit that frozen standard JSON through the scan.bohr.life explorer UI (no public verify API; manual step).
- [x] Run the ERC-20 rehearsal for all three modes plus 17 negative paths with the MSTT test token.
- [x] Run the adversarial contract suite (41/41) and the live pause acceptance check.
- [x] Show estimated network gas, total required and balance-after per source wallet on Review.
- [x] Group MultiSend sessions as one receipt on Activity while keeping every transaction hash.
- [ ] BOT Mainnet remains out of scope until testnet evidence is frozen and approved.
