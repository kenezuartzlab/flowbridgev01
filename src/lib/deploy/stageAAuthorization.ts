/**
 * FlowBridge V30.1E.3 — Stage A owner authorization record.
 *
 * The owner authorized the Stage A (FlowToken) deployment on
 * 2026-08-27T23:33:00Z. Per the secure-transport model, this module records
 * the authorization and the unsigned-transaction fingerprints only. The full
 * unsigned envelope (including calldata) lives at
 * contracts/production/STAGE_A_UNSIGNED_TX.json. No key material exists here;
 * signing and broadcast happen exclusively in the owner's external wallet.
 */
import envelope from '../../contracts/production/STAGE_A_UNSIGNED_TX.json';
import { STAGE_A_UNSIGNED_REVIEW, STAGE_A_GAS_ESTIMATE } from './stageADeployer';

/** Owner authorization, recorded verbatim. */
export const STAGE_A_AUTHORIZATION = {
  decision: 'OWNER_AUTHORIZED',
  authorizedAtUtc: '2026-08-27T23:33:00Z',
  scope: 'STAGE_A_FLOW_TOKEN_ONLY',
  excludes: [
    'any later deployment stage',
    'any funding or transfer transaction',
    'any Safe transaction',
  ],
  signingModel: 'EXTERNAL_WALLET_ONLY',
} as const;

/** Unsigned Stage A transaction envelope ready for external signing. */
export const STAGE_A_UNSIGNED_TX = envelope.tx;

/** Live preflight re-verification captured at authorization time (chain 677). */
export const STAGE_A_AUTHORIZATION_PREFLIGHT = {
  blockNumber: 21_186_479,
  deployerCode: '0x',
  balanceWei: '2500000000000000000',
  nonce: 0,
  gasPriceWei: '20000000000',
} as const;

/** Buffered gas limit shipped in the envelope (estimate + 30%). */
export const STAGE_A_GAS_LIMIT = 1_236_812;

/**
 * The authorization is only valid when the shipped envelope still matches the
 * frozen V30.1E.2 review fingerprints byte-for-byte.
 */
export function stageAEnvelopeIntact(): boolean {
  const fp = envelope.fingerprints;
  return (
    envelope.stage === 'A_FLOW_TOKEN' &&
    envelope.status === 'READY_FOR_EXTERNAL_SIGNATURE' &&
    fp.unsignedDataKeccak256 === STAGE_A_UNSIGNED_REVIEW.unsignedDataKeccak256 &&
    fp.unsignedDataSha256 === STAGE_A_UNSIGNED_REVIEW.unsignedDataSha256 &&
    fp.unsignedDataBytes === STAGE_A_UNSIGNED_REVIEW.unsignedDataBytes &&
    fp.creationBytecodeSha256 === STAGE_A_UNSIGNED_REVIEW.creationBytecodeSha256 &&
    envelope.tx.chainId === STAGE_A_UNSIGNED_REVIEW.chainId &&
    envelope.tx.from.toLowerCase() === STAGE_A_UNSIGNED_REVIEW.deployer.toLowerCase() &&
    envelope.tx.to === null &&
    envelope.tx.value === '0x0' &&
    envelope.tx.nonce === STAGE_A_UNSIGNED_REVIEW.nonce &&
    envelope.tx.gasPrice === '0x4a817c800' &&
    envelope.tx.gasLimit === STAGE_A_GAS_LIMIT &&
    envelope.tx.data.length === 2 + STAGE_A_UNSIGNED_REVIEW.unsignedDataBytes * 2 &&
    BigInt(envelope.tx.gasLimit) * 20_000_000_000n <=
      (STAGE_A_GAS_ESTIMATE * 20_000_000_000n * 13_000n) / 10_000n
  );
}
