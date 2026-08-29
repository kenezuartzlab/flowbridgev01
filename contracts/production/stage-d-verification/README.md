# Stage D — FlowBridgeActivityRegistry source verification bundle

Deployed: `0xa80d8740f378989F649ca14C54e4B4a42E68753c` (BOT Mainnet 677)
Tx: `0xd636a12677f0f68a47595501a792861ceb83b18fd1c3fc8d0b6d76e226bf3b76`

Compiler (frozen, unchanged): `v0.8.20+commit.a1b79de6`, optimizer enabled
runs 1, `viaIR: true`, EVM `shanghai`, OpenZeppelin 5.6.1, license MIT.

`standard-input.json` is the preserved Blockscout v2 standard-JSON bundle,
submitted verbatim to `https://scan.botchain.ai/api/v2/smart-contracts/<addr>/verification/via/standard-input`
(submission accepted: "Smart-contract verification started"; the contract did
not become verified).

Classification: `EXPLORER_TRANSPORT_BLOCKED`.

Why this is not an artifact mismatch: the deployed runtime is byte-identical to
the frozen manifest artifact (sha256 `53a83eea…76b3e03b`, 2,713 bytes), rebuilt
twice reproducibly from the frozen source (sha256 `2735de22…ff5aeca6e`) with the
canonical import-callback build used by `contracts/scripts/build.production.ts`.
Recompiling the identical sources and identical settings as an explicit
multi-source standard-JSON input yields the same length, the same metadata hash
and the same source hashes, but a different internal jump-destination layout
under `viaIR` — so the explorer's verifier cannot reproduce the deployed bytes.
Router V4 and Router Lens verified publicly because they are single-file sources
with no imports; FlowToken, the Rewards Distributor and this Registry all import
OpenZeppelin and share the same explorer-side limitation.
