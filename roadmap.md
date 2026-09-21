# MultiSend BOT Testnet Release

- [x] Add a pinned Solidity 0.8.20 / Shanghai compiler gate.
- [x] Generate ABI, bytecode, explorer input, hashes, and EIP-170 size evidence.
- [x] Add fail-closed BOT Testnet preflight and read-only post-deployment verification.
- [x] Keep the app inventory disabled before verified deployment.
- [x] Record the approved BOT Testnet owner and fee-recipient addresses.
- [x] Complete baseline contract tests and static safety evidence (17/17 contract tests; 14/14 static checks).
- [x] Prepare the chain-968 deployment transaction.
- [ ] Broadcast the prepared chain-968 deployment transaction; blocked because the approved wallet has 0 tBOT and needs at least 0.0321606 tBOT (0.04020075 tBOT recommended).
- [ ] Verify on the explorer and run native/ERC-20 rehearsals for all three modes.
- [ ] Record the verified address and enable BOT Testnet MultiSend.