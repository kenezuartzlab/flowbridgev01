<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Router V4 changes ship as new frozen candidate directories under contracts/production/ (never edit a deployed candidate); app ABIs are generated from the compiled artifact into routerV4Abi.generated.ts and guarded by a parity test. Why: hand-written ABIs drifted from deployed bytecode.
- Route execution class (atomic V4 vs staged) is decided only in src/lib/swap/executionCapability.ts behind per-chain flags. Why: one place controls promotion.
- Liquidity venues live in src/lib/liquidity/ as independent adapters (BDEX V2, BDEX V3, CaSwap); V2-style factories and wrapped-native are always read from the venue's router at runtime. Why: CaSwap Mainnet router's factory differs from the recorded address.
- Per-chain liquidity write availability is decided only by LIQUIDITY_WRITES_ENABLED in src/lib/liquidity/liquidityTokens.ts. Why: Mainnet liquidity opens only after separately approved canaries.
- Privacy-safe trade telemetry contains route quality and lifecycle fields only, never wallet addresses, hashes, signatures, amounts, or token metadata. Why: operational monitoring must not become user tracking.
- Production ops/growth analytics are aggregated only in src/lib/ops/ (pure, tested) and served admin-only via /api/admin/ops to the /ops page; events are category-level with random browser session ids, never wallet addresses, emails, amounts or AI text. Why: operational insight must not become user tracking.

- The dominant Home next action is decided only in src/lib/growth/nextAction.ts; conversion/drop-off counting lives only in src/lib/ops/conversionFunnel.ts. Why: one place owns "what next" and funnel truth.
- Indexable pages are listed only in src/lib/seo/publicPages.ts (sitemap source); private pages carry noindex. Why: private surfaces must never leak into search.
- UX experiments are registered via src/lib/growth/experiments.ts, which rejects fee/slippage/approval/router/wallet/contract scopes at load. Why: experiments must never touch safety.
- BOT Mainnet Router V4 reward evidence is decoded only in src/lib/activity/mainnetRouterV4Evidence.ts (pure) and ingested/priced server-side in mainnetRouterV4Ingest.server.ts; unpriceable or non-final swaps get 0-point review rows, never estimates. Why: browser values must never decide economics.
- Reward-processing failures are recorded via src/lib/rewards/rewardDiagnostics(.server).ts into server-only reward_processing_events; economic ledgers are writable only by service_role and profile guard triggers run SECURITY INVOKER. Why: a silent persistence failure and a definer-owner guard bypass previously went unnoticed.
- Reward funding is reserved only through SECURITY DEFINER RPCs (award_signup_bonus, increase_reward_budget) against reward_budgets; only FUNDED ledger rows count toward 1:1 FLOW claims, and the 1:1 claim gate lives in src/lib/rewards/signupBonusPolicy.ts. Why: points equal tokens, so every point must be backed and never derived from profile aggregates.
