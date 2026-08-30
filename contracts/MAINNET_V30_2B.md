# FlowBridge V30.2B — FlowToken Candidate Freeze and Reproducibility Report

Read-only. Nothing was signed or broadcast. No source byte was modified.

## Frozen artifact

- Source: `contracts/production/v30-2b-candidate/sources/FlowToken.sol` (verbatim upload)
- OpenZeppelin 5.6.1 sources vendored under `sources/@openzeppelin/contracts/`
- Self-contained verification input: `standard-input.json` (6 source files, sha256 `977f9ee389b18c7894a5425c7ded2f893cb3fb89d5b0af56b04041ca673f0c35`)
- Simplified surface: plain ERC-20, no Permit/EIP-712, no burn, no owner/minter, single constructor mint

## Compiler matrix

solc `0.8.24+commit.e11b9ed9` · optimizer enabled, runs 200 · `viaIR: false` · evmVersion `cancun` · metadata `bytecodeHash: ipfs`, `appendCBOR: true` · OpenZeppelin 5.6.1

## Reproducibility (compiled twice from clean compiler state)

| Identity | Expected | Reproduced | Result |
| --- | --- | --- | --- |
| Source SHA-256 | `959f7df2…47df66f` | `959f7df2…47df66f` | MATCH |
| Creation SHA-256 | `5d968091…2280f4e` | `5d968091…2280f4e` | MATCH |
| Runtime SHA-256 | `2f86c4bb…5d7a5ca` | `2f86c4bb…5d7a5ca` | MATCH |
| ABI SHA-256 | `fd29c0fa…7144f1` | `fd29c0fa…7144f1` | MATCH |
| Creation size | 3,061 bytes | 3,061 bytes | MATCH |
| Runtime size | 1,786 bytes | 1,786 bytes | MATCH |
| Deployment-data keccak | `0xf5c8efb4…883a1d7c` | `0xf5c8efb4…883a1d7c` | MATCH |

Double build: byte-identical creation, runtime, and ABI. Runtime is far within EIP-170.

## Live chain re-read (BOT Mainnet)

- chainId: **677**
- deployer `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` pending nonce: **9**
- deployer balance: **2.18698858 BOT**
- predicted CREATE address at nonce 9: **`0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`** (matches the approved expectation)
- code at predicted address: `0x` (codeless)

## Constructor arguments

`FlowBridge`, `FLOW`, `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4`, `1000000000000000000000000000` (1,000,000,000 FLOW · 18 decimals). ABI encoding taken verbatim from the frozen `constructor-args.txt`; unsigned deployment data preserved in `unsigned-deployment-data.txt` (3,317 bytes).

## Verdict

`V30.2B CANDIDATE REPRODUCED EXACTLY — NO MISMATCH, NO HARD STOP`

Not signed, not broadcast. V30.2C was not created and the source was not altered. Awaiting explicit owner signing authorization; when it arrives, the stored payload is signed as-is without reconstructing calldata.
