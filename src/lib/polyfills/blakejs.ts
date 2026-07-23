import { blake2b as nobleBlake2b } from '@noble/hashes/blake2b';
import { blake2s as nobleBlake2s } from '@noble/hashes/blake2s';
import { bytesToHex } from '@noble/hashes/utils';

type BlakeInput = string | Uint8Array | ArrayBuffer | number[];

const textEncoder = new TextEncoder();

function normalizeInput(input: BlakeInput): Uint8Array {
  if (typeof input === 'string') return textEncoder.encode(input);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input);
}

export function blake2b(input: BlakeInput, key?: Uint8Array, outlen = 64) {
  return nobleBlake2b(normalizeInput(input), { key, dkLen: outlen });
}

export function blake2bHex(input: BlakeInput, key?: Uint8Array, outlen = 64) {
  return bytesToHex(blake2b(input, key, outlen));
}

export function blake2s(input: BlakeInput, key?: Uint8Array, outlen = 32) {
  return nobleBlake2s(normalizeInput(input), { key, dkLen: outlen });
}

export function blake2sHex(input: BlakeInput, key?: Uint8Array, outlen = 32) {
  return bytesToHex(blake2s(input, key, outlen));
}

const unsupportedStreaming = () => {
  throw new Error('Streaming BLAKE2 is not supported in this browser compatibility wrapper.');
};

export const blake2bInit = unsupportedStreaming;
export const blake2bUpdate = unsupportedStreaming;
export const blake2bFinal = unsupportedStreaming;
export const blake2sInit = unsupportedStreaming;
export const blake2sUpdate = unsupportedStreaming;
export const blake2sFinal = unsupportedStreaming;

export default {
  blake2b,
  blake2bHex,
  blake2bInit,
  blake2bUpdate,
  blake2bFinal,
  blake2s,
  blake2sHex,
  blake2sInit,
  blake2sUpdate,
  blake2sFinal,
};