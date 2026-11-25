# V1.13 — frozen local community-review candidate; NOT deployed, NOT independently audited

Identical to V1.12 except the constructor now rejects WBNB, USDT or the Pancake router as `guardian` or `feeRecipient` (AF-03 + invalid-guardian guardrail). Runtime bytecode length is unchanged; wire ABI is identical. Any ordinary address, including a future Safe multisig (whose signers can rotate without new Solidity roles), remains accepted as guardian.

Source diff: `docs/security/bnb-v113-source.diff`. Reproduce: `bun contracts/candidates/bnb-swap-adapter-v1-13/scripts/compile.mjs`; `bunx vitest run contracts/candidates/bnb-swap-adapter-v1-13 contracts/audit/bnb-v113-community`; `bun contracts/audit/bnb-v113-community/mutation-run.mjs`; `nix shell nixpkgs#foundry -c bun scripts/bnb-v113-fork-rehearsal.ts`.

Six HIGH Slither reentrancy-balance alerts remain OPEN (static alerts, no exploit reproduced). minNetOut/snapshot are caller-supplied, not an oracle. No guardian, treasury or fee chosen. No deployment, funds, signing or activation.
