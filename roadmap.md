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
- [ ] BOT routing (staged) — STOPPED: live router charges the 0.01% FlowBridge fee on every leg (owner decision needed).
- [ ] BOT→FLOW / FLOW→BOT mainnet rehearsal (blocked on fee decision).
- [ ] CA / MONEY rehearsals (waiting on wallet holding CA / MONEY).
- [ ] BDEX V2 add/remove liquidity, LP discovery.
- [ ] BDEX V3 positions (mint/increase/decrease/collect/burn), My Positions.
- [ ] Create Pool rehearsal on BOT Testnet (needs testnet BDEX V3 addresses).
- [ ] CaSwap liquidity capability audit; Earn; liquidity Activity; AI range guidance; mobile acceptance.
- [x] Unloaded test file: Bun-only harness picked up by vitest (environment mismatch). Renamed to v3math.bun-spec.mjs, runs via `test:bun-harness` (13/13).

# Router V4 Native V3 Multi-Pool Extension
- [x] Extended V4 candidate (additive), size 21,838 / headroom 2,738, deterministic.
- [x] Old V4 forge 35/35, new 32/32, fork sims, Slither triaged.
- [x] ABI regenerated from artifact + parity tests; legacy selectors moved to test fixture.
- [x] Testnet candidate 0xd985…1C1E deployed, delay-activated, BOT→FLOW and FLOW→BOT atomic PASS.
- [x] Capability matrix (ATOMIC — V4 vs STAGED) with flags OFF on all chains.
- [ ] Mainnet promotion steps 1–12 (needs owner approval + Governance Safe signatures).
- [ ] CaSwap → BDEX V2 existing atomic path: NOT AVAILABLE (no shared token between venues).
- [ ] FUTURE: ROUTER V4 MIXED-VENUE EXTENSION (V2↔V3, CaSwap↔V3, native + mixed). Own design/security gate. Not implemented.
- [ ] 0x524D…98c5 accepts ownership of Router V4 0x7965…fc61 (owner action)
- [ ] Future: non-zero Router V4 registry activation delay (needs separate approval)
