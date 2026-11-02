import { keccak256, type Hex } from 'viem';
import { VAULT_V2_FLOW_IMMUTABLE_OFFSETS, VAULT_V2_UNPATCHED_RUNTIME } from './vaultV2Runtime.generated';

/**
 * Approved BOT Mainnet Vault V2 identity. Activation derives the expected runtime only from the frozen
 * artifact patched with the canonical FLOW token; no caller-supplied code hash is ever trusted.
 * Changing any value here is a reviewed release decision, not an Ops input.
 */
export const VAULT_V2_APPROVED_IDENTITY = {
  chainId: 677,
  flow: '0xcaab50f36252a57529afef651fa6b9f9281917ff',
  /** keccak256 of the live canonical FLOW runtime (1,786 bytes; SHA-256 2f86c4bb…a5ca in RELEASE_ACCEPTANCE.md). */
  flowRuntimeKeccak: '0x0bacd8088bb784e98bff4d87fbbf8b2bd991e016166e506750b5f9899fca3f8b',
  flowDecimals: 18,
  owner: '0x88a4cc1f5771523baeb83daeea07d323a3ce9507',
  ownerSafeOwners: ['0x0edff26415660c9d2d12320678192f1b97bebb85', '0x145e201c658706d3d2b9f35e0c51270474453b2b', '0x524db06954de917025180057bcbeb36ec96a98c5'],
  ownerSafeThreshold: 2n,
  publisher: '0x971e7790fe6c8f77dc666bb05d4aeda362653f94',
} as const;

const word = (address: string) => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('INVALID_TOKEN_ADDRESS');
  return address.slice(2).toLowerCase().padStart(64, '0');
};

/** Frozen runtime with every FLOW immutable slot patched; each slot must be zero-filled in the artifact. */
export function expectedVaultRuntime(token: string = VAULT_V2_APPROVED_IDENTITY.flow): Hex {
  let hex = VAULT_V2_UNPATCHED_RUNTIME.slice(2).toLowerCase();
  const patch = word(token);
  for (const start of VAULT_V2_FLOW_IMMUTABLE_OFFSETS) {
    const at = start * 2;
    if (hex.slice(at, at + 64) !== '0'.repeat(64)) throw new Error('FROZEN_ARTIFACT_SLOT_NOT_EMPTY');
    hex = hex.slice(0, at) + patch + hex.slice(at + 64);
  }
  return `0x${hex}`;
}

export type VaultIdentityEvidence = {
  chainId: number; blockNumber: bigint; blockHash: Hex; blockHashAfter: Hex;
  vaultCode: Hex | undefined; flowCode: Hex | undefined; flowDecimals: number;
  vaultFlow: string; vaultOwner: string; vaultPendingOwner: string; vaultPublisher: string;
  ownerCode: Hex | undefined; publisherCode: Hex | undefined;
  safeOwners: readonly string[]; safeThreshold: bigint;
};

const same = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

/** Pure fail-closed identity check. `suppliedCodeHash` is only ever compared, never used. */
export function verifyVaultIdentity(e: VaultIdentityEvidence, suppliedCodeHash?: string | null) {
  const A = VAULT_V2_APPROVED_IDENTITY;
  if (e.chainId !== A.chainId) throw new Error('WRONG_CHAIN');
  if (e.blockHash !== e.blockHashAfter || !/^0x[0-9a-f]{64}$/i.test(e.blockHash)) throw new Error('NON_CANONICAL_BLOCK_EVIDENCE');
  if (!e.vaultCode || e.vaultCode === '0x' || e.vaultCode.toLowerCase() !== expectedVaultRuntime(A.flow).toLowerCase()) throw new Error('VAULT_RUNTIME_NOT_FROZEN_CANDIDATE');
  const codeHash = keccak256(e.vaultCode);
  if (suppliedCodeHash != null && suppliedCodeHash.toLowerCase() !== codeHash.toLowerCase()) throw new Error('SUPPLIED_CODE_HASH_REJECTED');
  if (!e.flowCode || keccak256(e.flowCode) !== A.flowRuntimeKeccak) throw new Error('FLOW_TOKEN_RUNTIME_NOT_CANONICAL');
  if (e.flowDecimals !== A.flowDecimals || !same(e.vaultFlow, A.flow)) throw new Error('FLOW_TOKEN_IDENTITY_MISMATCH');
  if (!same(e.vaultOwner, A.owner) || BigInt(e.vaultPendingOwner || '0x0') !== 0n) throw new Error('VAULT_OWNER_NOT_APPROVED_SAFE');
  if (!e.ownerCode || e.ownerCode === '0x') throw new Error('OWNER_SAFE_HAS_NO_CODE');
  const owners = [...new Set(e.safeOwners.map(o => o.toLowerCase()))].sort();
  if (owners.length !== e.safeOwners.length || owners.join() !== [...A.ownerSafeOwners].sort().join() || e.safeThreshold !== A.ownerSafeThreshold) throw new Error('OWNER_SAFE_OWNERS_OR_THRESHOLD_MISMATCH');
  if (!same(e.vaultPublisher, A.publisher) || same(e.vaultPublisher, e.vaultOwner) || owners.includes(e.vaultPublisher.toLowerCase())) throw new Error('PUBLISHER_NOT_APPROVED');
  if (e.publisherCode && e.publisherCode !== '0x') throw new Error('PUBLISHER_NOT_EOA');
  return { codeHash, owner: A.owner, publisher: A.publisher, flow: A.flow };
}
