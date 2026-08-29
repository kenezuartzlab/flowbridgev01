# Stage A — Hardhat source verification (V30.1E.5)

Target: `0x535ddda826142ac42ce288154e9595f080940ae9` — FlowToken, BOT Mainnet 677.
No redeploy, no recompile with different settings: this project reproduces the
frozen production build **byte-identically**.

## Build parity (verified 2026-08-29)

| Artifact | sha256 | Frozen evidence |
| --- | --- | --- |
| creation bytecode (5,660 B) | `200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2` | match |
| runtime bytecode (3,539 B) | `f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf` | match |

Critical detail: the compilation source name must be exactly `FlowToken.sol`
(not `contracts/FlowToken.sol`), otherwise the embedded metadata IPFS hash
changes and the bytecode no longer matches. Hence `paths: { sources: "." }`
with `FlowToken.sol` at the project root and `@openzeppelin/contracts@5.6.1`
resolvable from a parent `node_modules`.

## Reproduce

```bash
mkdir -p verify && cd verify
npm i hardhat@2.26.1 @nomicfoundation/hardhat-verify@2.0.14 @openzeppelin/contracts@5.6.1
mkdir proj && cp ../FlowToken.sol ../hardhat.config.cjs proj/ && cd proj
echo '{"name":"proj","private":true,"version":"1.0.0"}' > package.json
npx hardhat compile
npx hardhat verify --network botmainnet \
  0x535ddda826142ac42ce288154e9595f080940ae9 \
  "FlowBridge" "FLOW" "0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4" \
  "1000000000000000000000000000"
```

Constructor arguments are exactly the deployment arguments
(`name_`, `symbol_`, `treasury_`, `totalSupply_`), ABI-encoding recorded in
`../../STAGE_A_DEPLOYMENT.json`.

## Verifier response (blocker)

Hardhat's read request succeeds (`getsourcecode` → HTTP 200, contract present,
unverified). The submission POST is rejected by the explorer edge, not by
Hardhat and not by Blockscout:

```
GET  /api?module=contract&action=getsourcecode&address=0x535d…0ae9   200 {"status":"1", ...}
POST /api  (verifysourcecode, standard-json, 221,034 B body)          403 Cloudflare "Attention Required!"
POST /api/v2/smart-contracts/0x535d…0ae9/verification/via/standard-input (multipart) 403 Cloudflare
```

Hardhat surfaces this as:

```
hardhat-verify found one or more errors during the verification process:
Etherscan:
A network request failed. This is an error from the block explorer, not Hardhat.
Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Measured cause: the explorer's edge rejects request bodies above roughly 40 KB
(20 KB body → origin reached; 50 KB+ → 403 Cloudflare) on every route,
including from a real Chromium session carrying explorer cookies. The Stage A
standard-JSON payload is 221 KB (176 KB of sources across 21 files), so no
API-based submission — Hardhat or browser — can currently reach the verifier.
`FlowToken.hardhat-standard-input.json`
(sha256 `b26371ed63edbc07fc50dd1b9cced1d22107abe6baf30165d1a15f482ed25b44`)
is the exact input Hardhat submits, kept for manual/off-network submission.

No compiler setting was altered and nothing was redeployed to force a match.
