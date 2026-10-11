// V30.2B P3E — 90D/180D/365D long-term canary preparation.
// Live mainnet: READ-ONLY. Sequential approve/open runs ONLY on a local anvil fork
// (impersonated canary) to measure gas and sequential Genesis quota effects.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createTestClient, createWalletClient, http, getAddress, formatEther, parseEther, encodeFunctionData } from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  treasury: getAddress('0x96552909998F3DbAf5Ff4979dc158508b3442e65'),
  controller: getAddress('0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF'),
  vault: getAddress('0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D'),
};
const CANARY = getAddress('0x3d8a7fa490f9db09dd8006b74688213ace9c0164');
const PRINCIPAL = parseEther('1');
const PRODUCTS = [{ id: 2, name: '90D', lock: 7776000, g: 3600, f: 1000 }, { id: 3, name: '180D', lock: 15552000, g: 4800, f: 1200 }, { id: 4, name: '365D', lock: 31536000, g: 6000, f: 1500 }];
const abi = {
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const live = createPublicClient({ transport: http('https://rpc.botchain.ai') });
const fork = createPublicClient({ transport: http('http://127.0.0.1:8899') });
const test = createTestClient({ mode: 'anvil', transport: http('http://127.0.0.1:8899') });
const wallet = createWalletClient({ account: CANARY, transport: http('http://127.0.0.1:8899') });
const fail = []; const checks = [];
const check = (ok, label, d) => { checks.push({ ok, label, d: d ?? null }); if (!ok) fail.push(label); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${d ? ` (${d})` : ''}`); };
const r = (c, a, fn, args = []) => c.readContract({ address: a === 'flow' ? A.flow : A[a], abi: a === 'flow' ? erc20 : abi[a], functionName: fn, args });

const block = await live.getBlock();
check((await live.getChainId()) === 677, 'live chain 677');
check(/^0x0{40}$/i.test(await r(live, 'controller', 'oracle')), 'oracle unset (0x0)');
check((await r(live, 'controller', 'emergencyMode')) === false, 'emergencyMode false');
check((await r(live, 'vault', 'paused')) === false, 'vault not paused');
const terms = {};
for (const p of PRODUCTS) {
  const [active, lock, g, f, target, cap, min] = await r(live, 'controller', 'products', [BigInt(p.id)]);
  terms[p.name] = { active, lockSeconds: Number(lock), genesisAprBps: Number(g), floorBps: Number(f), targetBps: Number(target), hardCapBps: Number(cap), minPrincipalWei: min.toString() };
  check(active && Number(lock) === p.lock && Number(g) === p.g && Number(f) === p.f && PRINCIPAL >= min, `${p.name} live config matches release terms`);
}
const flowBal = await r(live, 'flow', 'balanceOf', [CANARY]);
const botBal = await live.getBalance({ address: CANARY });
const allowance0 = await r(live, 'flow', 'allowance', [CANARY, A.vault]);
const quota0 = await r(live, 'vault', 'genesisQuotaRemainingSeconds', [CANARY]);
const gasPrice = await live.getGasPrice();
const free0 = await r(live, 'treasury', 'freeBalance');
const nextId0 = await r(live, 'vault', 'nextPositionId');
check(flowBal >= 3n * PRINCIPAL, 'canary holds >= 3 FLOW', formatEther(flowBal));

// ---- fork: sequential approve + open, from the canary (fork only)
await test.impersonateAccount({ address: CANARY });
await test.setBalance({ address: CANARY, value: parseEther('10') });
const fees = []; const plan = [];
let total = 0n;
for (const p of PRODUCTS) {
  const quote = await r(fork, 'vault', 'quoteOpen', [p.id, CANARY, PRINCIPAL]);
  const aData = encodeFunctionData({ abi: erc20, functionName: 'approve', args: [A.vault, PRINCIPAL] });
  const aGas = await fork.estimateGas({ account: CANARY, to: A.flow, data: aData });
  let h = await wallet.sendTransaction({ to: A.flow, data: aData, chain: null });
  check((await fork.waitForTransactionReceipt({ hash: h })).status === 'success', `${p.name} fork approve ok`);
  const oData = encodeFunctionData({ abi: abi.vault, functionName: 'openPosition', args: [p.id, PRINCIPAL] });
  const oGas = await fork.estimateGas({ account: CANARY, to: A.vault, data: oData });
  const id = await r(fork, 'vault', 'nextPositionId');
  h = await wallet.sendTransaction({ to: A.vault, data: oData, chain: null });
  const rc = await fork.waitForTransactionReceipt({ hash: h });
  check(rc.status === 'success', `${p.name} fork openPosition ok`, `gas ${rc.gasUsed}`);
  const ts = Number((await fork.getBlock({ blockNumber: rc.blockNumber })).timestamp);
  total += (aGas + oGas) * gasPrice;
  plan.push({ product: p.name, productId: p.id, expectedPositionIdIfOpenedInThisOrder: Number(id),
    tx1: { to: A.flow, data: aData, value: '0', description: `approve(vault, 1 FLOW) exact`, gasEstimate: aGas.toString() },
    tx2: { to: A.vault, data: oData, value: '0', description: `openPosition(${p.id}, 1 FLOW)`, gasEstimate: oGas.toString() },
    quote: { genesisRateBps: Number(quote[0]), genesisSeconds: Number(quote[1]), genesisWei: quote[2].toString(), genesisFlow: formatEther(quote[2]), floorRateBps: Number(quote[3]), floorWei: quote[4].toString(), floorFlow: formatEther(quote[4]) },
    simulatedMaturityAfterOpenSeconds: p.lock, maturityIfOpenedNow: new Date((Number(block.timestamp) + p.lock) * 1000).toISOString(), forkOpenedAt: ts });
}
const quotaEnd = await r(fork, 'vault', 'genesisQuotaRemainingSeconds', [CANARY]);
const reserved = plan.reduce((s, x) => s + BigInt(x.quote.genesisWei) + BigInt(x.quote.floorWei), 0n);
check(reserved <= free0, 'all three reservations fit treasury free balance', formatEther(reserved));
const gasNeeded = total;
check(botBal >= gasNeeded, 'canary BOT covers gas for 6 txs at current gas price', `${formatEther(botBal)} BOT vs ${formatEther(gasNeeded)} needed`);
await test.stopImpersonatingAccount({ address: CANARY });

const out = { gate: 'V30.2B P3E — 90D/180D/365D canary preparation (unsigned)', generatedAt: new Date().toISOString(), chainId: 677, liveBlock: Number(block.number), canary: CANARY,
  live: { terms, canaryFlow: formatEther(flowBal), canaryBot: formatEther(botBal), allowanceToVault: formatEther(allowance0), genesisQuotaRemainingSeconds: Number(quota0), gasPriceWei: gasPrice.toString(), treasuryFreeFlow: formatEther(free0), nextPositionId: Number(nextId0) },
  sequentialPlan: plan, genesisQuotaAfterAllThreeSeconds: Number(quotaEnd), totalReservationFlow: formatEther(reserved), totalGasCostBot: formatEther(gasNeeded),
  mainnetWrites: 0, decision: fail.length ? 'BLOCKED' : 'READY_FOR_SIGNING_APPROVAL', failures: fail, checks };
fs.writeFileSync(path.join(D, 'P3E_LONGTERM_CANARY_PREP.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ decision: out.decision, failures: fail, live: out.live, quotaEnd: out.genesisQuotaAfterAllThreeSeconds, reserved: out.totalReservationFlow, gas: out.totalGasCostBot, quotes: plan.map(x => [x.product, x.quote.genesisSeconds, x.quote.genesisFlow, x.quote.floorFlow, x.tx1.gasEstimate, x.tx2.gasEstimate]) }, null, 1));
