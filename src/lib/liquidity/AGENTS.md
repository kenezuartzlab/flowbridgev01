# Liquidity rules
- Liquidity venues live in src/lib/liquidity/ as independent adapters (BDEX V2, BDEX V3, CaSwap); V2-style factories and wrapped-native are always read from the venue's router at runtime. Why: CaSwap Mainnet router's factory differs from the recorded address.
- Per-chain liquidity write availability is decided only by liquidityWritesAllowed (LIQUIDITY_WRITES_ENABLED plus owner canary wallet list) in src/lib/liquidity/liquidityTokens.ts. Why: Mainnet liquidity opens only after separately approved canaries.
- The shared executor rechecks account, chain, venue target and capability before every signature; initial pool prices use bigint rational math. Why: stale UI and floating-point prices must not authorize unsafe writes.
