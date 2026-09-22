# FlowBridge MultiSend V1 — BOT Chain Mainnet release (chain 677)

Status: **FLOWBRIDGE MULTISEND BOT MAINNET RELEASE PASS**

## Deployment

| Field | Value |
| --- | --- |
| Contract | `0xc54CAcfd96330949db0eAEd72dE930a2d06d9778` |
| Deployment tx | `0xc3d3be554e0dad2268f0573c8aa0b1581c7761db64651bc1b7dc527fba905b8e` |
| Block | 24172977 |
| Deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` (approved) |
| Owner | `0x524Db06954de917025180057BCBeB36eC96A98c5` |
| Fee recipient | `0xAbe9AC1bC4b9E99b89c27f97c580B5a0b8Fa75E1` |
| Fee | 1 bps (0.01%), max 100 bps | 
| Recipient cap | 100 · config nonce 0 · not paused · native balance 0 |
| Runtime | 6860 bytes, byte-exact with the frozen build |

## Build line (identical to the accepted testnet release)

Unchanged frozen source (`sha256 3284801055c7f40c939e55a660d740e0d7caf2bf243311659810d6a8c00d91f4`),
self-contained Standard-JSON bundle (17 sources, OpenZeppelin 5.6.1 vendored,
bundle `sha256 f81dd258…`), solc `v0.8.20+commit.a1b79de6`, optimizer on / 200
runs, viaIR on, EVM `shanghai`, metadata bytecodeHash `ipfs`. Double build
identical; creation `a9b9b129…`, runtime `7b2e4e5b…`. ABI identical to the
accepted testnet release apart from four unused OpenZeppelin internal error
selectors (no behavioural difference).

## Gates

| Gate | Result |
| --- | --- |
| Predeployment gate | PASS |
| Bytecode reproduction | PASS (byte-exact, deterministic) |
| Security tests | 41 / 41 PASS |
| Explorer source verification | PASS — fully verified on scan.botchain.ai, 17 files, published runtime `sha256 7b2e4e5b…` matches the frozen runtime; constructor args match owner + fee recipient |
| Live settings vs frozen manifest | PASS |
| Native mainnet rehearsals | PASS — Distribute (3), Consolidate (1), Advanced (2) in one client batch id; exact recipient credit, 1 bps fee credited to the approved fee recipient, one batch event per group, zero contract residual |
| ERC-20 mainnet rehearsals | PENDING — the approved sending wallet holds no approved production ERC-20 balance; no unknown or experimental token was used |
| App acceptance | PASS — 1306 tests pass, build clean |

Native rehearsal evidence: `bot-mainnet-rehearsal-native.json`.

## Network state

- BOT Mainnet 677 — **ENABLED**, `0xc54CAcfd96330949db0eAEd72dE930a2d06d9778` only.
- BOT Testnet 968 — ENABLED, `0x1b97CCbAE4D5128f8E5591ada21476609c7F2960`.
- Legacy testnet `0x535dDDA826142AC42cE288154e9595f080940aE9` — SUPERSEDED, paused, blocked for new sends, evidence retained.
- BNB Testnet 97 / BNB Mainnet 56 / all other networks — LOCKED, fail closed.
