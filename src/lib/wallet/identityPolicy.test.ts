import { describe,it,expect } from 'vitest';
import { recoveryAvailable,validRecoveryExpiry,recoveryRequest } from './identityPolicy';
const now=Date.parse('2026-11-10T00:00:00Z'),wallet='0x'+'a'.repeat(40);
const grant={target_wallet:wallet,expires_at:'2026-11-10T01:00:00Z',revoked_at:null,consumed_at:null};
describe('specific user recovery',()=>{
  it('accepts only the full approved wallet case insensitively',()=>{expect(recoveryAvailable(grant,'0x'+'A'.repeat(40),now)).toBe(true);expect(recoveryAvailable(grant,'0x'+'b'.repeat(40),now)).toBe(false);expect(recoveryAvailable(grant,'0xaa',now)).toBe(false);});
  it('expires automatically',()=>{expect(recoveryAvailable(grant,wallet,Date.parse(grant.expires_at))).toBe(false);});
  it('revokes immediately',()=>{expect(recoveryAvailable({...grant,revoked_at:'now'},wallet,now)).toBe(false);});
  it('allows no replay after consumption',()=>{expect(recoveryAvailable({...grant,consumed_at:'now'},wallet,now)).toBe(false);});
  it('allows at most 24 hours and no past expiry',()=>{expect(validRecoveryExpiry('2026-11-11T00:00:00Z',now)).toBe(true);expect(validRecoveryExpiry('2026-11-11T00:00:01Z',now)).toBe(false);expect(validRecoveryExpiry('2026-11-10T00:00:00Z',now)).toBe(false);});
  it('requires ownership evidence and a reason',()=>{const input={userId:'00000000-0000-0000-0000-000000000001',targetWallet:wallet,expiresAt:grant.expires_at,reason:'Ownership recovered',ownershipEvidence:'Verified account evidence'};expect(recoveryRequest.safeParse(input).success).toBe(true);expect(recoveryRequest.safeParse({...input,ownershipEvidence:''}).success).toBe(false);});
});