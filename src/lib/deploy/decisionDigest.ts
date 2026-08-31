/**
 * FlowBridge — canonical decision-record digest primitives.
 *
 * Extracted verbatim from the V30.1D.2 release-freeze implementation so every
 * later decision version (V30.2B.P2A and beyond) hashes with the SAME
 * procedure instead of re-implementing it. Pure and dependency-free.
 */

/** Stable, key-sorted JSON so the same decision object always hashes equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** FNV-1a 64-bit digest — an integrity fingerprint, never a security claim. */
export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash = (hash ^ BigInt(input.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function digestOf(value: unknown): string {
  return fnv1a64(stableStringify(value));
}
