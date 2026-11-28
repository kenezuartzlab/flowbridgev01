# Exact owner-route recheck — offline / read-only / disposable fork

This is diagnostic evidence, not registration, execution authority or an independent human audit. Previous `caswap-correction` evidence is preserved. No application imports these collectors or evidence.

## Reproduce

```sh
# Fixed-target mainnet read methods only. Use the captured block, not latest.
CASWAP_RECHECK_BLOCK=31793279 bun scripts/autotrade/caswap-route-recheck.ts
bun scripts/autotrade/caswap-route-recheck-supplement.ts
bun scripts/autotrade/caswap-route-recheck-tiers.ts
# Start a fresh disposable fork; no mainnet write endpoint or signing key.
bunx @foundry-rs/anvil --fork-url https://rpc.botchain.ai --fork-block-number 31793279 --chain-id 677 --hardfork shanghai --port 8547 --silent
# In another terminal:
bun scripts/autotrade/caswap-route-recheck-fork.ts
bunx vitest run scripts/autotrade/caswap-route-recheck.test.ts scripts/autotrade/caswap-audit-policy.test.ts scripts/autotrade/caswap-evidence.test.ts src/lib/autotrade --maxWorkers=2
```

Anvil 1.7.1 used in this recheck. The fork script rejects a changed starting hash/height/chain. Effects are restricted to literal `http://127.0.0.1:8547`; it uses local impersonation, synthetic native allocations and transfers only, no keys or signatures. CaSwap/other V2 registrations are local copies, with actual existing V4 fee inheritance, not proposed production fee changes. The 0.3% CA tier fails pinned two-sided quoting and is explicitly excluded from executable rehearsals; its one-sided quotes are not executable offers.

Buy comparisons each start from an identical snapshot. Sell CA is acquired from a different venue so the compared pool is untouched. CA→USDT funding uses CaSwap, leaving both BDEX pools untouched. USDT→CA funding uses a local simulated transfer from a public non-pool token holder, without persisting that holder's identity. No token/pool/code overrides. Quotes and output are compared exactly; receipts prove both pools emit logs for multi-hop. No mainnet transfer is sent. Residual checks cover native/CA/WBOT/caWBOT/USDT balances at V4, BDEX V3 and both CaSwap routers; they are not blanket assertions for every asset or contract.

Primary and explorer RPC are same-ecosystem endpoints, **not independent operators**; explorer `eth_chainId` fails and remains UNKNOWN. Registration events are an explorer index response with a 1,000-row cap, not a complete archive proof. Selected registration receipts and historical factory/runtime reads corroborate those entries. Full V2 `allPairs` enumeration is bounded at 2,000 and records completeness; V3 uses `getPool`, not V2 enumeration. Deeper arbitrary multi-hop search is not claimed.

Sources are explorer-verified runtime matches at the pin, not fresh compiler rebuilds or external certification. Live source endpoints, public holder discovery and archive-state availability may change; freeze output and identify any UNKNOWN instead of silently changing block or injecting balances. Recollection is a new observation and must not be represented as the same freeze.

Net outputs include the actual V4 input surcharge; gas is stored separately in BOT, not silently converted to CA/USDT. Economic comparisons are bounded to the recorded sizes, state and caller; they are not future price or liquidity guarantees.