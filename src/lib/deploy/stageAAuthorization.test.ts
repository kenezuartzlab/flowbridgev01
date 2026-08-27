import { describe, expect, it } from 'vitest';
import {
  STAGE_A_AUTHORIZATION,
  STAGE_A_UNSIGNED_TX,
  stageAEnvelopeIntact,
} from './stageAAuthorization';

describe('V30.1E.3 Stage A authorization', () => {
  it('records an owner authorization scoped to Stage A only', () => {
    expect(STAGE_A_AUTHORIZATION.decision).toBe('OWNER_AUTHORIZED');
    expect(STAGE_A_AUTHORIZATION.scope).toBe('STAGE_A_FLOW_TOKEN_ONLY');
    expect(STAGE_A_AUTHORIZATION.signingModel).toBe('EXTERNAL_WALLET_ONLY');
  });

  it('ships an unsigned envelope that matches the frozen review fingerprints', () => {
    expect(stageAEnvelopeIntact()).toBe(true);
  });

  it('is a pure contract-creation transaction with no value and no calldata drift', () => {
    expect(STAGE_A_UNSIGNED_TX.to).toBeNull();
    expect(STAGE_A_UNSIGNED_TX.value).toBe('0x0');
    expect(STAGE_A_UNSIGNED_TX.chainId).toBe(677);
    expect(STAGE_A_UNSIGNED_TX.nonce).toBe(0);
    expect(STAGE_A_UNSIGNED_TX.data.startsWith('0x')).toBe(true);
    expect((STAGE_A_UNSIGNED_TX.data.length - 2) / 2).toBe(5916);
  });
});
