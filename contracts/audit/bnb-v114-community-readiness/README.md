# BNB Adapter V1.13 — PRIVATE community peer-review bundle (V1.15 workflow)

**PRIVATE. Do not publish, upload or share automatically.** Sharing with a volunteer reviewer is an owner action. No external reviewer has been contacted and no attestation has been received.

## Exact review identity
- Candidate: `contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol` (frozen and unchanged)
- Source SHA256: `5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425`
- ABI file SHA256: `d4453c306a097b9141ef62403bcefa3c436a7fd90dcc888805e75d94e5b9b856`
- Unlinked runtime file SHA256: `f9919c16f1ac98b1c0195150b7373006113d33b1c83385aafca7b8d77ade8f9e`
- Creation bytecode keccak: `0x84b4f23b60097ccb65b0e817a703e3a0e9eee5e5426bb81e60fefd2bdb22112e`
- Unlinked runtime keccak: `0x8410959bb5c8d0d69f4a1ab9c3c4cc9a4748e6cf35af58c73f6fa53ae059469f`
- solc 0.8.38, optimizer 200 runs, EVM cancun. Constructor immutables make deployed-runtime byte comparisons configuration-specific.
- Not deployed on BNB mainnet; no BNB mainnet transaction exists. Local EVM/Anvil forks are not deployment.

## Reviewer workflow
1. Verify `SHA256SUMS` and `artifacts/FREEZE.json`; reproduce the packet using `REPRODUCE.md`.
2. Read `THREAT_MODEL.md`, `EXPLOIT_HARNESS.md`, `SLITHER_HIGH_TRACES.md` and the BOT V4 parity evidence.
3. Run the local mock exploit harness independently. Mocks are not BSC nodes and cannot prove live-token behavior.
4. Answer every item in `REVIEWER_QUESTIONNAIRE.md`. Each of the six HIGH findings must independently be marked **FINDING_CONFIRMED**, **FALSE_POSITIVE_WITH_JUSTIFICATION**, or **UNVERIFIED**.
5. A substantive response uses `RESPONSE_TEMPLATE.json`, covers all six Slither IDs, matches all three artifact identities, and carries a verifiable human signature. AI-generated responses do not count.
6. Record only genuine signed responses in `ATTESTATIONS.md` and update status through `summarizePeerReview`; do not edit the blank template into a claimed response.

Current status: **ZERO_REVIEWERS / 0 substantive signed human responses / no certification / launch NO-GO.**

## Revision and expiry
Responses expire 90 days after signing and immediately upon any Solidity, ABI or runtime-bytecode change. A source change requires a new candidate directory and packet revision and resets reviewed status to ZERO_REVIEWERS. Test-only changes do not change contract identity, but must change `SHA256SUMS` and be disclosed to reviewers.

Owner Guardian/Treasury collection is **GUARDIAN_AND_TREASURY_DEFERRED_BY_OWNER**. See `OWNER_INPUT_REQUEST.md`: request only after human review, wallet acceptance readiness and separately authorized deployment planning. Never request private keys or recovery phrases.

Contents include the six OPEN HIGH traces, threat model, exact artifacts, questionnaire, response template, local harness instructions, manual device plan, owner-input checklist and hashes over the BOT V4 parity evidence and candidate tests.
