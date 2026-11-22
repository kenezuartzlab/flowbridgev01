import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { validateVoterRewardReadMessage } from '@/lib/ecosystem/voterRewardAccess';

const inputSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  message: z.string().min(1).max(2048),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
  nonce: z.string().regex(/^[a-f0-9]{48}$/),
  chainId: z.literal(677),
}).strict();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function readPrivateVoterRewards(request: Request): Promise<Response> {
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: 'Wallet ownership verification is required.' }, 400);
    const { walletAddress, nonce, chainId, message } = parsed.data;
    if (!validateVoterRewardReadMessage(message, { wallet: walletAddress, nonce, chainId, requestOrigin: request.headers.get('origin'), nowMs: Date.now() })) {
      return json({ error: 'Invalid reward-view verification.' }, 400);
    }
    const { verifyWalletChallenge } = await import('@/lib/walletChallenge.server');
    const proof = await verifyWalletChallenge(parsed.data);
    if (!proof.ok) return json({ error: 'Wallet verification expired or failed. Try again.' }, proof.status);
    // The verified wallet, never a query parameter, scopes the privileged read.
    const { walletSummary } = await import('@/lib/ecosystem/voterRewards.server');
    return json({ summary: await walletSummary(proof.wallet) });
  } catch {
    return json({ error: 'Private voter rewards are temporarily unavailable.' }, 503);
  }
}

export const Route = createFileRoute('/api/public/voter-rewards-summary')({
  server: { handlers: { POST: ({ request }) => readPrivateVoterRewards(request) } },
});