/**
 * Gate 5A2 — POST /api/public/activity/verify
 *
 * Accepts ONLY signed attribution evidence from the browser, then asks the
 * trusted server verifier to reconstruct the facts from the official source
 * event and persist CONFIRMED evidence through the service-role RPC.
 *
 * This route performs NO campaign settlement, awards NO PTS/XP/FLOW and writes
 * NO Activity Registry entry.
 */
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/activity/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1) Parse + validate the browser payload.
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

        // 2) Resolve finality config + run the trusted verifier.
        try {
          const { handleActivityVerification, FinalityConfigError } = await import(
            '@/lib/activity/activityVerificationHandoff.server'
          );
          try {
            const outcome = await handleActivityVerification(handoff);
            if (outcome.status !== 'CONFIRMED') {
              return Response.json({ status: outcome.status, reason: outcome.reason });
            }

            // CONFIRMED: delegate durable campaign settlement to the trusted
            // server helper. A settlement throw becomes a 500 (retryable);
            // the durable verified activity is never downgraded.
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
