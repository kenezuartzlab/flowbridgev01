# V30.2B R4 — FlowStakingRewardTreasury candidate (read-only)

Frozen replacement Reward Treasury for BOT Mainnet 677, bound to the verified
V30.2B FLOW `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`.

- `sources/` — the 14 exact source units (reviewed treasury + vendored OZ 5.6.1).
- `verification-standard-input.json` — frozen explorer package, sha256 `99848d1f…6896a`.
- `standard-input.json` / `abi.json` / `creation-bytecode.txt` / `runtime-bytecode.txt` — rebuild output.
- `constructor-args.txt`, `unsigned-deployment-data.txt` — unsigned payload evidence.
- `scripts/rebuild.cjs` — double compile, prints all hashes (no chain access).
- `scripts/verify-standard-input.cjs` — proves the explorer package yields the same bytes.
- `scripts/preflight.mjs` — read-only live preflight (never signs, broadcasts, or funds).

Build matrix: solc 0.8.24+commit.e11b9ed9, optimizer runs 200, viaIR false, EVM cancun,
metadata ipfs + CBOR. See `MANIFEST.json` and `contracts/MAINNET_V30_2B_R4_PREFLIGHT.md`.
