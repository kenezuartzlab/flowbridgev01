import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/reward-policy')({
  server: { handlers: { GET: async () => {
    try {
      const [{ resolveFlowPointsV2Policy }, { rewardPolicyPresentation }] = await Promise.all([
        import('@/lib/rewards/flowPointsV2Ledger.server'),
        import('@/lib/rewards/rewardPolicyPresentation'),
      ]);
      // Public policy values only: no account, ledger, budget or private facts.
      return Response.json(rewardPolicyPresentation(await resolveFlowPointsV2Policy()), {
        headers: { 'Cache-Control': 'public, max-age=15' },
      });
    } catch {
      return Response.json({ error: 'Approved reward policy is unavailable.' }, { status: 503 });
    }
  } } },
});