import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { isTrustedTronMessage } from './providerMessage';
import { subscribeTronLink } from '../tronBridge';
import { detectLinkedWallet } from '../walletLink';

vi.mock('@/lib/siwe', () => ({ signInWithEthereum: vi.fn() }));
const listeners = new Map<string, (event: MessageEvent) => void>();
let host: Window;
beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  host = { location: { origin: 'https://flowbridge.space' }, tronLink: { request: vi.fn() }, tronWeb: { ready: true, defaultAddress: { base58: 'Ttest' }, fullNode: { host: 'node' } }, addEventListener: vi.fn((name, cb) => listeners.set(name, cb)), removeEventListener: vi.fn((name) => listeners.delete(name)) } as unknown as Window;
  vi.stubGlobal('window', host);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const event = (extra: Partial<MessageEvent> = {}) => ({ origin: host.location.origin, source: host, data: { message: { action: 'accountsChanged' } }, ...extra } as MessageEvent);
describe('wallet provider message security', () => {
  it('accepts only same-origin same-window provider hints with an allowed action', () => {
    expect(isTrustedTronMessage(event(), host)).toBe(true);
    expect(isTrustedTronMessage(event({ origin: 'https://attacker.invalid' }), host)).toBe(false);
    expect(isTrustedTronMessage(event({ source: {} as Window }), host)).toBe(false);
  });
  it('rejects malformed payloads and unverified provider presence', () => {
    for (const data of [null, 'connect', [], { message: [] }, { message: { action: 'sign' } }, { message: { action: 1 } }]) expect(isTrustedTronMessage(event({ data }), host)).toBe(false);
    host.tronLink = undefined;
    expect(isTrustedTronMessage(event(), host)).toBe(false);
  });
  it('ignores repeated hints with unchanged provider truth and coalesces real changes', () => {
    const cb = vi.fn(); const stop = subscribeTronLink(cb);
    listeners.get('message')?.(event()); vi.advanceTimersByTime(500); expect(cb).not.toHaveBeenCalled();
    host.tronWeb.defaultAddress.base58 = 'Tchanged';
    for (let i = 0; i < 100; i++) listeners.get('message')?.(event());
    vi.advanceTimersByTime(500); expect(cb).toHaveBeenCalledTimes(1);
    listeners.get('message')?.(event()); vi.advanceTimersByTime(500); expect(cb).toHaveBeenCalledTimes(1);
    host.tronWeb.ready = false; listeners.get('message')?.(event()); stop(); vi.advanceTimersByTime(500); expect(cb).toHaveBeenCalledTimes(1);
  });
  it('cross-origin and frame messages cannot initiate refresh work', () => {
    const cb = vi.fn(); const stop = subscribeTronLink(cb);
    host.tronWeb.ready = false;
    listeners.get('message')?.(event({ origin: 'https://attacker.invalid' }));
    listeners.get('message')?.(event({ source: {} as Window }));
    vi.advanceTimersByTime(1000); expect(cb).not.toHaveBeenCalled(); stop();
  });
});
describe('injected-wallet privacy', () => {
  it('detects a connected wallet without requests or ownership prompts', async () => {
    const request = vi.fn().mockResolvedValue(['0x' + '1'.repeat(40)]); const fetch = vi.fn();
    vi.stubGlobal('ethereum', { request }); vi.stubGlobal('fetch', fetch);
    expect(await detectLinkedWallet()).toEqual({ address: '0x' + '1'.repeat(40) });
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: 'eth_accounts' }); expect(fetch).not.toHaveBeenCalled();
  });
});