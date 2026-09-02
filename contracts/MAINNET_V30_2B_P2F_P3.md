# V30.2B P2F + P3 — Rewards Security Freeze, then Staking Activation Readiness

Read-only gate. Nothing was signed, broadcast, funded, published, or activated.

## P2F — REWARDS_PRODUCTION_FROZEN (PASS)

Evidence: `contracts/production/v30-2b-rewards-freeze/P2F_REGRESSION.json`
(script `scripts/p2f-regression.mjs`, chain 677).

- Distributor `0x7b805B…9b922` — code present, `token` == canonical R1 FLOW.
- `epochCount == 1`; epoch 1 root == frozen manifest root `0xe5cf2f…6456`;
  allocation 1 FLOW; claimed 1 FLOW; not cancelled/released.
- Client leaf encoding byte-exact with `leafHash(...)`; single-leaf tree.
- `isClaimed(1,0) == true` (replay blocked); no phantom index 1.
- `totalReserved == 0`, `campaignBudget == 1 FLOW`, `budgetRemaining == 0`
  → no new epoch is fundable without an explicit governance write.
- Authority: admin = Governance Safe, pauser = Operations Safe, deployer holds
  no admin/budget role.
- Wallet ownership: SIWE nonce is single-use, wallet-bound and expiring;
  signature must recover to the claimed wallet; `profiles` has
  `profiles_wallet_address_unique_ci` plus the `enforce_verified_wallet_binding`
  BEFORE UPDATE trigger (self-rebind blocked).
- Private reward reads: `campaign_completions`,
  `campaign_completion_activities`, `campaign_points_ledger` SELECT policies all
  require `profiles.id = auth.uid()` with a non-null bound wallet;
  `flow_points_ledger` is `user_id = auth.uid()`.
- Claim integrity regression: `src/lib/rewards/mainnetClaimSecurity.test.ts`
  (22 cases) — wrong account/amount/epoch/index, forged proof, stale root,
  already-claimed, unopened/closed window, cancelled/released epoch,
  underfunded distributor, RPC-read failure, chain 968 and legacy 1024 all fail
  closed.
- Regression: 1192/1192 tests pass, typecheck clean, build OK, `/earn` shows zero
  console errors and zero failed requests.
- No economic drift: no new root, budget, funding, transfer, conversion or
  multiplier change.

## P3 — STAKING_ACTIVATION_BLOCKED (prerequisites only)

Evidence: `contracts/production/v30-2b-staking-readiness/P3_STAKING_READINESS.json`
(script `scripts/p3-readiness.mjs`, chain 677).

Confirmed: R4 `0x965529…42e65`, R5 `0x44b9b8…253bF`, R6 `0x15e7B1…6790D` code and
bindings intact (Vault→Controller/Treasury, Controller→Vault, all token == R1 FLOW);
Treasury inventory exactly 10,000,000 FLOW with 0 obligations / 0 accrued /
0 committed and a reconciling free balance; Vault principal and FLOW balance 0;
`maxFlowPerEpoch == 50,000 FLOW`; Genesis ceiling 1,000,000 and Standard 2,000,000
(combined 3,000,000) with 0 year-1 used; all five products (Flexible/30D/90D/180D/365D)
zero-staked with 0 emission rate, so no APR is presentable as live; roles match the
frozen wiring and the deployer holds no staking authority; Vault unpaused and
`emergencyMode == false`, so principal exit is not stranded.

Blocking items (all require separate authorization; none executed here):

1. `ORACLE_UNSET_PENDING_POOL` — `oracle == 0x0`, `weeklyUsdBudget8 == 0`. No
   FLOW/USD liquidity reference exists on chain 677, so the dynamic staking path
   stays disabled and fails closed. No oracle was invented or substituted.
2. `VAULT_EPOCH_ROLE_UNASSIGNED` — Vault `EPOCH_ROLE` is held by no address
   (not even the Controller).
3. `STAKING_PUBLISHER_UNASSIGNED` — Controller `PUBLISHER_ROLE` is held by no
   address, so no staking epoch can be published.

### Minimal fixed-rate / Genesis-only activation path (identified, NOT executed)

The frozen contracts support it without weakening any cap:

1. Governance Safe → Vault: `grantRole(EPOCH_ROLE, Controller)`.
2. Governance Safe → Controller: `grantRole(PUBLISHER_ROLE, <approved publisher>)`.
3. Publisher → Controller: commit one fixed-rate Genesis epoch ≤ 50,000 FLOW for
   7 days, inside the 1,000,000 FLOW Genesis year-1 ceiling.
4. Leave `oracle` unset and `weeklyUsdBudget8 == 0` so the dynamic USD-budgeted
   path remains disabled.

Prerequisites for that path are NOT all proven (2 and 3 above are unassigned and
no publisher has been approved), so no next transaction is authorized by this gate.
