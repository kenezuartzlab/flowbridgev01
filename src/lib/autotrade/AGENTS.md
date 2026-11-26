# AutoTrade rules
- AutoTrade V1 lives in src/lib/autotrade/ (pure engine + read-only quotes) behind /api/admin/autotrade and Ops → AutoTrade; orders are paper-only while AUTOTRADE_LIVE_ENABLED=false, and routes use only Router V4 registered venues. Why: no real funds move without a separate trading account and explicit signer approval.
