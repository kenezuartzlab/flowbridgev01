# FlowBridge MultiSend V1 — BNB Smart Chain Testnet Release (chain 97)

Authorized scope: BNB Testnet only. BNB Mainnet (56) was not deployed and stays locked.

## Canonical release
Identical to the accepted BOT releases — unchanged source, self-contained
Standard-JSON bundle (17 files, OpenZeppelin 5.6.1 vendored), solc
v0.8.20+commit.a1b79de6, optimizer enabled / 200 runs, viaIR true, EVM shanghai,
metadata bytecodeHash ipfs, MIT. No BNB-specific contract logic.

- source sha256 `3284801055c7f40c939e55a660d740e0d7caf2bf243311659810d6a8c00d91f4`
- abi sha256 `91a6f2bd6d754fc85bb403a5d4b155fccbe7c60bdbfee4308a288586a50a4784`
- creation sha256 `a9b9b1297c681703cbc669e6a25817d6b9cb8c2f4603c4e95e6a092a6ed4eed1`
- runtime sha256 `7b2e4e5bee31d6bb9a6af0e7782fd88036929ad30ac924345924ff6ace7dc0a6` (6860 bytes, EIP-170 headroom 17716)
- bundle sha256 `f81dd258eec6c3c285785b8af0bd1731e28b77907156cb5f47f932ad4879e44f`

## Deployment
- contract `0x535dDDA826142AC42cE288154e9595f080940aE9` (chain 97)
- tx `0xa85926927648a69a79b9e7e4f3a803d24bc8d3067cc859e2a9e9116fe252034c`, block 132603824
- deployer / owner `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`
- fee recipient `0x628e237b73C5a37EF3968527563FA1a26b32BB97`
- live: fee 1 bps, MAX_FEE_BPS 100, maxRecipients 100, configNonce 0, paused false, balance 0
- on-chain runtime byte-exact with the frozen build (`runtimeExactMatch: true`)
- manifest `contracts/deployments/multisend-bnb-testnet.json`

Note: the address string is identical to the quarantined BOT Testnet (968)
deployment because the same deployer nonce was used on a different chain. All
app routing and quarantine checks are chain-scoped: 968 stays blocked, 97 is
live, and no cross-network fallback exists.

## Verification
BscScan (Etherscan V2 API, `chainid=97`) accepted the exact deployment bundle:
`Pass - Verified`, ContractName FlowBridgeMultiSend, compiler
v0.8.20+commit.a1b79de6, optimization 1 / 200 runs, shanghai, MIT, constructor
arguments match the recorded owner and fee recipient.

## Rehearsals (live, small amounts)
- Native tBNB: Distribute (3 recipients), Consolidate, Advanced, duplicate-recipient batch — exact credit, 1 bps fee to the approved fee wallet, gas separate, zero contract custody, one shared clientBatchId.
- ERC-20 (`MSTT` TEST ONLY, `0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e`, no production authority, never a supported FlowBridge asset, excluded from BNB Mainnet): the same four shapes — exact credit, fee in the transferred token, exact (never unlimited) approval fully consumed, no residual balance or allowance.
- Live rejections: 17 PASS (zero recipient, zero amount, empty batch, length mismatch, >100 recipients, insufficient balance, insufficient allowance, expired deadline, changed fee, stale config, zero/non-token address, unauthorized fee change / pause / rescue, max+1 base unit).
- Live pause acceptance: PASS — accepted live, rejected while paused, accepted after unpause, left unpaused.
- Contract security suite: 41/41 PASS.

## App state
677 BOT Mainnet `0xc54CAcfd96330949db0eAEd72dE930a2d06d9778` (unchanged) ·
968 BOT Testnet `0x1b97CCbAE4D5128f8E5591ada21476609c7F2960` (unchanged) ·
97 BNB Testnet `0x535dDDA826142AC42cE288154e9595f080940aE9` (new, enabled) ·
56 BNB Mainnet LOCKED · old BOT testnet address SUPERSEDED, paused, blocked ·
all other networks fail closed. Full app suite 1308/1308 PASS.
