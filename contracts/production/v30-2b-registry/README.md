# V30.2B R3 — FlowBridgeActivityRegistry clean replacement candidate

Read-only preflight package. Nothing here signs or broadcasts.

- `sources/` — frozen reviewed sources (7 units, OpenZeppelin 5.6.1 vendored verbatim)
- `scripts/rebuild.cjs` — double clean compile (solc 0.8.20+commit.a1b79de6, optimizer 200, viaIR false, shanghai, ipfs+CBOR metadata); regenerates standard-input.json / abi.json / bytecode files
- `scripts/preflight.mjs` — live read-only chain preflight; regenerates constructor-args.txt and unsigned-deployment-data.txt
- `MANIFEST.json` — frozen evidence; see `contracts/MAINNET_V30_2B_R3_PREFLIGHT.md`
