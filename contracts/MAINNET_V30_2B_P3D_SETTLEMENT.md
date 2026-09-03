# V30.2B P3D Settlement — 30D Mainnet Canary Locked Genesis Activation

Chain 677 (BOT Mainnet). Read-only settlement gate. **Mainnet writes performed by this gate: 0.**

## User-signed transaction

| | |
| --- | --- |
| TX1 `approve(R6, 1 FLOW)` | NOT BROADCAST — live allowance was already exactly 1 FLOW |
| TX2 `openPosition(1, 1000000000000000000)` | `0x6bf89b2bde06ab3ca86d32e766e0abe91b41d6d48c3adf07d3d1e7e275be3488` — **success** |
| Signer | `0x3d8a7fa490f9db09dd8006b74688213ace9c0164` |
| Target | Staking Vault V2 `0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D` |

## Settlement gate — `scripts/p3d-settlement.mjs`

**33 / 33 checks PASS, 0 failures.**

- Position `#2`: owner = canary, productId `1`, status open, principal exactly `1 FLOW`.
- Genesis applied — `2700 bps`, `genesisEndAt == maturityAt` (fully Genesis-covered 30D).
- Reservations exactly as accepted: Genesis `0.022191780821917808 FLOW`, floor `0.006575342465753424 FLOW`.
- Lock `2592000s`; `varPaid = 0`; maturity `1790989220` (not reached).
- Treasury solvent: free `9999999.971225890410958906`, obligations `0.028767402968036528`, inventory `9999999.999993293378995434 FLOW`.
- Canary allowance to the vault is now `0` — consumed exactly by TX2, never unlimited.
- Oracle `0x0`; EPOCH_ROLE → Controller false; PUBLISHER_ROLE false; no standard epoch.

Evidence: `contracts/production/v30-2b-staking-locked-products/scripts/P3D_SETTLEMENT.json`.

## UI activation

`V30_2B_FEATURE_ACTIVATION.lockedGenesisStakingEnabled = true`. The locked-products card
(30D / 90D / 180D / 365D) is live and driven strictly by live `quoteOpen()` per wallet, with
exact separate approve/open confirmations, quote-fingerprint freeze, APR-only copy, and
Genesis-then-floor-only phase copy for terms outliving the wallet's Genesis coverage.

## Verdict

```
P3D: PASS
TX1 approve(R6, 1 FLOW): NOT BROADCAST — allowance already exactly 1 FLOW
TX2 openPosition(1, 1 FLOW): 0x6bf89b2bde06ab3ca86d32e766e0abe91b41d6d48c3adf07d3d1e7e275be3488 SUCCESS
PRODUCT STATES: 30D/90D/180D/365D LIVE (live-quote gated, per-wallet Genesis)
ORACLE: 0x0 UNCHANGED
ROLES: UNCHANGED
30D REAL MATURITY WITHDRAWAL: PENDING
CLASSIFICATION: LIVE_WITH_MATURITY_CANARY_PENDING
```

**Next action:** at maturity `1790989220`, withdraw position `#2` from `0x3d8a…0164` and run the
maturity settlement check to close the 30D real-withdrawal canary.
