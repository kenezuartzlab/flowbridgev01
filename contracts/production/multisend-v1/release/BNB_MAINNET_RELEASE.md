# FlowBridge MultiSend V1 — BNB Smart Chain Mainnet Release (chain 56)

Authorized scope: BNB Smart Chain Mainnet only. No contract logic changed.

## Canonical release
Identical to the accepted BOT and BNB Testnet releases — unchanged source,
self-contained Standard-JSON bundle (17 files, OpenZeppelin 5.6.1 vendored),
solc v0.8.20+commit.a1b79de6, optimizer enabled / 200 runs, viaIR true, EVM
shanghai, metadata bytecodeHash ipfs, MIT. No BNB-specific logic.

- source sha256 `3284801055c7f40c939e55a660d740e0d7caf2bf243311659810d6a8c00d91f4`
- abi sha256 `91a6f2bd6d754fc85bb403a5d4b155fccbe7c60bdbfee4308a288586a50a4784`
- creation sha256 `a9b9b1297c681703cbc669e6a25817d6b9cb8c2f4603c4e95e6a092a6ed4eed1`
- runtime sha256 `7b2e4e5bee31d6bb9a6af0e7782fd88036929ad30ac924345924ff6ace7dc0a6` (6860 bytes, EIP-170 headroom 17716)
- bundle sha256 `f81dd258eec6c3c285785b8af0bd1731e28b77907156cb5f47f932ad4879e44f`
- deterministic rebuild before deployment: identical (doubleBuildIdentical true)

## Predeployment gate
`FLOWBRIDGE MULTISEND BNB MAINNET PREDEPLOYMENT PASS`
(chain 56, hashes match the accepted releases, bundle self-contained, compiler
settings identical, size under EIP-170, fee 1 bps, cap 100, approved production
owner and fee recipient matched exactly against the BOT Mainnet release record,
no test-only wallet or test-token address in configuration, signer is the
approved deployer, RPC reports 56, gas sufficient.)
Security suite: 41/41 PASS (17 acceptance + 24 adversarial).

## Deployment
- contract `0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e` (chain 56)
- tx `0x0a754977d8127b8adfc072fa5f2ab6baa57bb68667ec1ac63d026576c4100280`, block 123546080
- deployer `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`
- owner `0x524Db06954de917025180057BCBeB36eC96A98c5` (approved production owner)
- fee recipient `0xAbe9AC1bC4b9E99b89c27f97c580B5a0b8Fa75E1` (approved production treasury)
- live: fee 1 bps, MAX_FEE_BPS 100, maxRecipients 100, configNonce 0, paused false, balance 0
- creation calldata byte-identical to the frozen build plus the recorded constructor arguments
- on-chain runtime byte-exact with the frozen build (`runtimeExactMatch: true`)
- manifest `contracts/deployments/multisend-bnb-mainnet.json`

Note: the deploy script's receipt poll was interrupted by an RPC archive
restriction on the public node; the already-broadcast creation transaction was
recorded read-only by `contracts/scripts/record.multisend.bnb-mainnet.ts`,
which re-validates the creation calldata and live state. No second deployment
was broadcast.

Address-identity note: this address string also appears on other chains from
the same deployer nonce (including a test-only token on chain 97). Deployment
identity in the app is strictly chainId + address; no address-only logic exists
and there is no cross-network fallback.

## Verification
BscScan (Etherscan V2 API, `chainid=56`) accepted the exact deployment bundle:
`Pass - Verified`, ContractName FlowBridgeMultiSend, compiler
v0.8.20+commit.a1b79de6, optimization 1 / 200 runs, shanghai, MIT, constructor
arguments match the recorded production owner and fee recipient.

## Live rehearsals (mainnet, minimal values)
Native BNB, one shared clientBatchId, report
`release/bnb-mainnet-rehearsal-native.json`:
Distribute (3 recipients), Consolidate, Advanced, duplicate-recipient batch —
exact recipient credit, exact 1 bps fee to the approved production treasury,
gas accounted separately from the service fee, zero contract custody after each
batch.

ERC-20: PASS, report `release/bnb-mainnet-rehearsal-erc20.json`. Owner-named
production token PEPE `0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB00` (18 decimals,
mainnet asset; no test token was deployed or used). Distribute (3 recipients),
Consolidate, Advanced and a duplicate-recipient batch all delivered exact
recipient amounts with the 1 bps fee charged in the transferred token to the
approved production treasury; approval was exact (never unlimited), fully
consumed, no residual allowance and zero token balance left in MultiSend.
Live rejections re-asserted on chain 56 by simulation: 17 PASS (insufficient
allowance, zero recipient, zero amount, self recipient, length mismatch, empty
batch, >100 recipients, insufficient balance, expired deadline, changed fee,
stale config, zero/non-token address, unauthorized fee change / pause / rescue,
max+1 base unit). No hostile or wasteful transaction was broadcast.

## App state
677 BOT Mainnet `0xc54CAcfd96330949db0eAEd72dE930a2d06d9778` (unchanged) ·
968 BOT Testnet `0x1b97CCbAE4D5128f8E5591ada21476609c7F2960` (unchanged) ·
97 BNB Testnet `0x535dDDA826142AC42cE288154e9595f080940aE9` (unchanged) ·
56 BNB Mainnet `0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e` (new, enabled) ·
old BOT testnet address SUPERSEDED, paused, blocked on 968 only ·
all other networks fail closed. Full app suite 1308/1308 PASS.
