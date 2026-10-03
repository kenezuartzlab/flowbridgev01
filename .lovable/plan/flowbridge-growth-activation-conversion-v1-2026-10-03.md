# FlowBridge Growth Activation + Conversion V1

App and product work only. No contract, fee, router, staking, rewards, MultiSend or FLOW Token changes. Mainnet liquidity writes stay disabled. CaSwap add/create stays UNAVAILABLE — LP_NOT_ALLOWED. No practice swaps.

## What already exists and will be extended, not replaced
- Activation states (public / email unverified / wallet unbound / requirement missing / active mission / ready), post-action prompt limits, onboarding overlay, notifications, earn paths, staking calculator, ecosystem discovery, the V26 journey resolver ("For you now"), and the Operations dashboard with product events.

## Phase 1 — One next action (sections 1, 2, 5, 10, 11)
- Add one pure `resolveNextAction(state)` that returns exactly one main action. Persona order: active mission → email unverified → wallet unbound → ready with no confirmed trade ("Make your first FlowBridge trade") → liquidity user ("View positions") → staker ("Check staking position") → campaign user ("Continue eligible activity") → trader ("Explore another ecosystem feature"). Public visitors get "Explore FlowBridge".
- Personas come only from confirmed records: receipt-confirmed swaps, on-chain positions, stake reads, campaign records.
- Home shows one main button, plus at most one secondary text link. Verification cards only show while that step is still missing.
- First Trade card explains: pick tokens, Auto finds routes, DEX and number of transactions shown, your wallet signs, funds stay in your wallet. Button: "Find a route". No token is preselected.
- Mission view shows DONE / NOW / NEXT, built from verified evidence only. A trade step completes only after a confirmed receipt.

## Phase 2 — Public value and first-use journey (sections 3, 4, 16, 17)
- "Why FlowBridge?" section for signed-out visitors. It presents FlowBridge as the smart layer above BDEX and CaSwap, not a replacement for them.
- The onboarding overlay becomes: Welcome → Explore → Trade → Earn → Support BOT Chain → Personalize. You can skip it and pick it up again later. It never forces a wallet or a transaction, and it gives no completion reward.
- Discover cards answer: What is it / Why use it / What do I need / What happens next. Real items only. No trending badges, no countdowns.
- Learn articles each end with one safe action, for example concentrated liquidity → BDEX V3 liquidity, staking → staking products, atomic trade → Smart Trade.

## Phase 3 — Route education and no-route recovery (sections 6, 7, 12)
- Every quote shows an ATOMIC — V4 or STAGED label, with a text label as well as a color. Alongside it: DEX, route, number of transactions, FlowBridge fee, pool fees, minimum received and price impact. A "Why this route?" button opens Smart AI with the route facts already filled in.
- The no-route panel lists the DEXs checked, whether a direct pool exists, and whether a multi-hop path exists. Actions: Try Auto, View liquidity, Another pair, Learn. "Add liquidity" or "Create pool" appear only when the venue supports them on Testnet. CaSwap shows the LP_NOT_ALLOWED restriction.
- Smart AI rules gain a growth section: explain things and suggest the next step from your verified state. It never guarantees profit, never predicts prices, never invents pools or eligibility, and never pressures.

## Phase 4 — Earn and staking (sections 8, 9)
- Earn has four separate sections: Liquidity Fees, Staking, Campaigns, FLOW Points. Each shows what it is, who can use it, the action needed, your current verified state and the next step. There is no combined APY. FLOW Points are never called cash or guaranteed.
- Staking shows only products that are actually available, using rate, lock, capacity and maturity read from the contract, plus a note explaining how returns are calculated.

## Phase 5 — Re-engagement, sharing, referral (sections 13, 14, 15)
- New in-app notifications come only from verified events: verification still pending, binding still pending, transaction confirmed, position status changed, staking maturity within 7 days, and a route that has become available. Dismissed reminders stay suppressed, and each reminder type has a frequency limit.
- Share links for FlowBridge, Learn pages, campaigns and achievements. Referral uses a random `?ref=` code that counts visits in aggregate only. There is no referral reward and no promise of one.
- Share cards are opt-in. Email, full wallet address, balances, reward amounts and transaction amounts are excluded by default. There is a preview before you share.

## Phase 6 — Conversion, drop-off, signals, experiments (sections 18–21)
- A conversion funnel on the Operations page: Visitor → Explore → Wallet connect → Account → Verify email → Bind wallet → First quote → First review → First submitted → First confirmed → First Earn exploration → Repeat. Every stage is counted from specific events, never from page views.
- Each stage shows entered, completed and abandoned. Failures are split into user cancelled (for example, a rejected wallet signature) and technical failure (for example, an RPC error).
- An "Observed signal → possible product action" list built from simple threshold rules. It only gives advice and never changes anything automatically.
- An experiment registry limited to copy and layout: CTA wording, education order, card placement, onboarding flow, explanation format. Assignment hashes the random browser session id. Any experiment touching fees, slippage, approvals, router choice, wallet permissions or security is rejected when the registry loads, and a test enforces this.

## Phase 7 — SEO, mobile, accessibility (sections 22–24)
- Every public page gets a unique title, description, Open Graph tags and a canonical URL. The sitemap lists public pages only. `/ops`, `/admin`, `/account`, `/wallet` and the private application materials get noindex and stay out of the sitemap.
- Playwright checks at 390px: Home, onboarding, verification, binding, Swap, route review, Earn, Discover, Learn, Mission, notifications and share card. Checks cover overflow, hidden buttons, clipped dialogs and reduced motion.
- Accessibility pass: labels, focus rings, keyboard order, contrast, and text alongside every color-only status.

## Tests (section 28)
- New tests cover: each activation state, the one-action logic, the verification and binding funnels, the first-trade journey, mission progress, no-route recovery, Earn sections, notification suppression, referral privacy, share-card privacy, experiment boundaries, SEO exclusions, and mobile/reduced motion through the Playwright script.
- Re-run the full app suite (target: more than 1,414 passing) and the 13 liquidity math tests separately. Typecheck and build must be clean.

## Technical details
- New pure modules: `src/lib/growth/nextAction.ts`, `missionProgress.ts`, `referral.ts`, `shareCard.ts`, `experiments.ts`, `src/lib/ops/conversionFunnel.ts`, `growthSignals.ts`, `src/lib/seo/publicPages.ts`. Each has its own tests.
- New product event names are added to the existing category-level allowlist. They never carry wallets, emails, amounts or AI text.
- Records an AGENTS.md rule: the dominant next action is decided only in nextAction.ts.

## Final report
Every field from section 30 will be reported. Any item I cannot verify without your phone or wallet will be marked BLOCKED, never PASS.
