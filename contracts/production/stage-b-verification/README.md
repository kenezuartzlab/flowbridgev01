# Stage B — FlowRewardsMerkleDistributor public source verification bundle

Deployed contract: `0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB` (BOT Mainnet 677)
Explorer: https://scan.botchain.ai/address/0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB

Status: `EXPLORER_TRANSPORT_BLOCKED` — not a contract mismatch.

- `hardhat-verify` (Blockscout custom chain 677) compiled 16 sources successfully, then the explorer returned a Cloudflare HTML challenge instead of JSON:
  `Etherscan: A network request failed. This is an error from the block explorer, not Hardhat. Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
- The Blockscout v2 `verification/via/standard-input` endpoint returns the same HTML challenge for the complete 88 KB multi-source body (body-size rejection).
- The v1 `verifysourcecode` endpoint accepts a small single-file body but cannot carry the 15 imported OpenZeppelin sources, so it reports `Fail - Unable to verify`.

Submit once from a browser using exactly these values (they reproduce the frozen
hashes byte-identically):

| Field | Value |
| --- | --- |
| Verification method | Solidity (Standard JSON input) |
| File | `FlowRewardsMerkleDistributor.standard-input.json` (16 sources) |
| Contract name | `FlowRewardsMerkleDistributor.sol:FlowRewardsMerkleDistributor` |
| Compiler | `v0.8.24+commit.e11b9ed9` |
| Optimizer | enabled, 200 runs |
| viaIR | true (already in the JSON `settings`) |
| EVM version | `cancun` (already in the JSON `settings`) |
| License | MIT |
| Constructor args | `constructorArgsAbiEncoded` in `../STAGE_B_DEPLOYMENT.json` (or autodetect) |

Reproduction check (informational):

- creation bytecode sha256 `21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581`
- runtime bytecode sha256 `a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367`
- on-chain runtime differs only in the 100 bytes of the five `token` immutable slots
