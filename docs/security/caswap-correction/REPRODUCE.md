# Targeted CaSwap correction: offline evidence and local replay

Nothing in this directory is an application import, active registry change or deployment authorization. External source archives were fetched from the explorer's `/api/v2/smart-contracts/<address>`; each includes its exact provenance URL. Registration JSON comes from `/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=<V3-or-V4>&topic0=0x4033e0f1df8b1888b56adc162789cbb7a40b437206134bd55194ee6e9482b13c`.

## Validate frozen observations without network or keys

```sh
bunx vitest run scripts/autotrade/caswap-audit-policy.test.ts scripts/autotrade/caswap-evidence.test.ts src/lib/autotrade --maxWorkers=2
bun scripts/autotrade/caswap-evidence-manifest.ts
```

The tests assert this specific pinned observation (31,792,262), not future liquidity or fee safety. A fresh collection requires a new timestamped report/acceptance; do not overwrite accepted evidence and describe it as the same freeze.

## Reproduce pinned mainnet reads and local replay

Use the installed viem from this project; no key, account login, secret, wallet extension or contract deployment is required. A public BOT archive/recent-state endpoint is necessary. Anvil 1.10.1 was used for this observation. If historical state is unavailable, record UNKNOWN rather than changing block or injecting token/pool state.

```sh
CASWAP_AUDIT_BLOCK=31792262 bun scripts/autotrade/caswap-correction.ts
bun scripts/autotrade/caswap-history.ts
bun scripts/autotrade/caswap-detail.ts
bun scripts/autotrade/caswap-bridging-depth.ts
# Separate terminal; disposable local process, NEVER a mainnet send endpoint:
anvil --fork-url https://rpc.botchain.ai --fork-block-number 31792262 --chain-id 677 --hardfork shanghai --port 8547
bun scripts/autotrade/caswap-fork.ts
bun scripts/autotrade/caswap-residuals.ts
```

`caswap-fork.ts` refuses a different fork hash/number/chain. It impersonates a synthetic local account and the deployed V4 owner only on literal `http://127.0.0.1:8547`. It does not use a signing key. Local balance allocation is simulated; registry insertion is to the fork copy. Token and pool balances/code are not substituted. Restart the disposable fork before rerunning; the script intentionally rejects an already advanced fork.

Read-only explorer code responses agreed with RPC at the pinned height. The explorer `eth_chainId` method failed; that UNKNOWN is retained. These two endpoints are BOT-ecosystem operated, not independent third-party operators. The 1,000-result explorer cap truncates routerId 2 history; do not report the returned sample as every V3 trade.
