/**
 * Gate 5A2 — strict parser for the browser -> server verification handoff.
 *
 * The browser may send ONLY signed attribution evidence. BigInt fields must be
 * decimal STRINGS: JSON numbers are rejected (precision is not negotiable).
 * activityId, log index, amounts, status, rewards, campaign/task/completion ids
 * and points are never accepted from the client.
 */
import type { ActivityIntent, Hex } from './activityIntent';
import type { ActivityIntentHandoff } from './activityVerifier';

export class ActivityVerifyRequestError extends Error {}

const fail = (msg: string): never => {
  throw new ActivityVerifyRequestError(msg);
};

const hex = (v: unknown, bytes: number, field: string): Hex => {
  if (typeof v !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(v)) {
    fail(`${field} must be a 0x-prefixed ${bytes}-byte hex string`);
  }
  return (v as string) as Hex;
};

const decimalBigInt = (v: unknown, field: string): bigint => {
  if (typeof v === 'number' || typeof v === 'bigint') {
    fail(`${field} must be a decimal string, not a JSON number`);
  }
  if (typeof v !== 'string' || !/^\d+$/.test(v.trim())) {
    fail(`${field} must be a decimal string`);
  }
  return BigInt((v as string).trim());
};

const signature = (v: unknown): Hex => {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(v)) {
    fail('signature must be a 65-byte hex string');
  }
  return (v as string) as Hex;
};

export function parseActivityVerifyRequest(body: unknown): ActivityIntentHandoff {
  if (!body || typeof body !== 'object') fail('request body must be a JSON object');
  const b = body as Record<string, unknown>;

  const allowed = new Set(['intent', 'signature', 'intentHash', 'sourceTxHash']);
  for (const k of Object.keys(b)) {
    if (!allowed.has(k)) fail(`unexpected field: ${k}`);
  }

  if (!b['intent'] || typeof b['intent'] !== 'object') fail('intent is required');
  const i = b['intent'] as Record<string, unknown>;

  const intentAllowed = new Set([
    'intentId',
    'user',
    'actionType',
    'sourceChainId',
    'destinationChainId',
    'token',
    'amount',
    'recipient',
    'campaignId',
    'nonce',
    'deadline',
  ]);
  for (const k of Object.keys(i)) {
    if (!intentAllowed.has(k)) fail(`unexpected intent field: ${k}`);
  }

  const intent: ActivityIntent = {
    intentId: hex(i['intentId'], 32, 'intent.intentId'),
    user: hex(i['user'], 20, 'intent.user'),
    actionType: hex(i['actionType'], 32, 'intent.actionType'),
    sourceChainId: decimalBigInt(i['sourceChainId'], 'intent.sourceChainId'),
    destinationChainId: decimalBigInt(i['destinationChainId'], 'intent.destinationChainId'),
    token: hex(i['token'], 20, 'intent.token'),
    amount: decimalBigInt(i['amount'], 'intent.amount'),
    recipient: hex(i['recipient'], 20, 'intent.recipient'),
    campaignId: hex(i['campaignId'], 32, 'intent.campaignId'),
    nonce: decimalBigInt(i['nonce'], 'intent.nonce'),
    deadline: decimalBigInt(i['deadline'], 'intent.deadline'),
  };

  return {
    intent,
    signature: signature(b['signature']),
    intentHash: hex(b['intentHash'], 32, 'intentHash'),
    sourceTxHash: hex(b['sourceTxHash'], 32, 'sourceTxHash'),
  };
}
