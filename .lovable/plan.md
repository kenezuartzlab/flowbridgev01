# FlowRewards claim system — read-only audit report

No code, database, settings, roles or chain state were changed. Approving this card does nothing: it holds a report, not work to do.

## 1. Live contract (BOT Mainnet 677) — read at block 28,493,786 (2026-10-30 10:06 UTC)

Address `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922`, chainId 677, 6,629 bytes of runtime code, codehash `0xede190b8…af640`.

Function selectors found in the live code: `claim(uint256,uint256,address,uint256,bytes32[])`, `publishEpoch`, `releaseExpiredEpoch`, `recoverFree`, `leafHash`. Selectors not found: the old EIP-712 `claim(address,uint256,uint256,bytes)`, `batchClaim`, `multicall`. So the live contract is **FlowRewardsMerkleDistributor**, not the old FlowRewardsDistributor.sol (which used owner-signed EIP-712 claims). Full bytecode match was **not** proven: the codehash recorded in the repo (`0xd7d4…`) is different, most likely because of constructor immutables, and I did not recompile.

| Value | Live |
|---|---|
| epochCount | 4 |
| totalReserved | 1,090 FLOW |
| totalClaimed | 1,133 FLOW |
| freeBalance | 2,497,777 FLOW |
| campaignBudget | 2,002,011 FLOW |
| minPublishDelay | 86,400 s (24 h) |
| paused | false |
| recoveryRecipient | 0xeFc13d1A…9Ea4 |
| token | 0xcaaB50F3…17fF |

| Round | Allocation | Claimed | Window (UTC) |
|---|---|---|---|
| 1 | 1 | 1 | Sep 1 – Oct 1 (ended, not released) |
| 2 | 10 | 10 | Oct 8 – Nov 7 |
| 3 | 1,122 | 1,122 | Oct 26 – Nov 25 |
| 4 | 1,090 | **0** | Oct 28 18:00 – Nov 27 18:00 (**open now**) |

No round is cancelled or released.

Roles, taken from RoleGranted logs plus a live `hasRole` check. All were granted at block 21,502,392 and there are no revocations:
- DEFAULT_ADMIN_ROLE and BUDGET_MANAGER_ROLE: 0x88A4CC1F…9507
- PUBLISHER_ROLE: 0x971E7790…3f94
- PAUSER_ROLE: 0x1Ce0b1DF…59eF

The contract does not support role enumeration, so the log scan is the only source for this list.

## 2. How `claim()` works (source checked against the selector)
- **Anyone can call it.** There is no `msg.sender == account` check, and the source comment says "Anyone may submit the proof".
- The FLOW always goes to the `account` in the leaf, using `safeTransfer(account, amount)`. A relayer cannot redirect it.
- No user signature is needed. The only checks are the Merkle proof, the claim window, pause, the claimed bitmap and the round allocation. The leaf commits to chainId, the distributor address, epoch, index, account and amount.
- There is no fee. Claiming costs BOT gas only, paid by whoever sends the transaction. A wallet with zero BOT cannot send it itself, but anyone else could send it on its behalf.
- **Gas sponsorship without changing the contract is possible.** A backend relayer could call `claim` with the published proof and the FLOW would still land in the user's wallet.
- The app's claim button checks that the connected wallet equals the leaf account before sending (MainnetFlowClaimCard). This is a choice in the app, not a rule in the contract.
- Getting proofs: `GET /api/public/reward-rounds?wallet=0x…` needs **no sign-in or wallet binding**. It returns only that wallet's leaf and proof, and only for rounds whose stored root matches the live chain root. Anyone who knows an address can see its amount and proof. That is a privacy exposure, not a theft risk, because funds can only go to the leaf account. I saw no per-request rate limit in that route.
- There is no `batchClaim`. Each round needs its own transaction.

## 3. The end-to-end path
Earning → evidence verification → funding check and reservation done off-chain inside the app → automatic approval (an off-chain record, default OFF) → a frozen approved batch → **one manual on-chain `publishEpoch` signature by the PUBLISHER wallet** → a delay of at least 24 h before claims open → 30-day claim window → individual claims → after the window ends, `releaseExpiredEpoch` can return unclaimed FLOW to free balance.

- Automatic approval is not on-chain publishing. "Funded" in the app means an off-chain verification and reservation; no tokens move until publication. That is why funded Points show 0 claimable until a round containing them is published and opened.
- Minimums: historical rounds 1–3 kept the 1,000 FLOW policy, with a canary exception in round 2 for one wallet and 10 Points. From round 4 on, `MIN_OPS_CLAIM_FLOW = 1` (`settlementMinimum` = 1). The contract enforces no minimum.

## 4. Lifecycle details
- **Cancel** (`cancelEpoch`, BUDGET_MANAGER): only works before the claim window opens; it releases the reservation.
- **Pause** (PAUSER): blocks publishing and claiming. Only DEFAULT_ADMIN can unpause.
- **Expiry**: after `claimEnd`, claims revert. `releaseExpiredEpoch` (BUDGET_MANAGER) must be called by hand to release what is left.
- **`recoverFree`** (DEFAULT_ADMIN): can only move tokens above `totalReserved`, and only to recoveryRecipient.
- **Budget**: at publication, `totalClaimed + reserved` must be at most `campaignBudget`, and the token balance must cover the reservation.
- **Double claims**: each (epoch, index) has a bit that is set before the transfer, and `claim` and `recoverFree` are nonReentrant. A second claim of the same leaf reverts with AlreadyClaimed.
- Unclaimed rewards do **not** roll into a new round automatically. They would have to be released and then put into a new batch by hand.
- One wallet can claim in several rounds, one transaction per round.
- Round 4 is open now, and none of its 1,090 FLOW has been claimed yet.

## 5. Safe simplifications, ranked
1. **One-screen claim with every claimable round** (lowest risk, no contract change). Show all open rounds, then send one wallet transaction per round in sequence behind a single "Claim all" button. Add optional reminders before the window ends. Keep the check that the connected wallet equals the leaf account.
2. **Gas-sponsored claim through a relayer** (contract supports it as is). The backend pays BOT gas and the FLOW still goes to the leaf account. Costs and conditions: a funded hot gas wallet (the one key that has to be stored, and it controls gas only), throttling per wallet and per day, and a budget alarm. It does not touch the publisher key, which stays manual.
3. **A true one-transaction multi-round claim** needs one of these: a new helper contract that calls `claim` for each round (possible because claim is open to anyone), wallet-side batching (EIP-5792 / smart account), or a paymaster. You cannot get an atomic multi-claim from the current contract alone.

Not recommended: automatic publishing with a stored publisher key. You want the publisher signature to stay manual.

Optional privacy hardening: require sign-in plus a bound wallet, or a rate limit, on the proof lookup.

## 6. Code paths inspected
`contracts/FlowRewardsMerkleDistributor.sol`, `contracts/FlowRewardsDistributor.sol`, `src/lib/rewards/useMainnetFlowClaim.ts`, `src/components/rewards/MainnetFlowClaimCard.tsx`, `src/routes/api/public/reward-rounds.ts`, `src/lib/rewards/claimMinimumPolicy.ts`, `src/lib/rewards/publicClaimPolicy.ts`, `src/lib/rewards/flowRewardsRegistry.ts`. Chain reads came from rpc.botchain.ai.
