# Smart Trade + Liquidity V1 — Completion Gate

Router V4 (0x7965…fc61), its Lens and Router V3 stay frozen. No contract is deployed, changed or registered. No liquidity is added or removed on BOT Mainnet. All liquidity practice runs happen on BOT Testnet 968, using the approved practice wallet 0x8512…f3dD.

This gate is too big for one pass, so the work is split into five phases. Each phase ends with tests, a code check and a build, and gets its own PASS/FAIL notes in the roadmap. The final report uses the exact format you asked for.

## Phase 1 — Read-only checks (no writes)
- Read the live CaSwap router, factory and pair contracts on BOT Mainnet. Check for `addLiquidity*`, `removeLiquidity*`, `createPair`, `getPair`, the LP token, the caWBOT/WETH value, fees and reserves. This gives the CaSwap capability matrix (SUPPORTED / NOT SUPPORTED).
- Confirm the BDEX V2 router and factory on 968 and 677. Read their actual code rather than trusting the function names.
- Read the enabled V3 fee tiers from the factory (`feeAmountTickSpacing`) on each chain while the app runs. Anything that returns 0 is hidden, so 0.01% never shows.

## Phase 2 — Liquidity engine (pure logic + tests)
New `src/lib/liquidity/` module, with one adapter per venue (BdexV2, BdexV3, CaSwap). Each adapter states only what it can actually do.
- V2: pair lookup, reserves, ratio quote, minimum amounts, LP balance and share, removal estimates, deadline. Works for token+token and BOT+token.
- V3: tick/price math, full-range ticks aligned to tick spacing, range checks, discovering position NFTs (`balanceOf` / `tokenOfOwnerByIndex` / `positions`), current tick from `slot0`, in-range status, and unclaimed fees by simulating `collect` with static calls.
- Create Pool: duplicate check, address/order/decimals checks, fee-tier check, price conversion to `sqrtPriceX96`, and the reciprocal price.
- AI Suggested ranges (Wide/Balanced/Narrow) built from the live tick plus tick spacing. Each comes with notes on concentration and out-of-range risk. If no pool data is available, no range is offered.
- Token safety check before every write: a probe transfer on the 968 rehearsal confirms exact balance changes. Anything that doesn't add up is rejected.
- Exact approvals only. The spender is checked against the verified record. The approval is reset to 0 after the transaction if anything is left over.
- Tests for every case in section 21: insufficient balance, slippage, expired deadline, approval failure, duplicate/nonexistent pair, unsupported tier, invalid price, out-of-range display, failed simulation, CaSwap with no BDEX substitution.

## Phase 3 — Screens
`/liquidity` gets four tabs: Add, Remove, Create Pool, My Positions. `/earn` gets real sections.
- Add flow: DEX, Pair, Version, Amounts, Range (V3), Review, Approval, Signature, Confirmation. Review shows wallet balances, minimum amounts, slippage, gas, the approvals list and the spender.
- Remove flow: LP balance, % or custom amount, expected and minimum amounts for A and B, deadline, gas.
- V3 position actions: Increase, Decrease, Collect, and Burn (only when the position is empty and fees are collected).
- Create Pool: shows both "1 A = X B" and "1 B = Y A", with a required acknowledgement checkbox.
- My Positions grouped by BDEX V3 / BDEX V2 / CaSwap, with no combined value across them.
- Earn sections: Liquidity Fees (real unclaimed amounts), Staking, Campaigns and FLOW Points, kept separate. No APR or APY anywhere.
- "No liquidity route yet" panel on Swap, with connectivity facts and links to View liquidity options / Create Pool / Add Liquidity. New pools are found from the factory as they appear, not from a fixed list.
- Smart AI context for Swap and Liquidity, built only from verified route and pool data (why V3, why staged, the FlowBridge fee vs the pool fee, V2 vs V3, ranges, impermanent loss, collecting fees).

## Phase 4 — Activity + lifecycle
- New activity types: Routed Swap, Add/Remove/Increase/Decrease Liquidity, Collect Fees, Create Pool. Each records network, DEX, tx hash, pair, amounts, tokenId and pool.
- Status steps: Preparing, Approval Required, Waiting for Signature, Submitted, Confirming, Confirmed, Failed. An action is marked Confirmed only after a successful receipt.
- Staged routes are grouped as one operation, and every tx hash is kept.

## Phase 5 — BOT Testnet practice runs + acceptance
- On 968 with small testnet amounts: V2 add, V2 remove, V3 mint, increase, decrease, collect, burn, and one Create Pool between two test tokens that have no pool yet. Every tx hash is recorded.
- Phone-size checks at 390px (screenshots of every Trade and Liquidity screen and modal, the keyboard, the bottom bar, no sideways scrolling), plus reduced-motion checks.
- Re-run the existing safeguards: the V4 atomic BOT routes (flags unchanged), V3 routes, direct CaSwap trades, Bridge, MultiSend, Staking, Rewards, the connect-wallet no-approval rule, the 30-day staking rule and the FLOW/USDT price-impact fix.
- Full test suite (above 1,319), liquidity-math tests 13/13, code check and build.
- List the Mainnet liquidity canaries still needed (V2 add/remove, V3 mint, increase, decrease, collect). None are run without your approval.

## Technical notes
- V3 PositionManager 0xDAc3…0090 and the factory are already verified on both chains. Testnet V2 addresses come from `dexVerification.ts`. Mainnet V2/CaSwap addresses get re-checked in Phase 1.
- Execution routing stays in `executionCapability.ts`. The liquidity code never touches the swap flags.
- Possible blocker: if the practice wallet lacks testnet tokens for a pair, Phase 5 uses the existing MSTT test token. If even that is missing, the step is reported as BLOCKED rather than faked.
