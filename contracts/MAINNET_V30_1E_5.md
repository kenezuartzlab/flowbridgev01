# FlowBridge V30.1E.5 — Hardhat source verification (Stage A, FlowToken)

Gate: promote FlowToken from `DEPLOYED_SOURCE_PENDING` to `DEPLOYED_VERIFIED`
only on public explorer verification.

- Target address: `0x535ddda826142ac42ce288154e9595f080940ae9`
- Chain: BOT Mainnet 677 (`https://rpc.botchain.ai`)
- Explorer: `https://scan.botchain.ai`
- Method: Hardhat (`@nomicfoundation/hardhat-verify` 2.0.14, hardhat 2.26.1)
  with BOT Chain configured as a custom network/explorer (Etherscan-compatible
  `apiURL https://scan.botchain.ai/api`).

## What passed

1. Exact production compiler configuration and exact deployment source tree:
   solc `0.8.24+commit.e11b9ed9`, optimizer enabled / 200 runs, `viaIR: true`,
   `evmVersion: cancun`, OpenZeppelin 5.6.1, source name `FlowToken.sol`.
2. Byte-identical rebuild of the deployed artifact:
   - creation sha256 `200a6a55…07a2` (5,660 B) — matches frozen V30.1E.1 evidence
   - runtime sha256 `f7be82e4…6edf` (3,539 B) — matches frozen evidence
3. Constructor arguments submitted exactly as deployed:
   `"FlowBridge"`, `"FLOW"`, `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4`,
   `1000000000000000000000000000`.
4. Hardhat reached the explorer for reads: `getsourcecode` → HTTP 200,
   contract present, currently **unverified**.
5. Nothing was redeployed; no compiler setting was changed to force a match.

## What failed (exact verifier response)

```
POST https://scan.botchain.ai/api  (verifysourcecode, solidity-standard-json-input, 221,034 B)
  -> HTTP 403, body: <!DOCTYPE html> … <title>Attention Required! | Cloudflare</title>

POST https://scan.botchain.ai/api/v2/smart-contracts/0x535d…0ae9/verification/via/standard-input
  -> HTTP 403, Cloudflare "Attention Required!"

hardhat-verify:
  Etherscan: A network request failed. This is an error from the block explorer,
  not Hardhat. Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Diagnosis (measured, not inferred): the explorer edge accepts small POSTs on the
same endpoints (`checkverifystatus` → `{"status":"1"}`; a truncated
`verifysourcecode` → `{"message":"contractname is required."}`) but returns the
Cloudflare interstitial for bodies above roughly 40 KB — reproduced with an
inert blob at 50 KB, and also from a real Chromium session on
`scan.botchain.ai` carrying explorer cookies. Stage A needs a 221 KB payload
(176 KB of sources, 21 files), so neither Hardhat nor the explorer's own UI
submission can currently reach the verifier. Sourcify does not index chain 677,
and no alternate verifier host resolves (`api.scan`, `explorer`, `blockscout`,
`eth-bytecode-db` under `botchain.ai` all fail DNS).

## Status

FlowToken remains **`DEPLOYED_SOURCE_PENDING`**. Promotion to
`DEPLOYED_VERIFIED` is gated on the explorer publicly exposing the source; the
five other success criteria (compiler/settings parity, constructor args,
address, reproducible build, ABI) are pre-satisfied by the recorded bundle.

Unblocking requires one action outside this environment (either is sufficient):

- run the committed Hardhat project from a network the explorer edge does not
  challenge (`contracts/production/stage-a-verification/hardhat/README.md`), or
- ask the BOT Chain explorer operator to raise the verification body limit /
  allowlist verification routes, then re-run the same Hardhat command.

Public read state today: bytecode and ABI-less reads are available via
`https://scan.botchain.ai/api/v2/smart-contracts/0x535ddda826142ac42ce288154e9595f080940ae9`;
`getabi` returns "Contract source code not verified".

## Stage B

NOT STARTED — halted as instructed.
