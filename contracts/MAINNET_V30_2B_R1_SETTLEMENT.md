# FlowBridge V30.2B R1 — FlowToken Settlement (BOT Mainnet 677)

Verdict: **PASS — SETTLED AND PUBLICLY SOURCE VERIFIED**

## Pre-sign revalidation (live)

| Check | Value | Result |
| --- | --- | --- |
| Chain ID | 677 | MATCH |
| Deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` | MATCH |
| Pending nonce | 9 | MATCH |
| Predicted CREATE address | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` | MATCH, codeless before send |
| Deployment-data keccak | `0xf5c8efb4faa6319c5b99b1e267d7a5a1bce83265973ffeac86798bce883a1d7c` | MATCH |
| Creation SHA-256 | `5d968091e8140cfd872d69ce54b3c64bf33f417b26f9fe7796d1ae1302280f4e` | MATCH |
| Constructor args | frozen `constructor-args.txt` (suffix of stored payload) | MATCH |
| Deployer balance | 2.18698858 BOT | sufficient |

Payload was read verbatim from `contracts/production/v30-2b-candidate/unsigned-deployment-data.txt`; no calldata was reconstructed.

## Settlement

| Field | Value |
| --- | --- |
| Transaction hash | `0xef6126b07ba09d84f5f71c3f6fd6811f01ce765cafab83fc88c9db059e900e14` |
| Block | 21,500,918 |
| Receipt status | success |
| Deployed address | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` |
| Gas used | 552,885 (limit 725,972) |

## On-chain state

| Field | Value |
| --- | --- |
| `name()` | FlowBridge |
| `symbol()` | FLOW |
| `decimals()` | 18 |
| `totalSupply()` | 1,000,000,000 FLOW |
| Treasury Safe balance | 1,000,000,000 FLOW (full supply) |
| Runtime SHA-256 | `2f86c4bb190f0d46e7d0154d6f1de02f35e69d4aa2015e7ceecf647de5d7a5ca` — exact parity, 1,786 bytes |

## Public source verification

Standard-JSON input (non-viaIR, solc `0.8.24+commit.e11b9ed9`, optimizer 200, Cancun, MIT) submitted to `scan.botchain.ai`; explorer reports `is_verified: true` for `FlowToken`.

https://scan.botchain.ai/address/0xcaaB50F36252a57529AFeF651fa6B9f9281917fF

## Scope boundary

No FLOW transfers, no Rewards/Staking funding, no reward roots, no staking activation, no R2 preparation or deployment. Old FlowToken remains quarantined and untouched.
