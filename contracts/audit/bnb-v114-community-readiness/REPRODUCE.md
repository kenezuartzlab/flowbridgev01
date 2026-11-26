# Reproduce locally (private packet; no network writes)

Run from the FlowBridge project root with the locked dependencies installed. Do not publish this directory.

```sh
# Frozen identity + artifacts + SHA256SUMS; fails on source/ABI/bytecode drift
bun scripts/bnb-v114-packet.mjs
sha256sum -c contracts/audit/bnb-v114-community-readiness/SHA256SUMS

# Frozen candidate: callback, fee, net-floor, donation, rollback and BOT V4 parity harness
bunx vitest run contracts/candidates/bnb-swap-adapter-v1-13/test
bunx vitest run contracts/audit/bnb-v113-community/review.v113.evm.test.ts contracts/audit/bnb-v113-community/direct-eoa.v116.evm.test.ts

# Direct-EOA exception, preferred Safe policy, signed-human-response rules and simulated wallet dry-runs
bunx vitest run src/lib/bnb/launchReadiness.test.ts src/lib/bnb/addressVerification.test.ts src/lib/bnb/communityPeerReview.test.ts src/lib/bnb/walletDryRun.test.ts src/lib/bnb/executionReviewPolicy.test.ts

# Actual production build and static/dynamic import reachability evidence
bun run build
bun scripts/bnb-v115-bundle-audit.mjs

# Fresh Slither 0.11.6 + solc 0.8.38; run by basename to reproduce the exact finding IDs
(cd contracts/candidates/bnb-swap-adapter-v1-13 && slither FlowBridgeBnbSwapAdapterV1_13.sol --solc-args "--optimize --optimize-runs 200 --evm-version cancun" --fail-none)
```

Local mock EVM tests are not a BSC client. Historical state and real target behavior not exercised by a fork remain UNKNOWN. Do not deploy, sign, fund or send transactions to reproduce this packet.
