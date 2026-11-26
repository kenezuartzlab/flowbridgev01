# BNB Adapter V1.13 — PRIVATE community human-review packet (V1.14 readiness gate)

**PRIVATE. Do not publish, upload or share automatically.** Sharing with a volunteer reviewer is an owner action.

- Candidate: `contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol` (unchanged)
- Source SHA256: `5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425`
- solc 0.8.38, optimizer 200 runs, EVM cancun. ABI/bytecode in `artifacts/`, reproduced by `node scripts/bnb-v114-packet.mjs` (fails on any hash/ABI drift).
- Not deployed on BNB mainnet; no mainnet transaction exists. Local Anvil forks are not deployment.
- **No signed report. No firm certification. AI review is not a human audit.** Human sign-off: PENDING.

Contents: `SLITHER_HIGH_TRACES.md` (6 HIGH, OPEN), `THREAT_MODEL.md`, `REVIEW_CHECKLIST.md`, `ATTESTATIONS.md` (blank, human-only), `DEVICE_ACCEPTANCE.md` (manual, UNVERIFIED), `artifacts/`, `SHA256SUMS` (also covers parity crosswalk, fork evidence and tests under `docs/security/bnb-bot-v4-parity/` and the candidate `test/`).

Any later change to the Solidity source invalidates this freeze and every attestation.
