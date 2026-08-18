/**
 * Gate 5A2 — SERVER-ONLY finality configuration + handoff entry point.
 *
 * Confirmation policy is read from the environment and FAILS CLOSED: missing,
 * non-integer, zero or negative values are an error. There are no defaults.
 */
import type { ActivityIntentHandoff, VerificationOutcome } from './activityVerifier';
import {
  FinalityConfigError,
  createBackendActivityRepository,
  createViemChainReader,
  verifyAndPersistBridgeActivity,
  type TrustedVerificationDeps,
} from './activityVerification.server';
import { OFFICIAL_CHAIN_IDS } from '../bridge/officialBridgeConfig';

export const CONFIRMATION_ENV_VARS: Record<number, string> = {
  [OFFICIAL_CHAIN_IDS.bnbTestnet]: 'ACTIVITY_VERIFIER_BNB_TESTNET_CONFIRMATIONS',
  [OFFICIAL_CHAIN_IDS.botTestnet]: 'ACTIVITY_VERIFIER_BOT_TESTNET_CONFIRMATIONS',
};

export function parseConfirmations(raw: unknown): number {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new FinalityConfigError('confirmation configuration is missing');
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new FinalityConfigError('confirmation configuration must be a positive integer');
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) {
    throw new FinalityConfigError('confirmation configuration must be a positive integer');
  }
  return value;
}

export function resolveRequiredConfirmations(
  sourceChainId: number,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): number {
  const key = CONFIRMATION_ENV_VARS[sourceChainId];
  if (!key) {
    throw new FinalityConfigError(`no confirmation policy configured for chain ${sourceChainId}`);
  }
  return parseConfirmations(env[key]);
}

export async function handleActivityVerification(
  handoff: ActivityIntentHandoff,
  overrides?: Partial<TrustedVerificationDeps> & { env?: Record<string, string | undefined> },
): Promise<VerificationOutcome> {
  const requiredConfirmations = resolveRequiredConfirmations(
    Number(handoff.intent.sourceChainId),
    overrides?.env,
  );

  return await verifyAndPersistBridgeActivity(
    {
      reader: overrides?.reader ?? createViemChainReader(),
      createRepository:
        overrides?.createRepository ?? ((facts) => createBackendActivityRepository(facts)),
      ...(overrides?.recoverTypedDataSigner
        ? { recoverTypedDataSigner: overrides.recoverTypedDataSigner }
        : {}),
      ...(overrides?.now ? { now: overrides.now } : {}),
    },
    handoff,
    { requiredConfirmations },
  );
}

export { FinalityConfigError };
