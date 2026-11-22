# PRIVATE — FlowBridge BNB adapter V1.12 external audit submission

**Ready for an auditor quote, not deployed, not independently audited, release HOLD.** No firm has been engaged. No payment, agreement, source delivery to a third party or financial action is authorized by this packet. Share privately only with the owner-selected auditor under an appropriate confidentiality agreement; do not expose this directory through public assets, routes, a public repository or download links.

## Exact source freeze

- Commit: `582e43ee77d03e43ff2c1f358b0f6a140720ccc7` (completed remediation and logs).
- Candidate: `contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol`.
- SHA256: `feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b`.
- Source Keccak: `0xb5d725ee678e28c1e6f235b8b4fd1ef62b35780ddbbc6003aa5f3b45b5c8a478`.
- Creation Keccak: `0xa6f9011514704f5d9c64431eebc73266459e809185a80ad0f98b12d9844d2f53`.
- Unlinked runtime Keccak: `0x2a612be879adb602f0b1f8f0179883d8b920407136510130b4719e6dbecb1866`.
- solc `0.8.38+commit.1835d247`, optimizer enabled / 200 runs, EVM Cancun; runtime 6,582 bytes.

The single-file `source/` copy is the complete Solidity closure, byte-identical to the candidate. It imports **no external Solidity files**. External token/router interfaces are inlined; their mainnet runtime code is not linked into this contract. `artifacts/` includes exact Standard JSON input, ABI, full creation/unlinked-runtime bytecode and immutable reference offsets. Actual runtime varies with the three constructor immutables; do not confuse its unlinked hash with a deployed contract.

**Every subsequent contract-source change invalidates this freeze and requires auditor review of a newly identified artifact.** V1.11 is included only as a differential baseline, not the final subject. Its old source hash must not be used for sign-off.

## Reproduce in a disposable private export

Copy only this submission directory to a private temporary working directory, not the application checkout. No repository metadata, installed packages or generated app build are included. `INTEGRITY.json` and `SHA256SUMS` cover packet files; keep them with the export.

1. `bun install --frozen-lockfile --ignore-scripts` (the full application dependency graph is preserved for truthful production/development dependency evidence; no application secrets/configuration are supplied).
2. `bun verify.mjs` — checks every listed file, reproduces the pinned artifact and validates exact hashes/ABI/immutable references without modifying the original manifest.
3. `bun run test` — restores byte-identical `.test.ts.audit` files to their original `.test.ts` names in the disposable export, then runs 74 final candidate tests plus 15 offline tier-preview tests. Inert filenames avoid accidental duplicate suites inside the original app.
4. `BNB_FORK_BLOCK=135034233 nix shell nixpkgs#foundry -c bun scripts/bnb-v112-fork-rehearsal.ts` — exact original fork block; archive access may be unavailable later. No private keys used. The only upstream RPC target is the fixed official BNB read endpoint; **all transactions and storage edits are local, 127.0.0.1:8547**. The output overwrites only the disposable export's fork evidence; preserve the original archived evidence separately.
5. Slither 0.11.5 with native solc 0.8.38: `slither contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol --solc-args '--optimize --optimize-runs 200 --evm-version cancun' --json /tmp/slither-reproduced.json`. No excluded detectors or suppression. Findings may cause a nonzero exit; inspect the JSON.

Tooling versions and exact Bun dependency graph are recorded. Block-pinned fork reproduction depends on third-party historical-state retention; bytecode compilation and synthetic tests remain offline reproducible after installing locked packages.

## Evidence and boundaries

- Full application remediation baseline: 3,021 passing tests / 270 files; raw log included. Packet acceptance adds three freeze/privacy/deployment tests: 3,024 / 271 files PASS. The fresh separately installed private export passed 89 / 89 tests. These are self-run reproduction evidence, not independent third-party verification; the reduced exported harness does not contain the full private app.
- 15 local-only real-bytecode fork transactions; 0 BNB mainnet adapter transactions, signatures or real fees. `evidence/mainnet-deployment-status.json` inventories inspected production manifests. **No BNB mainnet adapter deployment address or transaction is recorded in project manifests/evidence.** Existing BOT deployments and external Pancake/token addresses are not BNB adapter deployments.
- Six HIGH Slither balance paths remain OPEN, with no suppression; full before/after JSON and trace-specific review included. Automated tests, mock callbacks, fork receipts and this self-review are **not independent third-party verification**.
- Fresh dependency audit, provenance and original lock graph included: production Zod/WalletConnect HIGH and dev minimatch moderate remain; Hono patch removed eight production scan rows. No customer records, real user wallets, credentials or API keys. Addresses in selected tests/evidence are synthetic local fixtures or public infrastructure/token contracts.
- Historical target source provenance is included with official Sourcify references; these are evidence pointers, not a claim that third-party token/router code has been independently audited here.

See `THREAT_MODEL.md`, `CONSTRUCTOR_POLICY.md`, `LAUNCH_HOLD_MATRIX.md` and `AUDITOR_ENGAGEMENT_REQUEST.md` for scope, blockers and owner decisions. External verification requires a firm-issued **signed report naming the final source hash**, plus reviewed remediation and re-audit for any subsequent changes.