/** Owner-locked publication policy. Only new explicit owner approval may change this source. */
export const BNB_SWAP_PUBLICATION_EMBARGO = true as const;
export const BNB_SWAP_EMBARGO_REASON = 'OWNER_PAUSED_FOR_AUTOTRADE_WORKSPACE' as const;
export const BNB_EXECUTION_ENABLED = false as const;
export const LAUNCH_HOLD = true as const;

/** No authentication, request parsing, vendor transport, configuration or signing is performed. */
export function bnbSwapGoneResponse(): Response {
  return Response.json({ error: 'BNB_SWAP_PAUSED', reason: BNB_SWAP_EMBARGO_REASON }, {
    status: 410, headers: { 'cache-control': 'no-store' },
  });
}
