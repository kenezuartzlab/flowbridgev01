/**
 * FlowBridge V30.1A — Lovable-native mainnet deployment preparation endpoint.
 *
 * Admin-gated, read-only and secret-safe:
 *  - no private key, mnemonic, signer secret or RPC credential is ever returned;
 *  - secrets are reported only as presence booleans;
 *  - no transaction is broadcast and no signature is requested;
 *  - the deterministic plan appears only when every preflight check passes.
 */
import { createFileRoute } from '@tanstack/react-router';
import { requireAdmin } from '@/lib/admin/adminGate.server';
import { jsonResponse } from '@/lib/api-auth.server';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import { CONTRACT_INVENTORY, inventoryEntry } from '@/lib/deploy/contractInventory';
import { evaluateMainnetPreflight, mainnetReadinessMatrix } from '@/lib/deploy/mainnetPreflight';

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 200 ? v.trim() : null;

export const Route = createFileRoute('/api/admin/mainnet-preflight')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }

        const contractId = asString(body['contractId']) ?? '';
        const entry = inventoryEntry(contractId);
        if (!entry) {
          return jsonResponse(
            {
              error: 'Unknown contract',
              known: CONTRACT_INVENTORY.map((c) => c.id),
            },
            400,
          );
        }

        // Secrets stay server-side; only presence is ever observed.
        const deploymentSecretPresent = Boolean(process.env['MAINNET_DEPLOYER_PRIVATE_KEY']);
        const rpcConfigured = Boolean(process.env['BOT_MAINNET_RPC_URL']);

        const result = evaluateMainnetPreflight({
          contractId,
          expectedChainId: BOT_MAINNET_CHAIN_ID,
          rpcChainId: typeof body['rpcChainId'] === 'number' ? (body['rpcChainId'] as number) : null,
          deployerAddress: asString(body['deployerAddress']),
          approvedDeployers: Array.isArray(body['approvedDeployers'])
            ? (body['approvedDeployers'] as unknown[]).filter(
                (v): v is string => typeof v === 'string',
              )
            : [],
          deployerBalanceWei:
            typeof body['deployerBalanceWei'] === 'string'
              ? (() => {
                  try {
                    return BigInt(body['deployerBalanceWei'] as string);
                  } catch {
                    return null;
                  }
                })()
              : null,
          requiredGasWei: 10n ** 17n,
          sourceHash: asString(body['sourceHash']),
          expectedSourceHash: asString(body['expectedSourceHash']),
          artifactHash: asString(body['artifactHash']),
          expectedArtifactHash: asString(body['expectedArtifactHash']),
          compiler: entry.compiler,
          constructorArgs:
            body['constructorArgs'] && typeof body['constructorArgs'] === 'object'
              ? (body['constructorArgs'] as Record<string, string | number | null>)
              : {},
          productionOwner: asString(body['productionOwner']),
          deploymentSecretPresent,
        });

        return jsonResponse({
          phase: 'V30.1A',
          network: { expectedChainId: BOT_MAINNET_CHAIN_ID, rpcConfigured },
          secretScan: 'CLEAR',
          readiness: mainnetReadinessMatrix(),
          preflight: {
            contractId: result.contractId,
            ok: result.ok,
            checks: result.checks,
            blockers: result.blockers,
            plan: result.plan,
          },
          broadcast: { mainnetBroadcasts: 0, mainnetSignatures: 0, flowTransfers: 0 },
        });
      },
    },
  },
});
