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

- CA/BOT and Any pair use UniversalSwapCard for live quoting, review and execution; fixed-pair mode does not overwrite the Any pair draft. Why: separate display quotes drifted from executable routes.

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

- Reward progression toward the claim minimum is computed only in src/lib/rewards/rewardProgression.ts (pure) and resolved caller-scoped server-side in rewardProgression.server.ts via /api/rewards/progression; the next-best-action is decided only in src/lib/growth/nextBestAction.ts from those server facts. Why: client-side progress or recommendations must never be fabricated.

- Reward/claim/settlement rules live in src/lib/rewards/AGENTS.md. Why: keep root notes small.
- Referral display explanations use referralPresentation.ts and recorded award evidence without awarding or inferring claimability. Why: a missing historical bonus is not necessarily a pending bonus.
- Wallet connection choices, WalletConnect kill switch (VITE_WALLETCONNECT_ENABLED, fails closed), error normalization and the WALLET_BINDING message live only in src/lib/wallet/; binding is a separate explicit signature validated server-side for domain/origin/account/nonce. Why: connecting must never sign, and WalletConnect must never break boot.
- Sign-in setup and Profile reuse BindWalletCard for explicit ownership binding and canonical state refresh. Why: separate legacy linking paths cannot bypass or drift from verified binding.
- The client build resolves `events`/`node:events` to the npm `events` polyfill via a Vite plugin in vite.config.ts. Why: the default browser stub breaks WalletConnect ("EventEmitter is not a constructor").
- Public documentation inventory lives in src/lib/contracts/productionRegistry.json with chain-scoped deployment/config parity tests; private application answers and evidence are served only after the admin gate, never embedded in public client bundles. Why: keep contract facts current without exposing application strategy or owner inputs.
- Launch preparation is served through the existing admin gate; source evidence and screenshots use the private application-materials bucket, and launchTracker schema rejects window activation. Why: preparation must not publish drafts or manufacture qualification.
- Shared BOT network badges and the root public footer own ecosystem branding; the badge follows the selected product network. Why: avoid duplicate branding and false Mainnet labels on Testnet.
- Which functions exist on Mainnet vs Testnet is decided only in src/lib/network/environmentCapabilities.ts; UI hides, transaction senders and API routes enforce. Why: separation must hold beyond the UI.
