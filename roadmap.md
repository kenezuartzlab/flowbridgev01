# MultiSend BOT Testnet Release

- [x] Add a pinned Solidity 0.8.20 / Shanghai compiler gate.
- [x] Generate ABI, bytecode, explorer input, hashes, and EIP-170 size evidence.
- [x] Add fail-closed BOT Testnet preflight and read-only post-deployment verification.
- [x] Record the approved BOT Testnet owner and fee-recipient addresses.
- [x] Complete baseline contract tests and static safety evidence (17/17 contract tests; 14/14 static checks).
- [x] Broadcast the chain-968 deployment transaction (0x535dDDA826142AC42cE288154e9595f080940aE9).
- [x] Confirm live chain state: owner, fee recipient, 1 bps fee, 100 recipient limit, unpaused.
- [x] Point the testnet service fee to the approved separate wallet (0x628e...BB97, config nonce 1).
- [x] Run live native rehearsals for Distribute, Consolidate, and Advanced with exact recipient credit,
      1 bps fee, and zero contract custody afterwards.
- [x] Record the verified testnet address in the app inventory and enable BOT Testnet MultiSend.
- [x] Prove the frozen source reproduces the deployed bytecode exactly (release/bot-testnet-source-reproduction.json).
- [ ] Submit that frozen standard JSON through the scan.bohr.life explorer UI (no public verify API; manual step).
- [x] Run the ERC-20 rehearsal for all three modes plus 17 negative paths with the MSTT test token.
- [x] Run the adversarial contract suite (41/41) and the live pause acceptance check.
- [x] Show estimated network gas, total required and balance-after per source wallet on Review.
- [x] Group MultiSend sessions as one receipt on Activity while keeping every transaction hash.
- [ ] BOT Mainnet remains out of scope until testnet evidence is frozen and approved.

# Smart Trade + Liquidity V1
- [x] BOT routing: ATOMIC — V4 on Mainnet for native BOT <-> BDEX V3 multi-pool (canaries passed); other classes staged.
- [x] CaSwap capability audit (add/remove/createPair/LP discovery SUPPORTED; factory read from router).
- [x] BDEX V2 / CaSwap add + remove liquidity, LP discovery; BDEX V3 mint/increase/decrease/collect/burn; Create Pool.
- [x] BOT Testnet rehearsal (docs/liquidity/testnet-rehearsal.json); My Positions; Earn liquidity fees; liquidity Activity; Smart AI swap + liquidity; mobile 390px + reduced motion.
- [ ] Mainnet liquidity canaries (V2 add/remove, V3 mint/increase/decrease/collect/burn, CaSwap add/remove) — need separate approval; Mainnet liquidity writes stay closed until then.
- [ ] CA / MONEY swap rehearsals (waiting on wallet holding CA / MONEY).
- [x] Unloaded test file: Bun-only harness picked up by vitest (environment mismatch). Renamed to v3math.bun-spec.mjs, runs via `test:bun-harness` (13/13).
- [ ] Put every selector/dialog above page chrome; correct light-theme bridge/receipt contrast; widen both mobile menus.

# Router V4 Native V3 Multi-Pool Extension
- [x] Extended V4 candidate (additive), size 21,838 / headroom 2,738, deterministic.
- [x] Old V4 forge 35/35, new 32/32, fork sims, Slither triaged.
- [x] ABI regenerated from artifact + parity tests; legacy selectors moved to test fixture.
- [x] Testnet candidate 0xd985…1C1E deployed, delay-activated, BOT→FLOW and FLOW→BOT atomic PASS.
- [x] Capability matrix (ATOMIC — V4 vs STAGED) with flags OFF on all chains.
- [ ] Mainnet promotion steps 1–12 (needs owner approval + Governance Safe signatures).
- [ ] CaSwap → BDEX V2 existing atomic path: NOT AVAILABLE (no shared token between venues).
- [ ] FUTURE: ROUTER V4 MIXED-VENUE EXTENSION (V2↔V3, CaSwap↔V3, native + mixed). Own design/security gate. Not implemented.
- [x] 0x524D…98c5 accepted ownership of Router V4 0x7965…fc61
- [ ] Future: non-zero Router V4 registry activation delay (needs separate approval)
