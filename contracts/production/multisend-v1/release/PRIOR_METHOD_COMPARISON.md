# MultiSend V1 vs. the previously successful FlowBridge verification method

Read-only investigation. No contract change, no redeploy, no source edit.

## PREVIOUS FLOWBRIDGE VERIFICATION METHOD (proved from release records)

Successfully explorer-verified on `scan.botchain.ai` (`is_verified: true`):

| Contract | Address | Compiler | Optimizer | viaIR | EVM | Method |
| --- | --- | --- | --- | --- | --- | --- |
| FlowToken (V30.2B R1) | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` | v0.8.24+commit.e11b9ed9 | on / 200 | **false** | cancun | Standard-JSON input, all sources inlined |
| FlowRewardsMerkleDistributor (R2) | `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922` | v0.8.24+commit.e11b9ed9 | on / 200 | **false** | cancun | Standard-JSON, 16 sources inlined (vendored OZ 5.6.1); v2 multipart blocked by Cloudflare → Etherscan-compatible `verifysourcecode` |
| FlowBridgeActivityRegistry (R3) | `0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814` | v0.8.20+commit.a1b79de6 | on / 200 | **false** | shanghai | frozen non-viaIR Standard-JSON |
| FlowStakingRewardTreasury (R4), Router V4, Router Lens | see settlements | 0.8.24 | on / 200 | false | cancun | Standard-JSON inlined |

Common properties of every success:
- the **deployment itself** was produced from a fully inlined multi-source Standard-JSON bundle (no import callback, no remappings), with OpenZeppelin 5.6.1 vendored and copied byte-for-byte into the bundle;
- `viaIR: false`;
- constructor args ABI-encoded and frozen in `constructor-args.txt`;
- the exact same bundle file was submitted to the explorer, so the explorer's compiler reproduces the deployed bytes;
- fallback when the v2 multipart upload is edge-blocked: the same bundle through `/api?module=contract&action=verifysourcecode&codeformat=solidity-standard-json-input`.

Counter-example in our own records: the old activity registry `0xa80d8740…753c` was built **with viaIR** and is recorded `LAYOUT_DIVERGENT` / unverifiable; FlowBridge resolved it by rebuilding non-viaIR and redeploying (R3), then quarantining the old address.

## MULTISEND BUILD METHOD

`contracts/scripts/compile.multisend.ts`: `sources` contains **one** entry (`FlowBridgeMultiSend.sol`); the 10 OpenZeppelin files are pulled in on demand by solc's `import` callback from `node_modules/@openzeppelin/contracts` 5.0.2; `viaIR: true`; solc 0.8.20; optimizer on/200; shanghai; metadata ipfs. `verification/standard-input.json` is that single-source input, so it is not self-contained.

## DIFFERENCE

Two divergences, both in the build, not in the source:
1. compilation-unit shape — inlined bundle (FlowBridge) vs. one source + import callback (MultiSend);
2. `viaIR` — false (FlowBridge) vs. true (MultiSend).

Under viaIR, solc 0.8.20 places code depending on the compilation-unit set, so the two shapes emit the same length and same metadata hash but different jump layout.

## CAN PREVIOUS METHOD VERIFY CURRENT MULTISEND: NO — measured

On-chain runtime (`eth_getCode`, chain 968), 6771 bytes, sha256 of raw bytes `0570ec5228e565073b7c748a1c06b7267658cd3bc8786113e082a8401ab7bbd6`.

| build shape | runtime sha256 (raw bytes) | matches chain |
| --- | --- | --- |
| 1 source + import callback (as deployed) | `0570ec52…1ab7bbd6` | YES, exact |
| 11 sources inlined, viaIR true, identical settings | `ebb4e20704a4094ef7061d49e55678ef0efe5e07f2f98b9a0b0a134f35d449e3` | no |

The inlined bundle — the only shape an explorer can compile — was submitted again to `scan.bohr.life` through the Etherscan-compatible endpoint that unblocked R2. Explorer remains `is_verified: null`.

## CURRENT MULTISEND EXPLORER STATUS: BLOCKED

Source reproduction remains PASS (`release/bot-testnet-source-reproduction.json`): the frozen source + original inputs rebuild the live creation and runtime bytecode exactly.

## REDEPLOYMENT REQUIRED: YES (to obtain an explorer-green badge only) — NOT PERFORMED

Technical reason: the deployed bytes exist only as the import-callback/viaIR layout; no self-contained Standard-JSON bundle can express them, and explorers accept only self-contained bundles. The precedent fix is the R3 path: recompile the unchanged source with `viaIR: false` from a fully inlined bundle with vendored OpenZeppelin, deploy that build to BOT Testnet, verify from the same bundle, re-run the acceptance rehearsals, and quarantine the current address.

Awaiting separate owner approval. The current accepted contract `0x535dDDA826142AC42cE288154e9595f080940aE9` stays live and untouched; no mainnet action.
