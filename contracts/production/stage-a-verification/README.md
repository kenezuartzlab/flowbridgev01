# Stage A — FlowToken public source verification bundle

Deployed contract: `0x535ddda826142ac42ce288154e9595f080940ae9` (BOT Mainnet 677)
Explorer: https://scan.botchain.ai/address/0x535ddda826142ac42ce288154e9595f080940ae9

Automated submission to both explorer verification APIs returns HTTP 403 from a
Cloudflare challenge, so verification must be submitted once from a browser.

Use exactly these values (they reproduce the frozen hashes byte-identically):

| Field | Value |
| --- | --- |
| Verification method | Solidity (Standard JSON input) |
| File | `FlowToken.standard-input.json` |
| Contract name | `FlowToken.sol:FlowToken` |
| Compiler | `v0.8.24+commit.e11b9ed9` |
| Optimizer | enabled, 200 runs |
| viaIR | true (already in the JSON `settings`) |
| EVM version | `cancun` (already in the JSON `settings`) |
| License | MIT |
| Constructor args | see `constructorArgsAbiEncoded` in `../STAGE_A_DEPLOYMENT.json` (or let the explorer autodetect) |

Reproduction check (informational):

- creation bytecode sha256 `200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2`
- runtime bytecode sha256 `f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf`
- on-chain runtime differs only in the 131 bytes occupied by the EIP-712 immutables
