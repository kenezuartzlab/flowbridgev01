# Voter Rewards — Dedicated Payout Wallet

## What users will see
On the Ecosystem Ranking page, under the FlowBridge card:
- **Top 25 FlowBridge voters** (shortened addresses, vote count, this week/month).
- **Your votes & rewards** after connecting: votes cast, estimated share, FLOW ready to claim, and one **Claim FLOW** button.
- Plain notice: rewards are paid only if BOT Chain actually pays FlowBridge; small amounts can be left to build up.

## How it works
1. **Vote recorder** — reads BOT Chain's heat-rank vote contract on BOT Mainnet for votes to project 919 and stores each one (wallet, votes, block, tx). Before every period close it re-checks the contract address against the one BOT Chain's site uses; if it changed, accounting stops and Ops is alerted.
2. **Period close (Ops, one approval)** — when BOT Chain's reward arrives, Ops enters the received BOT amount. The system takes 50%: 25% split across the Top 10 by votes, 25% split across all others by votes. BOT is converted to FLOW at the BDEX BOT/FLOW price snapshot taken at close (shown with the result). Ops approves once; balances are credited.
3. **Claim** — the user signs a short ownership message (no gas). The server checks the balance, then the dedicated payout wallet sends FLOW to that same address. The user pays nothing; balances accumulate until claimed.

## Payout wallet safety (required because the key lives on the server)
- New EOA used only for voter rewards; key stored as an encrypted project secret, never in code or logs.
- Keep only a small float in it (e.g. one period's payouts); refill manually.
- Per-claim cap, daily total cap, and a kill switch in Ops (default OFF until you turn it on).
- One claim at a time per wallet, with the balance deducted before sending and restored only if the transfer is proven failed — no double payment.
- Minimum claim amount (you choose) so dust doesn't waste the wallet's BOT gas.

## Decisions I need
- Minimum claim amount (suggest 10 FLOW).
- Per-claim and daily caps (suggest 5,000 / 20,000 FLOW).
- Note: since the payout wallet sends the transaction, **FlowBridge pays the BOT gas**, not the user. If you'd rather users pay gas, they'd need a contract — which you've decided against for now.

## Technical details
- Tables: `vote_events` (unique tx+log index), `vote_periods`, `voter_balances`, `voter_claims` with RLS (public read of aggregated top-25 view only; own balance via binding).
- Indexer: scheduled server route scanning logs from last processed block; idempotent.
- Payout: server function with viem, ownership proof via existing `ownershipMessage.ts` / wallet-proof challenge; atomic RPC to reserve balance; receipt confirmation before marking paid.
- Secret: `VOTE_PAYOUT_PRIVATE_KEY` via secure form; payout address shown in Ops for funding.
- Tests: share split (top 10 / rest), price conversion, caps, double-claim, contract-address change halts close.
