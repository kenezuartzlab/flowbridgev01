import {describe,it,expect} from 'vitest';
import {isPublisherCancellation,retryablePublication} from './publisherRecovery';
describe('publisher recovery evidence',()=>{
 it('accepts EIP1193 4001 rejection and verified nested provider rejection',()=>{
  expect(isPublisherCancellation({code:4001})).toBe(true);
  expect(isPublisherCancellation({cause:{code:'ACTION_REJECTED'}})).toBe(true);
 });
 it('timeout, close, disconnect, text-only rejection and invalid results remain uncertain',()=>{
  for(const e of [{code:4900},{code:-32603},{message:'user rejected'},{message:'window closed'},null,'0x']) expect(isPublisherCancellation(e)).toBe(false);
 });
 it('pending, confirming and unknown operations cannot restart',()=>{
  for(const state of ['BROADCAST_PENDING','CONFIRMING','RECOVERY_REQUIRED','CONFIRMED']) expect(retryablePublication(state,true)).toBe(false);
 });
 it('only reconciled cancellation and exact revert permit retry',()=>{
  expect(retryablePublication('CANCELLED',true)).toBe(true);
  expect(retryablePublication('REVERTED',true)).toBe(true);
  expect(retryablePublication('REVERTED',false)).toBe(false);
 });
});