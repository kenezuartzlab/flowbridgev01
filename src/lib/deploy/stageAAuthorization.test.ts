import { readFileSync } from 'node:fs';
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
    expect(STAGE_A_AUTHORIZATION.status).toBe('READY_FOR_EXTERNAL_SIGNATURE');
  });

  it('ships an unsigned envelope consistent with the frozen review', () => {
    expect(stageAEnvelopeIntact()).toBe(true);
  });

  it('is a pure contract-creation transaction with no value and no drift', () => {
    expect(STAGE_A_UNSIGNED_TX.to).toBeNull();
    expect(STAGE_A_UNSIGNED_TX.value).toBe('0x0');
    expect(STAGE_A_UNSIGNED_TX.chainId).toBe(677);
    expect(STAGE_A_UNSIGNED_TX.nonce).toBe(0);
    expect(STAGE_A_UNSIGNED_TX.gasLimit).toBe(1_236_812);
    expect(STAGE_A_UNSIGNED_TX.data.startsWith('0x')).toBe(true);
    expect((STAGE_A_UNSIGNED_TX.data.length - 2) / 2).toBe(5916);
  });

  it('matches the JSON handoff artifact byte-for-byte', () => {
    const handoff = JSON.parse(
      readFileSync('contracts/production/STAGE_A_UNSIGNED_TX.json', 'utf8'),
    );
    expect(handoff.status).toBe('READY_FOR_EXTERNAL_SIGNATURE');
    expect(handoff.tx).toEqual({ ...STAGE_A_UNSIGNED_TX });
    expect(handoff.fingerprints.unsignedDataKeccak256).toBe(
      '0x9415ef65a40a2b1e6e61ac0a513b62bb1dcc3173ee07741ed2c6e096d55ae45f',
    );
  });
});
