// TronLink signing path for USDT (TRC-20) ↔ BOT Chain bridge.
// Non-EVM: base58 T-addresses, tronWeb SDK injected by TronLink extension.
// Docs: docs/bridge/README.md — shared USDT resource ID used across gateways.

import { USDT_BRIDGE_RESOURCE_ID, getContracts } from './contracts';

// Standard BOT Chain BridgeGateway destination chain id assigned to BOT chain
// (Bohr registered id). Tron itself uses `728126428` in the ChainBridge
// convention; from BOT gateway we send to BOT chain, so use the BOT chain id.
export const BOT_DEST_CHAIN_ID_FROM_TRON = { mainnet: 677, testnet: 968 } as const;
// From BOT gateway, USDT being sent to Tron uses the BOT-Chain-registered
// destination id for Tron. This value is not published in the docs; use the
// ChainBridge canonical Tron mainnet id and allow override via env if needed.
export const TRX_DEST_CHAIN_ID = { mainnet: 728126428, testnet: 2494104990 } as const;

export const TRON_EXPLORER_TX_PREFIX = 'https://tronscan.org/#/transaction/';

declare global {
  interface Window {
    tronWeb?: any;
    tronLink?: any;
  }
}

export type TronStatus = 'unavailable' | 'locked' | 'ready';

export function isTronWebInjected(): boolean {
  return typeof window !== 'undefined' && !!window.tronWeb;
}

export function isTronLinkAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.tronWeb && window.tronWeb.ready);
}

export function getTronStatus(): TronStatus {
  if (!isTronWebInjected()) return 'unavailable';
  const addr = window.tronWeb?.defaultAddress?.base58;
  if (!window.tronWeb.ready || !addr) return 'locked';
  return 'ready';
}

/** Poll for TronLink injection — the extension often injects tronWeb after page load. */
export function waitForTronWeb(timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    if (isTronWebInjected()) return resolve(true);
    const start = Date.now();
    const id = window.setInterval(() => {
      if (isTronWebInjected()) { window.clearInterval(id); resolve(true); }
      else if (Date.now() - start > timeoutMs) { window.clearInterval(id); resolve(false); }
    }, 250);
  });
}

/** Subscribe to TronLink account/lock changes. Returns unsubscribe. */
export function subscribeTronLink(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: MessageEvent) => {
    const msg = (e && e.data && (e.data as any).message) || null;
    if (!msg) return;
    if (msg.action === 'setAccount' || msg.action === 'accountsChanged' ||
        msg.action === 'setNode' || msg.action === 'connect' || msg.action === 'disconnect') {
      cb();
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export async function requestTronLinkAccounts(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  // Wait briefly for extension injection (installed but not yet ready).
  if (!isTronWebInjected()) await waitForTronWeb(4000);
  try {
    if (window.tronLink?.request) {
      const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
      // TronLink returns { code: 4001 } on user rejection, 4000 = already processing.
      if (res && typeof res === 'object' && 'code' in res) {
        if (res.code === 4001) throw new Error('TronLink connection rejected. Click Connect Tron to try again.');
        if (res.code === 4000) throw new Error('TronLink is already processing a request. Open the extension and complete it.');
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('rejected') || e?.message?.includes('already processing')) throw e;
    // Silent for other injection quirks — fall through to read defaultAddress.
  }
  return window.tronWeb?.defaultAddress?.base58 || null;
}

export function isValidTronAddress(addr: string): boolean {
  if (!addr || typeof addr !== 'string') return false;
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false;
  if (typeof window !== 'undefined' && window.tronWeb?.isAddress) {
    try { return !!window.tronWeb.isAddress(addr); } catch { /* fall through */ }
  }
  return true;
}

/** Fetch TRC-20 USDT balance for a base58 address, formatted as a decimal string. */
export async function fetchTronUsdtBalance(base58: string, isMainnet: boolean): Promise<string> {
  if (!isTronLinkAvailable() || !base58) return '0';
  const { usdtTron } = getContracts(isMainnet);
  if (!usdtTron) return '0';
  try {
    const contract = await window.tronWeb.contract().at(usdtTron);
    const raw = await contract.balanceOf(base58).call();
    const bn = BigInt(raw.toString());
    // TRC-20 USDT decimals = 6
    const whole = bn / 1_000_000n;
    const frac = bn % 1_000_000n;
    return `${whole.toString()}.${frac.toString().padStart(6, '0')}`.replace(/\.?0+$/, '') || '0';
  } catch {
    return '0';
  }
}

/** TRC-20 allowance in raw base units. */
export async function fetchTronUsdtAllowance(owner: string, spender: string, isMainnet: boolean): Promise<bigint> {
  if (!isTronLinkAvailable() || !owner || !spender) return 0n;
  const { usdtTron } = getContracts(isMainnet);
  try {
    const contract = await window.tronWeb.contract().at(usdtTron);
    const raw = await contract.allowance(owner, spender).call();
    return BigInt(raw.toString());
  } catch {
    return 0n;
  }
}

export async function tronApproveUsdt(amountBase: bigint, isMainnet: boolean): Promise<string> {
  if (!isTronLinkAvailable()) throw new Error('TronLink not detected. Install TronLink to bridge from Tron.');
  const { usdtTron, tronBridgeProxy } = getContracts(isMainnet);
  if (!tronBridgeProxy) throw new Error('Tron bridge is not configured for this network.');
  const contract = await window.tronWeb.contract().at(usdtTron);
  const tx = await contract.approve(tronBridgeProxy, amountBase.toString()).send({ feeLimit: 100_000_000 });
  return typeof tx === 'string' ? tx : (tx?.txid || tx?.transaction?.txID || '');
}

/**
 * Bridge USDT from Tron → BOT Chain.
 * `recipientHexBot` MUST be a 0x… EVM address (BOT Chain wallet).
 */
export async function tronBridgeDepositToBot(params: {
  amountBase: bigint;             // TRC-20 base units (6 dp)
  recipientHexBot: string;        // 0x… BOT chain recipient
  isMainnet: boolean;
}): Promise<string> {
  const { amountBase, recipientHexBot, isMainnet } = params;
  if (!isTronLinkAvailable()) throw new Error('TronLink not detected. Install TronLink to bridge from Tron.');
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipientHexBot) || recipientHexBot === '0x0000000000000000000000000000000000000000') {
    throw new Error('Invalid BOT chain recipient address.');
  }
  const { tronBridgeProxy } = getContracts(isMainnet);
  if (!tronBridgeProxy) throw new Error('Tron bridge is not configured for this network.');

  const destChainId = isMainnet ? BOT_DEST_CHAIN_ID_FROM_TRON.mainnet : BOT_DEST_CHAIN_ID_FROM_TRON.testnet;
  const tronWeb = window.tronWeb;
  const owner = tronWeb.defaultAddress?.base58;
  if (!owner) throw new Error('Unlock TronLink and select an account before bridging.');

  const parameter = [
    { type: 'uint256', value: destChainId },
    { type: 'bytes32', value: USDT_BRIDGE_RESOURCE_ID },
    { type: 'address', value: recipientHexBot },
    { type: 'uint256', value: amountBase.toString() },
  ];

  const { transaction } = await tronWeb.transactionBuilder.triggerSmartContract(
    tronBridgeProxy,
    'deposit(uint256,bytes32,address,uint256)',
    { feeLimit: 200_000_000, callValue: 0 },
    parameter,
    owner,
  );
  const signed = await tronWeb.trx.sign(transaction);
  const res = await tronWeb.trx.sendRawTransaction(signed);
  if (!res?.result) throw new Error(res?.code || 'Tron broadcast failed');
  return res.txid || signed.txID;
}

/** Poll a Tron tx for confirmation count. */
export async function fetchTronConfirmations(txid: string): Promise<{ blockNumber: number | null; confirmed: boolean }> {
  if (!isTronLinkAvailable() || !txid) return { blockNumber: null, confirmed: false };
  try {
    const info = await window.tronWeb.trx.getTransactionInfo(txid);
    const blockNumber = info?.blockNumber ?? null;
    return { blockNumber, confirmed: !!blockNumber };
  } catch {
    return { blockNumber: null, confirmed: false };
  }
}
