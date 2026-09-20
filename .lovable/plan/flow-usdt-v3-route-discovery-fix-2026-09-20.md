# FLOW/USDT V3 Route Discovery Fix

## Build
- Verify the live BOT Mainnet FLOW/USDT 1% pool, token order, liquidity, current range, both production-quoter directions, and Router v3 registration without broadcasting.
- Replace the single hardcoded BOT/USDT V3 quote path with factory-based, allowlisted fee-tier discovery using the verified BDEX V3 factory and Quoter V2.
- Add canonical FLOW to the Mainnet token selector and keep unsupported networks/pools fail-closed.
- Carry the executable quote’s live fee and price impact into the swap confirmation/details while leaving Router V4 and all governance/economic systems untouched.

## Verification
- Add focused tests for canonical FLOW, fee-tier 10000 discovery, pool validation, and wrong-tier fail-closed behavior.
- Run focused route tests, TypeScript checks, production build, and a read-only live-chain verification.
- Publish only after all checks pass.

## Security
- Restrict direct profile updates so users cannot modify reward, balance, volume, or wallet-binding fields themselves.
