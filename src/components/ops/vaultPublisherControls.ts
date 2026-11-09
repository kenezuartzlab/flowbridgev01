import type { PublisherBatch } from '@/lib/rewards/vaultV2Publisher';

/** Presentation only: server authorization and live-chain checks remain mandatory. */
export function samePublisherAddress(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string'
    && /^0x[0-9a-fA-F]{40}$/.test(a) && /^0x[0-9a-fA-F]{40}$/.test(b)
    && a.toLowerCase() === b.toLowerCase();
}

export function publisherReviewAllowed(enabled: boolean | undefined, wallet: unknown, publisher: unknown, batch: PublisherBatch | undefined): boolean {
  return Boolean(enabled && batch && batch.state !== 'CREDITED' && samePublisherAddress(publisher, wallet));
}

export function publisherSignAllowed(allowed: boolean, reviewed: PublisherBatch | undefined, batch: PublisherBatch | undefined): boolean {
  return Boolean(allowed && reviewed && batch && reviewed.batch_id === batch.batch_id
    && reviewed.snapshot_hash === batch.snapshot_hash && samePublisherAddress(reviewed.publisher, batch.publisher));
}