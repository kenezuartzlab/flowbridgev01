/**
 * Verified delivery correlation for the official BOT Bridge (pure, no I/O).
 *
 * Every official gateway (BOT 677/968, BNB 56/97, ETH 1) runs the same verified
 * BotBridge implementation (identical runtime bytecode). A source deposit emits
 * DepositEvent(depositNonce, destinationChainId); the destination gateway's
 * execute() emits ExecuteEvent(originDepositNonce, originChainId) after validator
 * quorum and transfers USDT to the recipient. (originChainId, depositNonce) is
 * the replay-protected transfer identity. Completion requires that linked event
 * PLUS a USDT Transfer to the recipient in the same successful receipt.
 */
import { decodeEventLog, parseAbi } from 'viem';
import { MAINNET_CONTRACTS, TESTNET_CONTRACTS } from '@/lib/contracts';
import type { TrackingDirection } from './useBridgeTracking';

export const BRIDGE_EVENTS_ABI = parseAbi([
  'event DepositEvent(address indexed depositer, address indexed recipient, uint256 indexed amount, uint256 receiveAmount, address tokenAddress, uint256 depositNonce, uint256 destinationChainId)',
  'event ExecuteEvent(address indexed depositer, address indexed recipient, uint256 indexed receiveamount, address tokenAddress, uint256 originDepositNonce, uint256 originChainId, bytes32 dataHash, uint8 crossChainExtType, uint256 botAmount, uint256 botCostUsdt)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

type Hex = `0x${string}`;
export interface RawLog { address: string; topics: readonly Hex[] | Hex[]; data: Hex }
export interface BridgeLeg { chainId: number; gateway: string; usdt: string; decimals: number }
export interface BridgeRoute { source: BridgeLeg; destination: BridgeLeg }

const lc = (s: string) => s.toLowerCase();
const DECIMALS: Record<number, number> = { 677: 6, 968: 6, 56: 18, 97: 18, 1: 6 };

/** EVM routes with verified gateways. Tron and unpublished testnet peers return null. */
export function bridgeRoute(direction: TrackingDirection, isMainnet: boolean): BridgeRoute | null {
  const c = isMainnet ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;
  const bot: BridgeLeg = { chainId: isMainnet ? 677 : 968, gateway: c.botBridgeProxy, usdt: c.usdtBot, decimals: 6 };
  const bnb: BridgeLeg = { chainId: isMainnet ? 56 : 97, gateway: c.bnbBridgeProxy, usdt: c.usdtBnb, decimals: 18 };
  const eth: BridgeLeg | null = isMainnet ? { chainId: 1, gateway: c.ethBridgeProxy, usdt: c.usdtEth, decimals: 6 } : null;
  switch (direction) {
    case 'BOT_TO_BNB': return { source: bot, destination: bnb };
    case 'BNB_TO_BOT': return { source: bnb, destination: bot };
    case 'BOT_TO_ETH': return eth ? { source: bot, destination: eth } : null;
    case 'ETH_TO_BOT': return eth ? { source: eth, destination: bot } : null;
    default: return null; // Tron: no EVM log access in this tracker
  }
}

export const DEST_EXPLORER_TX: Record<number, string> = {
  677: 'https://scan.botchain.ai/tx/', 968: 'https://scan.bohr.life/tx/', 56: 'https://bscscan.com/tx/',
  97: 'https://testnet.bscscan.com/tx/', 1: 'https://etherscan.io/tx/',
};
export const DEST_EXPLORER_ADDRESS: Record<number, string> = {
  677: 'https://scan.botchain.ai/address/', 968: 'https://scan.bohr.life/address/', 56: 'https://bscscan.com/address/',
  97: 'https://testnet.bscscan.com/address/', 1: 'https://etherscan.io/address/',
};

export interface SourceDeposit { depositer: string; recipient: string; receiveAmount: bigint; nonce: bigint; destinationChainId: bigint; token: string }

/** Exactly one official DepositEvent from the configured source gateway, else null. */
export function decodeSourceDeposit(logs: readonly RawLog[], route: BridgeRoute): SourceDeposit | null {
  const found: SourceDeposit[] = [];
  for (const log of logs) {
    if (lc(log.address) !== lc(route.source.gateway)) continue;
    try {
      const d = decodeEventLog({ abi: BRIDGE_EVENTS_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (d.eventName !== 'DepositEvent') continue;
      const a = d.args;
      found.push({ depositer: a.depositer, recipient: a.recipient, receiveAmount: a.receiveAmount, nonce: a.depositNonce, destinationChainId: a.destinationChainId, token: a.tokenAddress });
    } catch { /* not this event */ }
  }
  if (found.length !== 1) return null;
  const dep = found[0];
  if (dep.destinationChainId !== BigInt(route.destination.chainId)) return null;
  return dep;
}

export function scaleAmount(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (fromDecimals === toDecimals) return amount;
  return fromDecimals > toDecimals ? amount / 10n ** BigInt(fromDecimals - toDecimals) : amount * 10n ** BigInt(toDecimals - fromDecimals);
}

export type DeliveryMatch = { ok: true; amount: bigint } | { ok: false; reason: string };

/**
 * Validates a destination receipt against the source deposit: official gateway,
 * ExecuteEvent with same origin chain + nonce + depositer + recipient + token,
 * amount, and a USDT Transfer to the recipient for exactly the released amount.
 */
export function matchDelivery(
  receipt: { status: 'success' | 'reverted'; logs: readonly RawLog[] },
  dep: SourceDeposit, route: BridgeRoute, expectedRecipient?: string,
): DeliveryMatch {
  if (receipt.status !== 'success') return { ok: false, reason: 'destination transaction failed' };
  if (expectedRecipient && /^0x[0-9a-fA-F]{40}$/.test(expectedRecipient) && lc(expectedRecipient) !== lc(dep.recipient)) return { ok: false, reason: 'recipient mismatch' };
  let exec: { amount: bigint; ext: number } | null = null;
  for (const log of receipt.logs) {
    if (lc(log.address) !== lc(route.destination.gateway)) continue;
    try {
      const d = decodeEventLog({ abi: BRIDGE_EVENTS_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (d.eventName !== 'ExecuteEvent') continue;
      const a = d.args;
      if (a.originDepositNonce !== dep.nonce || a.originChainId !== BigInt(route.source.chainId)) continue;
      if (lc(a.depositer) !== lc(dep.depositer) || lc(a.recipient) !== lc(dep.recipient)) return { ok: false, reason: 'depositor/recipient mismatch' };
      if (lc(a.tokenAddress) !== lc(route.destination.usdt)) return { ok: false, reason: 'token mismatch' };
      exec = { amount: a.receiveamount, ext: a.crossChainExtType };
    } catch { /* not this event */ }
  }
  if (!exec) return { ok: false, reason: 'no linked release event' };
  const expected = scaleAmount(dep.receiveAmount, route.source.decimals, route.destination.decimals);
  // ext 0: exact amount; ext 1 (BOT gas): USDT net of the on-chain gas cost, never more.
  if (exec.ext === 0 ? exec.amount !== expected : exec.amount > expected) return { ok: false, reason: 'amount mismatch' };
  const transferred = receipt.logs.some((log) => {
    if (lc(log.address) !== lc(route.destination.usdt)) return false;
    try {
      const d = decodeEventLog({ abi: BRIDGE_EVENTS_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      return d.eventName === 'Transfer' && lc(d.args.to) === lc(dep.recipient) && d.args.value === exec!.amount;
    } catch { return false; }
  });
  if (!transferred) return { ok: false, reason: 'no USDT transfer to recipient' };
  return { ok: true, amount: exec.amount };
}

export { DECIMALS as BRIDGE_USDT_DECIMALS };
