import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { keccak256, type Hex } from 'viem';
import { VAULT_V2_APPROVED_IDENTITY as A, expectedVaultRuntime, verifyVaultIdentity, type VaultIdentityEvidence } from './vaultV2Identity';
import { VAULT_V2_FLOW_IMMUTABLE_OFFSETS, VAULT_V2_UNPATCHED_RUNTIME, VAULT_V2_COMPILER, VAULT_V2_OPENZEPPELIN } from './vaultV2Runtime.generated';

const read = vi.hoisted(() => ({ readVaultV2: vi.fn() }));
vi.mock('./vaultV2Read', () => ({ vaultClient: vi.fn(), readVaultV2: read.readVaultV2 }));
import { verifiedVaultDeployment } from './vaultV2Ingestion.server';

const root = new URL('../../../contracts/production/rewards-vault-v2/verification/', import.meta.url);
const artifact = JSON.parse(readFileSync(new URL('artifact.json', root), 'utf8'));
const flowCode = readFileSync(new URL('flow-mainnet-runtime.hex', root), 'utf8').trim() as Hex;
const blockHash = `0x${'c'.repeat(64)}` as Hex;
const valid = (): VaultIdentityEvidence => ({
  chainId: 677, blockNumber: 100n, blockHash, blockHashAfter: blockHash, vaultCode: expectedVaultRuntime(), flowCode, flowDecimals: 18,
  vaultFlow: A.flow, vaultOwner: A.owner, vaultPendingOwner: '0x0000000000000000000000000000000000000000', vaultPublisher: A.publisher,
  ownerCode: '0x6080', publisherCode: undefined, safeOwners: [...A.ownerSafeOwners], safeThreshold: 2n,
});

it('generated runtime module is byte-identical to the frozen solc 0.8.20 / OZ 5.0.2 artifact', () => {
  expect(VAULT_V2_UNPATCHED_RUNTIME).toBe(`0x${artifact.evm.deployedBytecode.object}`);
  expect([...VAULT_V2_FLOW_IMMUTABLE_OFFSETS]).toEqual(Object.values(artifact.evm.deployedBytecode.immutableReferences).flat().map((r: any) => r.start));
  expect(VAULT_V2_FLOW_IMMUTABLE_OFFSETS).toHaveLength(7);
  expect(VAULT_V2_COMPILER).toBe('0.8.20+commit.a1b79de6.Emscripten.clang');
  expect(VAULT_V2_OPENZEPPELIN).toBe('5.0.2');
});
it('expected runtime patches all seven FLOW immutables with canonical Mainnet FLOW and nothing else', () => {
  const patched = expectedVaultRuntime().slice(2), raw = VAULT_V2_UNPATCHED_RUNTIME.slice(2);
  const word = A.flow.slice(2).padStart(64, '0');
  for (const s of VAULT_V2_FLOW_IMMUTABLE_OFFSETS) expect(patched.slice(s * 2, s * 2 + 64)).toBe(word);
  let diff = 0; for (let i = 0; i < raw.length; i++) if (raw[i] !== patched[i]) diff++;
  expect(diff).toBeGreaterThan(0); expect(patched.length).toBe(raw.length);
  expect(A.flow).toBe('0xcaab50f36252a57529afef651fa6b9f9281917ff');
});
it('canonical FLOW runtime fixture matches the recorded live identity', () => {
  expect(keccak256(flowCode)).toBe(A.flowRuntimeKeccak);
  expect(createHash('sha256').update(Buffer.from(flowCode.slice(2), 'hex')).digest('hex')).toBe('2f86c4bb190f0d46e7d0154d6f1de02f35e69d4aa2015e7ceecf647de5d7a5ca');
});
it('exact frozen runtime, canonical token and approved 2-of-3 Safe pass; hash is derived from actual code', () => {
  const r = verifyVaultIdentity(valid());
  expect(r.codeHash).toBe(keccak256(expectedVaultRuntime()));
  expect(r.publisher).toBe('0x971e7790fe6c8f77dc666bb05d4aeda362653f94');
  expect(r.owner).toBe('0x88a4cc1f5771523baeb83daeea07d323a3ce9507');
});
it('rejects wrong runtime', () => { expect(() => verifyVaultIdentity({ ...valid(), vaultCode: `${expectedVaultRuntime()}00` as Hex })).toThrow('VAULT_RUNTIME_NOT_FROZEN_CANDIDATE'); expect(() => verifyVaultIdentity({ ...valid(), vaultCode: '0x' })).toThrow('VAULT_RUNTIME'); });
it('rejects fake ABI-compatible contracts: unpatched artifact or a different immutable token', () => {
  expect(() => verifyVaultIdentity({ ...valid(), vaultCode: VAULT_V2_UNPATCHED_RUNTIME })).toThrow('VAULT_RUNTIME_NOT_FROZEN_CANDIDATE');
  expect(() => verifyVaultIdentity({ ...valid(), vaultCode: expectedVaultRuntime('0x' + '9'.repeat(40)) })).toThrow('VAULT_RUNTIME_NOT_FROZEN_CANDIDATE');
});
it('a false supplied code hash is rejected and never substitutes for the derived hash', () => {
  expect(() => verifyVaultIdentity(valid(), `0x${'4'.repeat(64)}`)).toThrow('SUPPLIED_CODE_HASH_REJECTED');
  expect(() => verifyVaultIdentity({ ...valid(), vaultCode: VAULT_V2_UNPATCHED_RUNTIME }, keccak256(VAULT_V2_UNPATCHED_RUNTIME))).toThrow('VAULT_RUNTIME_NOT_FROZEN_CANDIDATE');
});
it('rejects wrong token implementation, decimals or token address', () => {
  expect(() => verifyVaultIdentity({ ...valid(), flowCode: `${flowCode}00` as Hex })).toThrow('FLOW_TOKEN_RUNTIME_NOT_CANONICAL');
  expect(() => verifyVaultIdentity({ ...valid(), flowDecimals: 6 })).toThrow('FLOW_TOKEN_IDENTITY_MISMATCH');
  expect(() => verifyVaultIdentity({ ...valid(), vaultFlow: '0x' + '9'.repeat(40) })).toThrow('FLOW_TOKEN_IDENTITY_MISMATCH');
});
it('rejects bad governance owner, pending owner, Safe owners or threshold', () => {
  expect(() => verifyVaultIdentity({ ...valid(), vaultOwner: '0x' + '5'.repeat(40) })).toThrow('VAULT_OWNER_NOT_APPROVED_SAFE');
  expect(() => verifyVaultIdentity({ ...valid(), vaultPendingOwner: '0x' + '5'.repeat(40) })).toThrow('VAULT_OWNER_NOT_APPROVED_SAFE');
  expect(() => verifyVaultIdentity({ ...valid(), ownerCode: '0x' })).toThrow('OWNER_SAFE_HAS_NO_CODE');
  expect(() => verifyVaultIdentity({ ...valid(), safeThreshold: 1n })).toThrow('OWNER_SAFE_OWNERS_OR_THRESHOLD_MISMATCH');
  expect(() => verifyVaultIdentity({ ...valid(), safeOwners: A.ownerSafeOwners.slice(0, 2) })).toThrow('OWNER_SAFE_OWNERS_OR_THRESHOLD_MISMATCH');
  expect(() => verifyVaultIdentity({ ...valid(), safeOwners: [A.ownerSafeOwners[0], A.ownerSafeOwners[0], A.ownerSafeOwners[1]] })).toThrow('OWNER_SAFE_OWNERS_OR_THRESHOLD_MISMATCH');
  expect(() => verifyVaultIdentity({ ...valid(), safeOwners: [...A.ownerSafeOwners.slice(0, 2), '0x' + '6'.repeat(40)] })).toThrow('OWNER_SAFE_OWNERS_OR_THRESHOLD_MISMATCH');
});
it('rejects an unapproved, contract or owner-equal publisher', () => {
  expect(() => verifyVaultIdentity({ ...valid(), vaultPublisher: '0x' + '7'.repeat(40) })).toThrow('PUBLISHER_NOT_APPROVED');
  expect(() => verifyVaultIdentity({ ...valid(), vaultPublisher: A.owner })).toThrow('PUBLISHER_NOT_APPROVED');
  expect(() => verifyVaultIdentity({ ...valid(), publisherCode: '0x6080' })).toThrow('PUBLISHER_NOT_EOA');
});
it('rejects wrong chain and non-canonical block evidence', () => {
  expect(() => verifyVaultIdentity({ ...valid(), chainId: 968 })).toThrow('WRONG_CHAIN');
  expect(() => verifyVaultIdentity({ ...valid(), blockHashAfter: `0x${'d'.repeat(64)}` })).toThrow('NON_CANONICAL_BLOCK_EVIDENCE');
});

describeServer();
function describeServer() {
  const vault = '0x' + '3'.repeat(40);
  let chain: Record<string, unknown>;
  const client = () => ({
    getChainId: vi.fn(async () => chain.chainId),
    getBlock: vi.fn(async () => ({ number: 100n, hash: blockHash })),
    getCode: vi.fn(async ({ address }: { address: string }) => address.toLowerCase() === vault ? chain.vaultCode : address.toLowerCase() === A.flow ? chain.flowCode : address.toLowerCase() === A.owner ? '0x6080' : undefined),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => chain[functionName]),
  });
  beforeEach(() => {
    chain = { chainId: 677, vaultCode: expectedVaultRuntime(), flowCode, flow: A.flow, owner: A.owner, pendingOwner: '0x0000000000000000000000000000000000000000', publisher: A.publisher, decimals: 18, getOwners: [...A.ownerSafeOwners], getThreshold: 2n };
    read.readVaultV2.mockReset().mockResolvedValue({ free: 10n, batchCap: 5n, dailyCap: 10n, blockNumber: 100n, blockHash });
  });
  it('activation evidence binds the derived hash and approved publisher from live reads', async () => {
    const e = await verifiedVaultDeployment(vault as never, client() as never);
    expect(e.codeHash).toBe(keccak256(expectedVaultRuntime()));
    expect(e.publisher).toBe(A.publisher); expect(e.ownerSafeThreshold).toBe('2');
    expect(read.readVaultV2).toHaveBeenCalledWith(undefined, expect.objectContaining({ codeHash: keccak256(expectedVaultRuntime()), publisher: A.publisher }));
  });
  it('activation fails closed on a fake compatible deployment before any cap read', async () => {
    chain.vaultCode = VAULT_V2_UNPATCHED_RUNTIME;
    await expect(verifiedVaultDeployment(vault as never, client() as never)).rejects.toThrow('VAULT_RUNTIME_NOT_FROZEN_CANDIDATE');
    expect(read.readVaultV2).not.toHaveBeenCalled();
  });
  it('activation fails closed on wrong Safe threshold, publisher or chain', async () => {
    chain.getThreshold = 1n; await expect(verifiedVaultDeployment(vault as never, client() as never)).rejects.toThrow('THRESHOLD');
    chain.getThreshold = 2n; chain.publisher = '0x' + '7'.repeat(40); await expect(verifiedVaultDeployment(vault as never, client() as never)).rejects.toThrow('PUBLISHER_NOT_APPROVED');
    chain.publisher = A.publisher; chain.chainId = 968; await expect(verifiedVaultDeployment(vault as never, client() as never)).rejects.toThrow('WRONG_RPC_CHAIN');
  });
}
