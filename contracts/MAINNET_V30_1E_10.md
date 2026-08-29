# V30.1E.10 — Stage C.2 Router Lens settlement + Stage A/B verification retry

BOT Mainnet 677. Router v3 `0x986962de6f00d0ec571b1a34fa70aeeb445b5445` remains
the live production router. No promotion, registration, activation, funding or
traffic migration occurred.

## Stage C.2 — Router Lens: SETTLED, VERIFIED

Immediately before signing, the Lens was rebuilt from the frozen production
source with solc `0.8.20+commit.a1b79de6`, optimizer runs 1, viaIR, Shanghai
(the frozen Lens build line) and matched the manifest exactly:

| Artifact | Value |
| --- | --- |
| source sha256 | `8a5e1c84…6ff71aa2` |
| creation sha256 | `41a872fc…feffbd1e` (8,069 bytes) |
| runtime sha256 | `62975561…a424bffd` (7,829 bytes) |
| ABI sha256 | `0ee994f3…02dc7042` |
| double build | REPRODUCIBLE |

Revalidation at block `21,331,936`: chain 677, deployer nonce 3, balance
2.36264266 BOT, gas price 20 gwei, target Router V4 code present (19,720 bytes),
unsigned data 8,101 bytes with keccak
`0x44efb54034d8c07c7437bd73c094ce2bfcff9f08bb463394623430327100b8a9`,
expected address `0x48338d23640b09acDf0e7246844a9d867DC8205c`.

Broadcast (exactly one transaction, value 0):

- tx `0x421b2da4e1ce3738d0367d8a59c82f0b43ef1fcf099aa54befc699e5792859f6`
- block `21,331,972`, status success
- address `0x48338d23640b09acDf0e7246844a9d867DC8205c` — matches expected
- gas used `1,749,384` of `2,293,765` @ 20 gwei → fee `0.03498768 BOT`
- balance after `2.32765498 BOT`, nonce after 4

### Runtime parity

Sizes equal at 7,829 bytes. 200 bytes differ across exactly 10 ranges of 20
bytes; every one holds `0x3c6fdaf9…ebe6b06` on chain and zero placeholder bytes
locally — the immutable `flowRouter` binding. Verdict:
`PROVEN_MODULO_IMMUTABLES`.

### Read surfaces and mutability

`flowRouter()` = Router V4 only. `getActiveRouters` / `getActiveBridges` return
zero entries, both paged discovery views are empty, `findBestV2Rate` returns
`found = false`, and `getRouter(0)` / `getBridgeRouteConfig(0, token)` revert
with `RouterIdOutOfRange` / `BridgeIdOutOfRange` — correct for the empty V4
registry. The ABI contains no non-view function, no payable entry and no
receive/fallback, so the Lens cannot mutate Router state or hold value.

### Public source verification

Blockscout v2 `standard-json-input` on `scan.botchain.ai`:
`is_verified = true`, name `FlowBridgeRouterLens`, compiler
`v0.8.20+commit.a1b79de6`, optimizer runs 1, viaIR, Shanghai, MIT.

## Stage A / Stage B verification retry — still blocked at the explorer edge

The unchanged Stage A and Stage B standard-JSON bundles were resubmitted through
the same route that succeeded for Router V4 and the Lens. Both returned a
Cloudflare HTML `403` on every transport tried: curl multipart over HTTP/2 and
HTTP/1.1 (including chunked), a real Chromium session with `__cf_bm` cookies
posting from the `scan.botchain.ai` origin, and the legacy v1
`verifysourcecode` urlencoded form.

Diagnosis — a content-scoring rule at the edge, not an artifact mismatch:

- each individual source of the Stage B bundle is accepted on its own;
- a cumulative bundle is accepted at 16,763 bytes and rejected at 22,971 bytes;
- non-Solidity padding bodies up to 150 KB are accepted.

Nothing was recompiled, altered or redeployed. Both therefore remain
`DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING`:

- FlowToken `0x535ddda826142ac42ce288154e9595f080940ae9` (bundle 183,563 bytes)
- Rewards Distributor `0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB` (bundle 88,005 bytes)

The one-click browser submission bundles under
`contracts/production/stage-a-verification/` and `stage-b-verification/` remain
the closure path.

## Evidence

- `contracts/production/STAGE_C2_DEPLOYMENT.json`
- `src/lib/deploy/stageC2Settlement.ts` + `stageC2Settlement.test.ts`
