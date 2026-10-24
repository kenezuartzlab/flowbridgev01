import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { validateOwnershipMessage } from '@/lib/wallet/ownershipMessage';

// This endpoint proves ownership only: no profile lookup, session, binding or transaction authority.
export const Route = createFileRoute('/api/public/wallet-proof')({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const input = z.object({
        walletAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/),
        message: z.string().min(1).max(2048),
        signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
        nonce: z.string().regex(/^[a-f0-9]{48}$/),
        chainId: z.number().int().positive(),
      }).strict().safeParse(await request.json());
      if (!input.success) return Response.json({ error: 'Invalid wallet proof.' }, { status: 400 });
      const { walletAddress, nonce, chainId, message } = input.data;
      if (!validateOwnershipMessage(message, { wallet: walletAddress, nonce, chainId,
        requestOrigin: request.headers.get('origin'), nowMs: Date.now() })) {
        return Response.json({ error: 'Wallet ownership proof does not match this site or network. Retry verification.' }, { status: 400 });
      }
      const { checkWalletRequestLimit } = await import('@/lib/wallet/requestLimit.server');
      const limited = await checkWalletRequestLimit(walletAddress.toLowerCase());
      if (limited) return limited;
      const { verifyWalletChallenge } = await import('@/lib/walletChallenge.server');
      const result = await verifyWalletChallenge(input.data);
      if (!result.ok) return Response.json({ error: 'Wallet proof expired, was already used or could not be verified. Retry verification.' }, { status: result.status });
      return Response.json({ verified: true, purpose: 'TRADING_OWNERSHIP', chainId }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ error: 'Wallet verification unavailable. Retry verification.' }, { status: 503 });
    }
  } } },
});