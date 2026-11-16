# Tron selection removal and Ethereum status

- Preview only; no publication, settings writes, transactions or contract changes. Release HOLD unchanged.
- Shared BridgeCard on `/` and `/trade` offers only BNB and ETH. Tron directions fail closed before confirmation and execution, including stale selections. Existing transaction history/tracking remains intact.
- 34 focused tests passed (availability, EVM execution safeguards, linked delivery verification).
- Browser: real `/trade` Bridge tab, Tron absent, ETH selected, direction toggled, BNB selected; no page errors. No connected-wallet financial flow was exercised.
- Automatic application build: OK.

## Ethereum read-only observations

- Configured `https://eth.llamarpc.com` returned HTTP 525 on the initial request and two retries from the sandbox.
- Independent Ethereum endpoint `https://ethereum-rpc.publicnode.com` responded with chain ID 1 and nonempty configured gateway bytecode (2,227 bytes).
- BOT endpoint responded with chain ID 677 and nonempty configured BOT gateway bytecode (2,227 bytes).
- Ethereum Mainnet is configured; Sepolia gateway is unset and not a verified available bridge route.
- Contract existence is not proof of liquidity, relay health or successful delivery. No end-to-end transfer was sent, and Ethereum bridging cannot be described as perfectly working. The configured RPC failure needs investigation before a controlled authorized transfer verifies both receipts.