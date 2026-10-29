# Verified bridge completion

## Review results
- Bridge completion finding confirmed: the direct-bridge tracker reads source receipts but has no linked destination evidence. It cannot currently show verified delivery.
- The cited auto-approval finding is stale: current per-candidate reads explicitly disable batch persistence. No rewards code change is proposed for that finding.
- Existing focused regression: 62 tests passed across six bridge and rewards test files.

## Proposed change
Connect existing bridge tracking to an authoritative, read-only delivery source that links the sending transaction to the destination transaction, recipient, network and USDT transfer. Keep the same confirmation screens and financial execution.

1. Validate the official provider status interface or destination event against a completed Testnet bridge. Use a source transaction/nonce correlation key; amount, recipient and timing alone are insufficient.
2. Store and restore the correlation identity with the existing tracking context. Re-read verified evidence after refresh; cancel stale responses and retry unavailable reads safely.
3. Show relay progress only after confirmed source success and verified relay acceptance. Show Completed / USDT received only after linked destination success and token-transfer verification. Display the destination receipt and confirmed time.
4. Reuse the same evidence in the modal and inline Bridge tracker. Preserve pending, rejected and failed states and existing modal behavior.
5. Test pending-to-completed delivery, incorrect nonce/network/token/recipient, unrelated transfers, failed receipts, RPC outages, refresh and stale responses; run focused regression and mobile/desktop smoke checks without sending transactions.

## External prerequisite
The inspected direct-bridge implementation has no authoritative destination correlation feed. Implementation is blocked until an official read-only status interface or destination contract/event definition provides that link. Approval of this plan does not authorize inventing a feed or using balance-delta heuristics. A completed Testnet source/destination transaction pair can validate the integration, but by itself does not supply the missing correlation mechanism.

## Technical boundaries
Adapter requestState(gatewayNonce) is already correlated for Adapter requests and must remain separate from direct bridge delivery proof. Do not equate Adapter execution alone with a verified destination USDT receipt.

No changes to bridge economics, relay execution, Instant Bridge, transactions, wallet signatures, Liquidity, CaSwap, rewards or contracts. No financial actions or production publication are authorized by this plan.