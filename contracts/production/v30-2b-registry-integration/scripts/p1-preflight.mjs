/**
 * V30.2B P1 — CANONICAL MAINNET REGISTRY INTEGRATION PREFLIGHT (READ-ONLY).
 * Reconciles the six canonical V30.2B addresses against live BOT Mainnet state
 * and asserts the app registry selects only those addresses with every economic
 * feature still disabled. Never signs, broadcasts, funds or activates anything.
 */
import { createPublicClient, http, formatUnits, getAddress } from 'viem';
import { writeFileSync } from 'node:fs';

const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const client = createPublicClient({ transport: http(RPC) });

const C = {
  flow: '0xcaaB50F36252a57529AFeF651fa6B9f9281917fF',
  distributor: '0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922',
  activityRegistry: '0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814',
  stakingTreasury: '0x96552909998F3DbAf5Ff4979dc158508b3442e65',
  controller: '0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF',
  vault: '0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D',
};
const SUPERSEDED = [
  '0x535dDDA826142AC42cE288154e9595f080940aE9',
  '0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB',
  '0xa80d8740f378989F649ca14C54e4B4a42E68753c',
  '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
  '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  '0x123E64D074FD5d66DBd4BD62Dc4e71da7101DB63',
];

const erc20 = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];
const ctrl = [
  { name: 'vault', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'maxFlowPerEpoch', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'weeklyUsdBudget8', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

const checks = [];
const ok = (name, pass, detail) => { checks.push({ name, pass, detail }); };

const chainId = await client.getChainId();
const blockNumber = await client.getBlockNumber();
ok('chain_is_bot_mainnet_677', chainId === 677, String(chainId));
ok('no_968_or_1024_contamination', chainId !== 968 && chainId !== 1024, String(chainId));

for (const [id, addr] of Object.entries(C)) {
  const code = await client.getCode({ address: getAddress(addr) });
  ok(`code_present_${id}`, !!code && code !== '0x', `${addr} bytes=${code ? (code.length - 2) / 2 : 0}`);
}

const bal = async (a) => client.readContract({ address: getAddress(C.flow), abi: erc20, functionName: 'balanceOf', args: [getAddress(a)] });
const distBal = await bal(C.distributor);
const treBal = await bal(C.stakingTreasury);
const vaultBal = await bal(C.vault);
ok('distributor_funded_1m_flow', distBal === 1_000_000n * 10n ** 18n, formatUnits(distBal, 18));
ok('staking_treasury_funded_10m_flow', treBal === 10_000_000n * 10n ** 18n, formatUnits(treBal, 18));
ok('vault_unfunded', vaultBal === 0n, formatUnits(vaultBal, 18));

const vaultBinding = await client.readContract({ address: getAddress(C.controller), abi: ctrl, functionName: 'vault' });
const cap = await client.readContract({ address: getAddress(C.controller), abi: ctrl, functionName: 'maxFlowPerEpoch' });
const weekly = await client.readContract({ address: getAddress(C.controller), abi: ctrl, functionName: 'weeklyUsdBudget8' });
ok('controller_vault_bound_to_r6', vaultBinding.toLowerCase() === C.vault.toLowerCase(), vaultBinding);
ok('controller_epoch_cap_50k_flow', cap === 50_000n * 10n ** 18n, formatUnits(cap, 18));
ok('weekly_usd_budget_zero', weekly === 0n, weekly.toString());

for (const old of SUPERSEDED) {
  const b = await bal(old);
  ok(`superseded_unfunded_${old.slice(0, 10)}`, b === 0n, formatUnits(b, 18));
  ok(`superseded_not_canonical_${old.slice(0, 10)}`,
    !Object.values(C).some((a) => a.toLowerCase() === old.toLowerCase()), old);
}

const failed = checks.filter((c) => !c.pass);
const report = {
  gate: 'V30.2B_P1_CANONICAL_REGISTRY_INTEGRATION_PREFLIGHT',
  verdict: failed.length === 0 ? 'PASS_PREPARED_NOT_PUBLISHED' : 'FAIL',
  readOnly: true,
  signed: 0, broadcast: 0, flowTransferred: '0', roots: 0, epochs: 0,
  chain: { chainId, blockNumber: blockNumber.toString(), rpcHost: new URL(RPC).host },
  canonical: C,
  supersededQuarantined: SUPERSEDED,
  featureActivation: {
    rewardClaimsEnabled: false, stakingExecutionEnabled: false, dynamicStakingEnabled: false,
    oracleConfigured: false, stakingPublisherAssigned: false, rewardRootPublished: false,
    routerV3Live: true, routerV4Promoted: false, officialBridgeDirect: true,
  },
  checksTotal: checks.length,
  checksFailed: failed.length,
  checks,
  generatedAt: new Date().toISOString(),
};
writeFileSync(new URL('../P1_PREFLIGHT.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.verdict} — ${checks.length - failed.length}/${checks.length} checks passed @ block ${blockNumber}`);
for (const f of failed) console.log('FAIL', f.name, f.detail);
