/** Read-only discovery. A log is only a candidate; the full receipt must still match. */
export async function deliveryStartBlock(
  head: bigint, sourceTimestamp: bigint,
  timestampAt: (block: bigint) => Promise<bigint>,
): Promise<bigint> {
  const target = sourceTimestamp > 600n ? sourceTimestamp - 600n : 0n;
  let low = 0n;
  let high = head;
  // Find the last block at/before the source time minus a safety margin.
  // Fixed block-spacing estimates miss transfers when spacing changes and make
  // old restored transfers take hundreds of polling cycles to catch up.
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    if (await timestampAt(mid) <= target) low = mid;
    else high = mid - 1n;
  }
  return low;
}

export async function readDeliveryChunk<T>(
  from: bigint, head: bigint, size: bigint,
  read: (from: bigint, to: bigint) => Promise<T[]>,
): Promise<{ logs: T[]; next: bigint }> {
  let width = size;
  while (true) {
    const to = from + width - 1n < head ? from + width - 1n : head;
    try { return { logs: await read(from, to), next: to + 1n }; }
    catch (error) {
      // Provider range limits vary. Never advance past a failed read.
      if (width === 1n) throw error;
      width = width / 2n;
      if (width < 1n) width = 1n;
    }
  }
}

export function deliveryPollCursor(cursor: bigint, head: bigint, start: bigint, overlap: bigint, scannedHead: bigint = head): bigint {
  // RPC log indexes may lag behind their block head. Recheck a bounded recent
  // window after reaching head instead of permanently skipping a late release.
  if (cursor <= scannedHead) return cursor;
  // Compare to the PREVIOUS scanned head: the live head grows between polls.
  const anchor = scannedHead < head ? scannedHead : head;
  const rewind = anchor > overlap ? anchor - overlap : 0n;
  return rewind > start ? rewind : start;
}