import { describe, expect, it } from 'vitest';
import { samePublisherAddress, publisherReviewAllowed, publisherSignAllowed } from './vaultPublisherControls';
import type { PublisherBatch } from '@/lib/rewards/vaultV2Publisher';

const publisher = '0x971E7790FE6C8F77dc666Bb05D4aedA362653f94';
const batch: PublisherBatch = { batch_id: 'batch', snapshot_hash: 'snapshot', publisher, contract_address: '0x91f70c91b4273d0129abc3f14373fbb10ca59006', source_ids: ['award'], wallets: [publisher], amounts_wei: ['100'], total_wei: '100', state: 'RESERVED' };

describe('Vault publisher button authorization presentation', () => {
  it('enables review for checksummed publisher and lowercase bound wallet', () => {
    expect(publisherReviewAllowed(true, publisher.toLowerCase(), publisher, batch)).toBe(true);
  });
  it('rejects a different connected wallet', () => {
    expect(publisherReviewAllowed(true, batch.contract_address, publisher, batch)).toBe(false);
  });
  it('fails closed for missing and malformed addresses', () => {
    for (const address of [undefined, true, '', '0x123', publisher + '0', ' ' + publisher, '0x' + 'g'.repeat(40)]) {
      expect(samePublisherAddress(address, address)).toBe(false);
      expect(publisherReviewAllowed(true, address, publisher, batch)).toBe(false);
    }
  });
  it('requires enabled controls and an uncredited existing batch', () => {
    expect(publisherReviewAllowed(false, publisher, publisher, batch)).toBe(false);
    expect(publisherReviewAllowed(true, publisher, publisher, undefined)).toBe(false);
    expect(publisherReviewAllowed(true, publisher, publisher, { ...batch, state: 'CREDITED' })).toBe(false);
  });
  it('keeps signing disabled before successful review', () => {
    expect(publisherSignAllowed(true, undefined, batch)).toBe(false);
  });
  it('permits signing only for the reviewed current snapshot', () => {
    expect(publisherSignAllowed(true, { ...batch, publisher: publisher.toLowerCase() }, batch)).toBe(true);
    expect(publisherSignAllowed(true, { ...batch, snapshot_hash: 'stale' }, batch)).toBe(false);
    expect(publisherSignAllowed(true, { ...batch, batch_id: 'other' }, batch)).toBe(false);
  });
  it('blocks signing after a publisher or wallet mismatch', () => {
    expect(publisherSignAllowed(false, batch, batch)).toBe(false);
    expect(publisherSignAllowed(true, { ...batch, publisher: batch.contract_address }, batch)).toBe(false);
  });
});