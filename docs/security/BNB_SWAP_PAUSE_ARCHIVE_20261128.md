# PRIVATE — BNB Swap owner pause and publication embargo

Status: **OWNER PAUSED / PUBLICATION EMBARGO / NO-GO**. Recorded 2026-11-28 UTC. This is an internal developer record, not an audit certificate, deployment record or public product announcement. Keep this document, evidence and candidates outside public assets and application imports.

## Owner instruction and authority

> “We are adding an autotrade feature on separate workspace that has work in progress. This bnb swap feature must be put on hold and must never be applied when we published whatever this pending/changes updates in dev mode must never be published, revert if needed but make sure to document whenever we decide to fully implement this later.”

This decision overrides all earlier BNB Swap readiness, preview, quote-diagnostic and future fee planning. Unrelated future publishes must not ship the paused BNB Swap experience. Only new, explicit owner approval can lift it; no environment variable, URL, admin session, chain switch or stored state may do so. No production publish is authorized by this removal task.

- Before embargo: `5d67217a73e63ab1f9d9364cc080d683f2f30b63`.
- After source freeze: recorded below in the final verification addendum; recover the exact commit with `git log --format='%H %s' -- scripts/check-bnb-swap-embargo.mjs src/lib/bnb/bnbSwapEmbargo.ts`.
- This project also contains AutoTrade commits beginning `cb8517d3`, followed by V1.1 `fdb3d565` and V1.2 `2c59e67e`. **No history rollback was performed.** AutoTrade source, API, worker, signals, limits and historical CaSwap correction work are preserved.

## What is paused and how the release is fenced

1. `src/lib/bnb/bnbSwapEmbargo.ts`: literal `BNB_SWAP_PUBLICATION_EMBARGO = true`, reason `OWNER_PAUSED_FOR_AUTOTRADE_WORKSPACE`, `BNB_EXECUTION_ENABLED = false`, `LAUNCH_HOLD = true`; no runtime override or transport. Existing review/readiness modules import these constants. Launch gate explicitly includes the owner pause and can never return GO.
2. Public `/trade` and `/` use BOT-only `SwapView` 677/968 in `src/lib/swap/viewContext.ts`. `SwapChainPicker` consumes that inventory. `SwapWorkspace` no longer imports or renders BNB research, a BNB placeholder, fee preparations or an RWA quote lead-in. Invalid legacy chain state is normalized to the current BOT context; its draft/DEX hint is cleared and the execution card is not mounted until invalidation. A wallet connected to BNB is not a BOT signing authorization. Existing canonical execution registry has no BNB swap deployment/approval target.
3. `/api/admin/bnb-0x-price` is an unconditional all-method 410 tombstone with no auth, request-body, vendor, fee, secret or RPC import. A signed-in administrator cannot resume it. The 0x secret is neither read nor removed; offline historical collector code remains private. No quote vendor was contacted by the retired handler checks.
4. `scripts/check-bnb-swap-embargo.mjs` uses TypeScript syntax trees to inspect executable imports, the BOT-only view/registry/capability inventories, tombstone handlers, constant policy and deployment/public artifact paths. It rejects archived quote/fee/candidate modules in emitted graphs. CI `.github/workflows/bnb-swap-embargo.yml`, package `build`, `build:dev`, `release:check` and Vite `buildStart` enforce it; Vite `generateBundle` checks actual emitted module identities and the client output. Direct Vite builds cannot simply bypass the package precheck. Preview middleware denies guessed archived BNB Swap `/src`, `/@fs`, contract and BNB-security-document URLs, plus the retired endpoint before vendor work. General BNB names are not forbidden.
5. The route-tree may contain an inert path for the **410 tombstone**. That metadata is not a quote diagnostic, callable vendor client or enabled feature; do not remove the tombstone or mistakenly treat this inert path as activation. Actual client vendor callers and archived modules are forbidden.

### Publish boundary and limitations

The firewall is a source/build gate, not a remote Lovable account permission or production kill switch. This task does **not** publish, unpublish, change project visibility, change secrets or change live configurations. No production deployment was attempted to prove the hosting mechanism. The CI workflow is saved, but hosted execution and branch-protection enforcement are not verified or configured in this task. Platform-controlled prebuilt deployment reuse, code changes which remove the guard, or an older already-published revision remain outside this source gate; an owner/release reviewer must require the guarded revision and successful build before any later publish. No security control can survive an explicitly authorized source change that deletes it. Do not claim the existing live site already has this removal.

Read-only observation on 2026-11-28: `https://flowbridge.space/trade?chainId=56#swap` still showed **BNB Mainnet · 56 / Preview · swaps unavailable** in its picker. That is an old public placeholder, not proof of BNB execution or a deployed adapter. It remains on the unchanged published version because the owner forbids publication in this task. Removal from that old live version requires a separate explicit publish authorization.

## Preserved scope exceptions

- BOT Mainnet/Testnet trading, execution registry entries and Router V4 source/addresses are unchanged.
- BOT↔BNB USDT bridge, receipts/tracking and existing BNB bridge controls are unchanged. No actual bridge transfer was sent.
- BNB MultiSend network and its previously verified deployment remain unchanged: chain 56, contract `0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e`. No MultiSend transfer was sent.
- Wallet chain identifiers, BOT/BNB network assets/logos, flat mobile navigation, ad docking, rewards, generic independent RWA research and unrelated admin functionality remain unchanged. Only the BNB Swap-specific Trade lead-in was removed.
- AutoTrade remains as it was at the starting head; this request does not grant its live execution, accounts, funding, signing or publication.

## Reversible development inventory

No frozen Solidity, tests, compiler artifacts or historical owner records were deleted or rewritten.

| Reference | Preserved location / identity |
| --- | --- |
| Frozen V1.13 | `contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol` |
| Source SHA256 | `5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425` |
| Compiler/ABI/immutable references | V1.13 `MANIFEST.json`, `scripts/compile.mjs`; solc `0.8.38+commit.1835d247`, optimizer 200, Cancun |
| Earlier frozen candidates | `contracts/candidates/bnb-swap-adapter-v1*` and their original manifests/tests |
| V1.12 external-review packet | `contracts/audit/bnb-v112-external/`, original freeze/source and submission records |
| V1.13–V1.17 community/governance/fee reports | `docs/security/BNB_V1_13*` through `BNB_V1_17*`, and `docs/security/BNB_BOT*`/`docs/security/bnb-bot-v4-parity/` where present |
| Review/readiness/dry-run policies | `src/lib/bnb/executionReviewPolicy.ts`, `launchReadiness.ts`, `walletDryRun.ts`, `feePolicy.ts` and their tests (not imported by public Trade) |
| Archived quote UI | `src/components/routetabs/swap/BnbQuoteInspection.tsx` — retained, not runtime-imported, denied by preview source middleware |
| Quote collectors/research | `scripts/bnb-*`, `src/lib/bnb/zeroExPrice(.server).ts`, `quoteAdapter.ts`, original comparator/fork evidence |
| New embargo checks | `scripts/bnb-swap-embargo.test.ts`, existing `src/lib/swap/viewContext.test.ts` and readiness tests |
| Reproduction inventory | `docs/security/bnb-swap-pause-evidence/preserved-hashes.json` |

### Historical future-only economics and governance

The owner previously proposed/selected **5 bps (0.05%) output-side economics** for a future BNB adapter. It is historical planning **only**, not a current fee, payable configuration, deployed recipient, spending permission or activation approval. The pause overrides any implication of readiness.

- Proposed direct-EOA Guardian: `0x351E236a636c8be4Fa0B602cb096d72346D1a412`.
- Proposed direct-EOA Treasury: `0xb7322660B40561ae7C224F963e51583e923F7fC8`.
- Original V1.17 decision: `docs/security/BNB_V1_17_OWNER_FEE_SELECTION_20261126.md` and `src/lib/bnb/feePolicy.ts`.
- Prior read-only empty-code observations do not prove ownership, custody, present balance, issuer clearance or future suitability. Do not reuse them as current deployment authorization.

### Security warnings are not closed by this pause

Six Slither HIGH findings remain historically open and unsuppressed; no independent signed human security report or human sign-off exists in this task. Physical-wallet/device acceptance is unverified. WalletConnect/Zod risk and the earlier fail-closed WalletConnect hold remain recorded in the V1.14–V1.17 reports; this task does not rerun a dependency audit or certify those issues resolved (the installed top-level package version alone cannot resolve a transitive risk). EOA risk acknowledgment, governance/control evidence, treasury issuer restrictions, current chain observations and independent audit still require review. No verified deployed BNB Swap adapter address exists in the application registry or preserved candidate manifest. No BNB contract deployment, approval, wallet signature, payment, fee activation or RWA trading was performed.

## Later opt-in restoration — separate branch/workspace only

1. Obtain a new written owner instruction explicitly lifting **BNB Swap publication embargo** and specifying the separate workspace/branch. Copy private history/inventory there; do not revert this project's entire history or restore UI merely because AutoTrade/BOT updates are being published.
2. Compare source and artifacts against this exact V1.13 hash and preserved manifests. Any Solidity change requires a new candidate directory, compiler reproduction and a new review identity; never edit a frozen candidate.
3. Refresh governance/EOA identity and control/risk acknowledgments, fees, issuer restrictions, dependency and wallet compatibility, route economics and on-chain evidence. Historical approvals cannot substitute for refreshed authorization.
4. Obtain an **independent human security audit** and exact-source signed conclusions; close or explicitly assess the six HIGH findings without suppression. AI/community analysis is not certification.
5. Run full unit/adversarial tests, local fork simulations, bundle/privacy gates and real-device tests with documented results. Any future funded canary requires separate explicit authorization, caps and its own plan; no mock/local test is deployment permission.
6. Obtain separate deployment/registry/funding/fee/signing approvals and a deliberate publish approval. Only then intentionally revise the source embargo, endpoint and build allowlist on the approved separate workspace/branch. Review the exact release diff and recheck AutoTrade/bridge/MultiSend boundaries.

## Verification addendum

Results and exact source-freeze commit are finalized below after the checks finish. Reproduce without financial action:

```text
node scripts/check-bnb-swap-embargo.mjs
bunx vitest run scripts/bnb-swap-embargo.test.ts src/lib/swap/viewContext.test.ts src/lib/bnb/launchReadiness.test.ts --maxWorkers=2
bunx vitest run --maxWorkers=2
```

A later authorized release uses the guarded `build` command; do not publish just to verify this pause. Vite's emitted-module gate is installed, but no production publish has been performed here.

### Observed verification (2026-11-28 UTC)

- Full suite run after registry/route firewall strengthening: **296 files, 3,679 tests passed**. The final run includes the additional actual Vite-hook mutation test; see acceptance evidence for its final total.
- Focused policy/readiness/freeze checks: **75/75 passed** in five files; final firewall suite **32/32 passed**, including 14 source mutations, new public/deployable artifact mutations and emitted-module mutations.
- AutoTrade engine/V1.1/V1.2 tests remain untouched and passed **81/81**; existing CaSwap offline tests also passed. No AutoTrade runtime changes.
- Chromium: BOT-only picker, BOT 677→968→677 switching, BNB deep-link denial, no archived quote module requests, 32px heading and no horizontal overflow at **320/360/390/430/1280**; no page errors. Flat navigation/ad source unchanged. Home, Explore, `/` and direct Trade BNB hints did not expose BNB Swap.
- BNB bridge controls and BNB MultiSend selection verified visibly; no financial transaction sent, and real-device/actual-transfer acceptance is not claimed.
- Unsigned direct GET/POST/PUT/PATCH/DELETE/HEAD: **410**. Real signed-in Ops session GET/POST: **410**, zero browser vendor calls. **OPTIONS is intercepted by framework CORS and returns empty 204**, despite the route's 410 handler; no quote data/vendor/signing work occurs. This is a preflight exception, not a feature bypass.
- Seven guessed archived source/document/collector URLs returned **410**, including the frozen contract and quote adapter.
- Automated preview build signal: **build OK**. Manual production build/typecheck was not run because this environment reserves these for the platform harness; emitted production closure is enforced by the installed Vite hook, but no production release artifact or hosted CI run was produced/verified here. This limitation is explicit rather than claiming a manual release build passed.
- Frozen V1.13 SHA256 unchanged; private inventory contains **141** preserved file hashes. No secret value printed, read, changed or removed by embargo code.
