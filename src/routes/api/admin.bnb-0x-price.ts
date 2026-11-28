/** Owner-paused BNB Swap diagnostic: unconditional all-method tombstone, no vendor imports. */
import { createFileRoute } from '@tanstack/react-router';
import { bnbSwapGoneResponse } from '@/lib/bnb/bnbSwapEmbargo';
export const Route = createFileRoute('/api/admin/bnb-0x-price')({
  server: { handlers: {
    GET: bnbSwapGoneResponse, POST: bnbSwapGoneResponse, PUT: bnbSwapGoneResponse,
    PATCH: bnbSwapGoneResponse, DELETE: bnbSwapGoneResponse, OPTIONS: bnbSwapGoneResponse,
    HEAD: bnbSwapGoneResponse,
  } },
});
