/** Fixed-target, read-only BNB56 identity observation. No wallet, key, signature, from/value, state override or send method. */
import { decodeFunctionResult, encodeFunctionData, getAddress, keccak256, parseAbi, toHex, type Abi, type Hex } from 'viem';
import { mkdir, writeFile } from 'node:fs/promises';
import { assessAddressInput, assessSafePolicy, assertReadOnlyRpcMethod, classifyObservedAddress, type EndpointAddressObservation, type SafeProbe } from '../src/lib/bnb/addressVerification';

const INPUTS = {
  guardian: '0x351E236a636c8be4Fa0B602cb096d72346D1a412',
  treasury: '0xb7322660B40561ae7C224F963e51583e923F7fC8',
} as const;
const ENDPOINTS = [
  { id: 'BNB_CHAIN_OFFICIAL', url: 'https://bsc-dataseed.bnbchain.org', provenance: 'https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/' },
  { id: 'PUBLICNODE', url: 'https://bsc-rpc.publicnode.com', provenance: 'https://bsc.publicnode.com/' },
] as const;
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const HANDLER_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
const safeAbi = parseAbi(['function getOwners() view returns (address[])', 'function getThreshold() view returns (uint256)', 'function VERSION() view returns (string)', 'function domainSeparator() view returns (bytes32)', 'function getChainId() view returns (uint256)']);
const blocklistAbi = parseAbi(['function isBlackListed(address) view returns (bool)', 'function getBlackListStatus(address) view returns (bool)']);
const calls: { endpoint: string; method: string; target?: string; selector?: string; block?: string; ok: boolean; error?: string }[] = [];
let sequence = 0;

async function rpc(endpoint: typeof ENDPOINTS[number], method: string, params: unknown[]) {
  assertReadOnlyRpcMethod(method);
  if (!['eth_chainId', 'eth_blockNumber'].includes(method)) {
    const block = params[method === 'eth_getStorageAt' ? 2 : 1];
    if (method !== 'eth_getBlockByNumber' && !/^0x[0-9a-f]+$/.test(String(block))) throw new Error('UNPINNED_READ');
  }
  if (method === 'eth_call') {
    const call = params[0] as Record<string, unknown>;
    if (Object.keys(call).some((key) => !['to', 'data'].includes(key))) throw new Error('FORBIDDEN_CALL_FIELD');
  }
  const call = params[0] as { to?: string; data?: string } | undefined;
  const record: typeof calls[number] = { endpoint: endpoint.id, method, target: call?.to ?? (method === 'eth_getCode' || method === 'eth_getStorageAt' ? String(params[0]) : undefined), selector: call?.data?.slice(0, 10), block: typeof params[1] === 'string' ? params[1] : undefined, ok: false };
  calls.push(record);
  try {
    const response = await fetch(endpoint.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const body = await response.json() as { result?: unknown; error?: { code: number; message: string } };
    if (body.error || body.result === undefined) throw new Error(body.error ? (/execution reverted/i.test(body.error.message) ? 'EXECUTION_REVERTED' : `RPC_${body.error.code}`) : 'MISSING_RESULT');
    record.ok = true;
    return body.result;
  } catch (error) {
    record.error = error instanceof Error ? error.message.slice(0, 100) : 'RPC_ERROR';
    throw error;
  }
}
async function call(endpoint: typeof ENDPOINTS[number], block: Hex, to: string, abi: Abi, functionName: string, args: readonly unknown[] = []) {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const result = await rpc(endpoint, 'eth_call', [{ to, data }, block]) as Hex;
  return decodeFunctionResult({ abi, functionName, data: result });
}
function slotAddress(value: Hex) {
  const body = value.slice(-40);
  return /^0{40}$/.test(body) ? null : getAddress('0x' + body);
}
async function observeSafe(endpoint: typeof ENDPOINTS[number], block: Hex, address: string): Promise<{ safe: SafeProbe | null; safeError: 'NOT_SAFE' | 'INCONCLUSIVE' | null }> {
  try {
    const rawOwners = await call(endpoint, block, address, safeAbi, 'getOwners') as readonly string[];
    const threshold = Number(await call(endpoint, block, address, safeAbi, 'getThreshold') as bigint);
    const owners = rawOwners.map((owner) => getAddress(owner));
    const ownersValid = owners.length > 0 && new Set(owners.map((owner) => owner.toLowerCase())).size === owners.length && owners.every((owner) => !/^0x0{40}$/.test(owner));
    const ownersHash = keccak256(toHex(owners.map((owner) => owner.toLowerCase()).join(',')));
    const [version, domainSeparator, safeChainId, implementationSlot, handlerSlot] = await Promise.all([
      call(endpoint, block, address, safeAbi, 'VERSION'), call(endpoint, block, address, safeAbi, 'domainSeparator'),
      call(endpoint, block, address, safeAbi, 'getChainId'), rpc(endpoint, 'eth_getStorageAt', [address, IMPL_SLOT, block]), rpc(endpoint, 'eth_getStorageAt', [address, HANDLER_SLOT, block]),
    ]) as [string, Hex, bigint, Hex, Hex];
    return { safe: { ownersCount: owners.length, ownersHash, ownersValid, threshold, version, domainSeparator, safeChainId: Number(safeChainId), implementation: slotAddress(implementationSlot), handler: slotAddress(handlerSlot) }, safeError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // A successful owners/threshold response followed by another failed probe is inconclusive, never proof of non-Safe.
    const nonSafe = !message.startsWith('HTTP_') && !message.startsWith('RPC_') && !message.includes('fetch') && !message.includes('abort');
    return { safe: null, safeError: nonSafe ? 'NOT_SAFE' : 'INCONCLUSIVE' };
  }
}
async function recipientBlocklist(endpoint: typeof ENDPOINTS[number], block: Hex, recipient: string) {
  for (const method of ['isBlackListed', 'getBlackListStatus'] as const) {
    try {
      const result = await call(endpoint, block, USDT, blocklistAbi, method, [recipient]);
      return { method, supported: true, blocked: result as boolean };
    } catch { /* try the next actual issuer method; absence is UNKNOWN */ }
  }
  return { method: null, supported: false, blocked: null, status: 'UNKNOWN_NO_SUPPORTED_AUTHORITATIVE_METHOD' };
}
async function main() {
  const generatedAt = new Date().toISOString();
  const inputAssessment = Object.fromEntries(Object.entries(INPUTS).map(([role, input]) => [role, assessAddressInput(input)]));
  const canonical = Object.fromEntries(Object.entries(inputAssessment).map(([role, value]) => [role, value.canonical])) as Record<keyof typeof INPUTS, string | null>;
  if (Object.values(canonical).some((address) => !address)) throw new Error('MALFORMED_OWNER_INPUT');
  const head = BigInt(await rpc(ENDPOINTS[0], 'eth_blockNumber', []) as Hex);
  const blockNumber = head > 5n ? head - 5n : head;
  const block = toHex(blockNumber);
  const blockObservations = [];
  for (const endpoint of ENDPOINTS) {
    const chainId = Number(BigInt(await rpc(endpoint, 'eth_chainId', []) as Hex));
    const header = await rpc(endpoint, 'eth_getBlockByNumber', [block, false]) as { number: Hex; hash: Hex; timestamp: Hex };
    blockObservations.push({ endpointId: endpoint.id, chainId, blockNumber: Number(BigInt(header.number)), blockHash: header.hash, blockTime: new Date(Number(BigInt(header.timestamp)) * 1000).toISOString() });
  }
  const observations: Record<keyof typeof INPUTS, EndpointAddressObservation[]> = { guardian: [], treasury: [] };
  const recipientChecks: Record<string, unknown> = {};
  for (const [role, address] of Object.entries(canonical) as [keyof typeof INPUTS, string][]) {
    for (const [index, endpoint] of ENDPOINTS.entries()) {
      const common = blockObservations[index]!;
      try {
        const code = await rpc(endpoint, 'eth_getCode', [address, block]) as Hex;
        const codeBytes = code === '0x' ? 0 : (code.length - 2) / 2;
        const safeResult = codeBytes > 0 ? await observeSafe(endpoint, block, address) : { safe: null, safeError: null };
        observations[role].push({ endpointId: endpoint.id, chainId: common.chainId, blockNumber: common.blockNumber, blockHash: common.blockHash, codeHash: keccak256(code), codeBytes, ...safeResult, rpcError: null });
      } catch (error) {
        observations[role].push({ endpointId: endpoint.id, chainId: common.chainId, blockNumber: common.blockNumber, blockHash: common.blockHash, codeHash: null, codeBytes: null, safe: null, safeError: 'INCONCLUSIVE', rpcError: error instanceof Error ? error.message.slice(0, 100) : 'RPC_ERROR' });
      }
    }
  }
  const results = Object.fromEntries(Object.entries(INPUTS).map(([role, input]) => [role, { ...classifyObservedAddress(input, observations[role as keyof typeof INPUTS]), observations: observations[role as keyof typeof INPUTS] }])) as Record<keyof typeof INPUTS, ReturnType<typeof classifyObservedAddress> & { observations: EndpointAddressObservation[] }>;
  for (const endpoint of ENDPOINTS) recipientChecks[endpoint.id] = await recipientBlocklist(endpoint, block, canonical.treasury!);
  const blocklistAgree = recipientChecks[ENDPOINTS[0].id]!.supported === true && JSON.stringify(recipientChecks[ENDPOINTS[0].id]) === JSON.stringify(recipientChecks[ENDPOINTS[1].id]);
  const policy = assessSafePolicy(results.guardian, results.treasury, results.guardian.canonical, results.treasury.canonical);
  const evidence = {
    schema: 'FLOWBRIDGE_BNB_OWNER_ADDRESS_VERIFICATION_V1', generatedAt,
    scope: 'OWNER_PROVIDED_READ_ONLY_IDENTITY_OBSERVATION', privateReadinessRecord: true,
    sourceProvenance: { ownerMessageUtc: '2026-11-26T04:25:00Z', endpoints: ENDPOINTS, frozenV113SourceSha256: '5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425' },
    execution: { BNB_EXECUTION_ENABLED: false, deploymentAuthorized: false, roleSelectionAuthorized: false, feeBpsSelected: null, writesAttempted: 0 },
    block: { requestedNumber: Number(blockNumber), observations: blockObservations },
    addresses: results,
    treasuryIssuerBlocklist: { token: 'BSC_USDT', tokenAddress: USDT, perEndpoint: recipientChecks, status: blocklistAgree ? (recipientChecks[ENDPOINTS[0].id]!.blocked ? 'BLOCKED' : 'NOT_BLOCKED_BY_SUPPORTED_METHOD') : 'UNKNOWN' },
    safeMultisigPolicy: policy,
    ownerAddressesDisclosure: 'Only owner count and hash retained; individual Safe owner addresses are redacted.',
    rpcCalls: calls,
    rpcCallCount: calls.length,
    writeMethodCount: calls.filter((call) => /send|sign|approve/i.test(call.method)).length,
    limitations: ['Public RPC agreement is evidence, not wallet ownership or independent human review.', 'Safe-compatible ABI does not prove official factory provenance unless separately verified.', 'No contract writes, access tests, signatures, deployment or fee activation.'],
  };
  await mkdir('contracts/audit/bnb-v114-community-readiness', { recursive: true });
  await writeFile('contracts/audit/bnb-v114-community-readiness/OWNER_ADDRESS_VERIFICATION.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ generatedAt, block: evidence.block, results: Object.fromEntries(Object.entries(results).map(([role, result]) => [role, { status: result.status, canonical: result.canonical, reasons: result.reasons, threshold: result.threshold, ownersCount: result.ownersCount }])), blocklist: evidence.treasuryIssuerBlocklist.status, policy, rpcCallCount: calls.length, writeMethodCount: evidence.writeMethodCount }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
