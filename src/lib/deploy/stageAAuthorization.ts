/**
 * FlowBridge V30.1E.3 — Stage A owner authorization record.
 *
 * The owner authorized the Stage A (FlowToken) deployment on
 * 2026-08-27T23:33:00Z. Per the secure-transport model, this module records
 * the authorization and the unsigned transaction. The same envelope is
 * mirrored at contracts/production/STAGE_A_UNSIGNED_TX.json for handoff to
 * external signing tooling. No key material exists here; signing and
 * broadcast happen exclusively in the owner's external wallet.
 */
import { STAGE_A_UNSIGNED_DATA_HEX } from './stageAUnsignedTxData';
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
  status: 'READY_FOR_EXTERNAL_SIGNATURE',
} as const;

/** Unsigned Stage A transaction envelope, ready for external signing. */
export const STAGE_A_UNSIGNED_TX = {
  chainId: 677,
  from: '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD',
  to: null,
  value: '0x0',
  nonce: 0,
  /** 20 gwei, the live gas price observed at preflight. */
  gasPrice: '0x4a817c800',
  /** estimate 951,394 + 30% buffer. */
  gasLimit: 1_236_812,
  data: STAGE_A_UNSIGNED_DATA_HEX,
} as const;

/** Live preflight re-verification captured at authorization time (chain 677). */
export const STAGE_A_AUTHORIZATION_PREFLIGHT = {
  blockNumber: 21_186_479,
  deployerCode: '0x',
  balanceWei: '2500000000000000000',
  nonce: 0,
  gasPriceWei: '20000000000',
} as const;

/**
 * The authorization is only valid while the shipped envelope still matches
 * the frozen V30.1E.2 review exactly: same chain, deployer, nonce, gas price,
 * buffered limit, null `to`, zero value and the full 5,916-byte calldata.
 */
export function stageAEnvelopeIntact(): boolean {
  const tx = STAGE_A_UNSIGNED_TX;
  return (
    tx.chainId === STAGE_A_UNSIGNED_REVIEW.chainId &&
    tx.from.toLowerCase() === STAGE_A_UNSIGNED_REVIEW.deployer.toLowerCase() &&
    tx.to === null &&
    tx.value === '0x0' &&
    tx.nonce === STAGE_A_UNSIGNED_REVIEW.nonce &&
    tx.gasPrice === '0x4a817c800' &&
    tx.data.length === 2 + STAGE_A_UNSIGNED_REVIEW.unsignedDataBytes * 2 &&
    BigInt(tx.gasLimit) * 20_000_000_000n <=
      (STAGE_A_GAS_ESTIMATE * 20_000_000_000n * 13_000n) / 10_000n
  );
}
