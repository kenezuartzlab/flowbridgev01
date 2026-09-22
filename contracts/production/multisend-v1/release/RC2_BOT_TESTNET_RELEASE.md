# FlowBridge MultiSend V1 — RC2 BOT Testnet Release (explorer-verifiable)

Unchanged accepted MultiSend source (sha256
`3284801055c7f40c939e55a660d740e0d7caf2bf243311659810d6a8c00d91f4`). No business
logic, economics, fee behaviour, security rule, UI behaviour, or recipient-limit
change. BOT Mainnet (677) and both BNB networks remain LOCKED.

## Build

- Single self-contained Standard-JSON bundle, 17 sources (contract + interface +
  vendored OpenZeppelin 5.6.1 dependencies inlined, deterministic paths).
- solc `v0.8.20+commit.a1b79de6`, optimizer ON / 200 runs, EVM `shanghai`,
  metadata bytecodeHash `ipfs`, license MIT.
- `viaIR: true` — documented deviation. viaIR OFF cannot compile the unchanged
  accepted source (`Stack too deep`, `FlowBridgeMultiSend.sol:234` `_emitBatch`).
  Changing the source to compile without viaIR was out of scope, so the proven
  FlowBridge element that was adopted is the self-contained bundle. That alone is
  what the explorer needs, and it verified.
- Deterministic double build identical; EIP-170 headroom 17716 bytes.
- Frozen: bundle `f81dd258…e44f`, ABI `91a6f2bd…4784`, creation `a9b9b129…eed1`,
  runtime `7b2e4e5b…c0a6` (6860 bytes).

## Deployment (BOT Chain Testnet, chain 968 only)

- Address `0x1b97CCbAE4D5128f8E5591ada21476609c7F2960`
- Tx `0x638d7694d1045c23f44db57a7ddbcbca1987472f3a22ee0413ecf4b188695b44`
- Owner / deployer `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`,
  fee recipient `0x628e237b73C5a37EF3968527563FA1a26b32BB97`
- Live state: feeBps 1 (0.01%), maxRecipients 100, configNonce 0, unpaused
- On-chain runtime sha256 equals the frozen runtime sha256 — exact match.

## Source verification — PASS

Submitted the exact deployment bundle through the Etherscan-compatible
`verifysourcecode` route (`codeformat=solidity-standard-json-input`) on
scan.bohr.life. Explorer reports verified, `FlowBridgeMultiSend`, 17 files,
solc 0.8.20, optimizer on/200, shanghai. Published runtime bytecode sha256
`7b2e4e5bee31d6bb9a6af0e7782fd88036929ad30ac924345924ff6ace7dc0a6` matches the
frozen and live runtime.

## Behaviour parity and tests

- 41/41 contract tests (17 functional + 24 hostile) PASS against this exact
  build: zero address/amount, recipient cap, insufficient balance/approval,
  stale fee & config snapshot, expired deadline, pause, reverting-recipient
  rollback, fee-on-transfer rejection, unusual ERC-20s, reentrancy,
  unauthorized admin calls, no residual funds.
- ABI parity with the accepted contract: identical except four OpenZeppelin
  internal error selectors no longer reachable (`AddressEmptyCode`,
  `AddressInsufficientBalance`, `FailedInnerCall`, `MathOverflowedMulDiv`).
  No externally observable behaviour difference.

## Live rehearsals on the new address — PASS

- Native (`rc2-bot-testnet-rehearsal-native.json`): Distribute (3), Consolidate,
  Advanced — exact recipient credit, 1 bps fee, zero contract custody.
- ERC-20 MSTT `0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e`
  (`rc2-bot-testnet-rehearsal-erc20.json`): Distribute, Consolidate, Advanced,
  duplicate-recipient — exact amounts, fee in the same token, no residual
  balance or allowance; 17 negative cases still rejected.
- Pause acceptance (`rc2-bot-testnet-pause-acceptance.json`): accepted live,
  rejected while paused, accepted after unpause; left unpaused.

## App migration

`src/lib/multisend/deployments.ts` now routes chain 968 to
`0x1b97CCbAE4D5128f8E5591ada21476609c7F2960`. The legacy address is recorded in
`SUPERSEDED_MULTISEND_DEPLOYMENTS` and `multiSendContract` fails closed for any
superseded or unconfigured network, so no new batch can route through it while
historical Activity rows and explorer links stay intact. App suite: 1305 tests
pass, build clean.

## Old address quarantine

`0x535dDDA826142AC42cE288154e9595f080940aE9` —
**SUPERSEDED — VALID TESTNET BUILD, NOT EXPLORER-VERIFIABLE**. Paused after the
replacement was verified, rehearsed, and active
(tx `0xe12418ab0062651abda9ae69049c186c34ce08b3d2dc3625d088f2e550c6cb92`).
Owner unchanged, no rescue, no ownership transfer, native custody 0. Evidence
retained as `v1-legacy-bot-testnet-*.json` plus the original deployment manifest.
