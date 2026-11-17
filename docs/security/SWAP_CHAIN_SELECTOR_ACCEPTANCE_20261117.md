# Compact BOT/BNB selector acceptance

2026-11-17 UTC · preview only · HOLD · starting commit f1b3a8c3ecde0ea2cf48c8af4f2a0556d31f30a6

## Completed first gate
- Latest actual SwapWorkspace, SwapChainPicker, UniversalSwapCard and viewContext reviewed. Selector is presentation-only; BOT execution card unmounts for BNB, draft and DEX hints clear on switch, BOT returns with fresh generation. BNB cannot resolve BOT V4 or the existing execution registry.
- Full suite: **251 files / 2,590 tests PASS** before V1.2 work.
- Existing actual-preview script: **640 assertions / 20 cases PASS**, 320/360/390/430/1280 × light/dark × normal/reduced motion. Header measured 32px; form starts 48px below heading top, unchanged in both views. Picker target ≥44px. Flat five-tab geometry identical across switches; no new header row. Keyboard focus trap, Escape/return focus, draft clearing, no BNB execution controls and no browser send/sign/switch/nonce requests tested.
- First run hit an unopened popover while the newly resumed dev server was still optimizing/hydrating; independent rerun passed all 20 cases. No application correction needed for that transient result.
- Screenshots and structured measurements are generated under `/tmp/browser/chain-selector`; final V1.2 checks will tighten the heading assertion from tolerance to exactly 32px.

## Honest limitations
No physical wallet/mobile keyboard, signed-out-to-connected rejection/signing flow, actual safe-area device or hosted production pipeline acceptance is claimed. Browser checks exercise the real public preview, not a funded trade. Ad/nav local fixture regressions run separately without saved settings changes. Manual project build/type commands are prohibited by the harness workflow; only available automatic signals can be reported. No quality-superiority claim over other DEXes.

No production publication, configuration, chain/contract/fee/reward change or transaction. All inherited HOLD gates remain.

## Final V1.2 recheck
**640 selector assertions / 20 cases PASS** with exact 32px height (no tolerance on height); keyboard assertion waits for completed close autofocus before checking trigger focus. Final full suite **252 files / 2,633 tests PASS**. **320** BNB inspection, **3,786** dock/nav and **560** page-placement checks PASS, total **5,306** browser assertions including selector. Automatic compilation build OK; standalone typecheck/hosted pipeline remain unverified. Detailed source/evidence/limitations: `BNB_SWAP_V1_2_READINESS_20261117.md`.