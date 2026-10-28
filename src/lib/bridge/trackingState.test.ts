import { describe, expect, it, vi } from 'vitest';
import { trackingState, shouldDismissBridgeReceipt, isCurrentTrackingResult, saveBridgeTracking, loadBridgeTracking } from './trackingState';
const origin = { txHash: '0xorigin', source: 'success' as const, sourceConfirmedAt: 1000, providerRequired: true };
describe('evidence-only bridge presentation', () => {
  it('restores submitted identity without treating browser storage as receipt proof', () => {
    const storage = new Map<string,string>();
    vi.stubGlobal('window', { localStorage: {setItem:(k:string,v:string)=>storage.set(k,v), getItem:(k:string)=>storage.get(k) ?? null} });
    try {
      const c = {txHash:'0x'+'a'.repeat(64),direction:'BOT_TO_BNB',isMainnet:true,amount:'10.039',recipient:'0x'+'b'.repeat(40),fromChain:'BOT Chain',toChain:'BNB Chain',explorerPrefix:'https://scan.botchain.ai/tx/'};
      expect(saveBridgeTracking(c)).toBe(true); expect(loadBridgeTracking()).toEqual(c);
      expect(trackingState({txHash:loadBridgeTracking()?.txHash},99999999).phase).toBe('origin_pending');
      saveBridgeTracking({...c,explorerPrefix:'javascript:alert(1)'}); expect(loadBridgeTracking()).toBeNull();
    } finally {vi.unstubAllGlobals();}
  });
  it('failed persistence cannot authorize receipt dismissal', () => {
    vi.stubGlobal('window', {localStorage:{setItem:()=>{throw new Error('storage blocked')}}});
    try {expect(saveBridgeTracking({txHash:'a',direction:'BOT_TO_BNB',isMainnet:true,amount:'10',recipient:'b',fromChain:'BOT',toChain:'BNB',explorerPrefix:'https://scan.botchain.ai/tx/'})).toBe(false);} finally {vi.unstubAllGlobals();}
  });
  it('has no relay timer before explicit submission', () => { const s = trackingState({}, 900000); expect(s.phase).toBe('awaiting'); expect(s.relayElapsedSeconds).toBeNull(); });
  it('rejection is canceled, never relaying', () => { const s = trackingState({ walletState: 'rejected' }, 900000); expect(s.phase).toBe('canceled'); expect(s.relayElapsedSeconds).toBeNull(); });
  it('unresolved wallet errors remain errors', () => expect(trackingState({walletState: 'error'}, 1000).phase).toBe('error'));
  it('pending origin has no relay countdown', () => { const s = trackingState({txHash:'0xorigin'}, 900000); expect(s.phase).toBe('origin_pending'); expect(s.relayElapsedSeconds).toBeNull(); });
  it('failed origin has no timer even with stale relay data', () => { const s = trackingState({...origin, source:'failed', providerAcceptedAt:2000}, 900000); expect(s.phase).toBe('failed'); expect(s.relayElapsedSeconds).toBeNull(); });
  it('source success waits for required provider acceptance', () => { const s = trackingState(origin, 900000); expect(s.phase).toBe('awaiting_relay'); expect(s.destinationDone).toBe(false); expect(s.relayElapsedSeconds).toBeNull(); });
  it('accepted relay uses authoritative timestamp, not page opening', () => { const s = trackingState({...origin, providerAcceptedAt:4000}, 14000); expect(s.phase).toBe('relaying'); expect(s.relayElapsedSeconds).toBe(10); });
  it('reload reconstructs elapsed time from the same timestamps', () => { const e = JSON.parse(JSON.stringify({...origin, providerAcceptedAt:4000})); expect(trackingState(e, 24000).relayElapsedSeconds).toBe(20); });
  it('destination submission is not destination confirmation', () => expect(trackingState({...origin, destinationSubmitted:true}, 9999999).destinationDone).toBe(false));
  it('receipt alone without verified token arrival is not received', () => expect(trackingState({...origin, destinationConfirmed:true}, 9999999).received).toBe(false));
  it('verified destination receipt and arrival are received', () => expect(trackingState({...origin, destinationConfirmed:true, destinationTokenArrival:true}, 10000).phase).toBe('received'));
  it('destination evidence cannot override failed origin', () => expect(trackingState({...origin, source:'failed', destinationConfirmed:true, destinationTokenArrival:true}, 10000).received).toBe(false));
  it('stale or canceled reads cannot commit', () => { expect(isCurrentTrackingResult('old','new',false)).toBe(false); expect(isCurrentTrackingResult('new','new',true)).toBe(false); expect(isCurrentTrackingResult('new','new',false)).toBe(true); });
  it('dismisses only the successful submitted receipt with durable matching tracking', () => {
    const e = {type:'bridge',status:'success',hash:'a',trackedHash:'a',persisted:true};
    expect(shouldDismissBridgeReceipt(e)).toBe(true);
    for (const patch of [{persisted:false},{trackedHash:'b'},{hash:undefined},{status:'failed'},{status:'pending'},{status:'rejected'},{type:'swap'}]) expect(shouldDismissBridgeReceipt({...e,...patch})).toBe(false);
  });
});
import { matchDestinationTransfer } from './trackingState';
describe('matchDestinationTransfer', () => {
  const base = { recipient: '0xAbC', sentUnits: 10_000_000n, sourceConfirmedAt: 1000 };
  it('matches a fee-reduced transfer to the recipient after the origin block', () => {
    expect(matchDestinationTransfer([{ to: '0xabc', from: '0xbridge', value: 9_500_000n, timestampMs: 2000, txHash: '0x1' }], base)?.txHash).toBe('0x1');
  });
  it('ignores transfers before origin, above the bridged amount, or to others', () => {
    expect(matchDestinationTransfer([
      { to: '0xabc', from: '0xb', value: 9n, timestampMs: 500, txHash: '0x1' },
      { to: '0xabc', from: '0xb', value: 20_000_000n, timestampMs: 2000, txHash: '0x2' },
      { to: '0xdef', from: '0xb', value: 9n, timestampMs: 2000, txHash: '0x3' },
    ], base)).toBeNull();
  });
});
