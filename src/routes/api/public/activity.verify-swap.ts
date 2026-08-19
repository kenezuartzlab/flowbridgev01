/**
 * V8 — POST /api/public/activity/verify-swap
 *
 * Accepts ONLY signed attribution evidence from the browser (intent, signature,
 * intentHash, sourceTxHash). Router / token / chain are never accepted from the
 * request: the trusted server verifier resolves them from the frozen swap path
 * config and reconstructs the amount from the on-chain Transfer log.
 */
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/activity/verify-swap')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let handoff;
        try {
          const { parseActivityVerifyRequest } = await import(
            '@/lib/activity/activityVerifyRequest'
          );
          handoff = parseActivityVerifyRequest(await request.json());
        } catch (e: any) {
          return Response.json(
            { status: 'INVALID', reason: e?.message ?? 'malformed request' },
            { status: 400 },
          );
        }

        try {
          const { handleSwapActivityVerification, FinalityConfigError } = await import(
            '@/lib/activity/swapVerification.server'
          );
          try {
            const outcome = await handleSwapActivityVerification(handoff);
            if (outcome.status !== 'CONFIRMED') {
              return Response.json({ status: outcome.status, reason: outcome.reason });
            }

            const { settleCampaignsForVerificationOutcome } = await import(
              '@/lib/campaign/activityCampaignSettlement.server'
            );
            const settlement = await settleCampaignsForVerificationOutcome(outcome);

            return Response.json({
              status: 'CONFIRMED',
              activityId: outcome.activity.activityId,
              created: outcome.created,
              ...(settlement
                ? {
                    campaignSettlement: {
                      pointsAwarded: settlement.pointsAwarded,
                      completions: settlement.completions.length,
                      replayed: settlement.replayed,
                    },
                  }
                : {}),
            });
          } catch (e: any) {
            if (e instanceof FinalityConfigError) {
              return Response.json(
                { status: 'UNCONFIGURED', reason: 'verifier finality configuration missing' },
                { status: 503 },
              );
            }
            throw e;
          }
        } catch (e: any) {
          return Response.json(
            { status: 'ERROR', reason: e?.message ?? 'verification failed' },
            { status: 500 },
          );
        }
      },
    },
  },
});
