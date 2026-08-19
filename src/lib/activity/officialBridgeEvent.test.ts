/**
 * Regression fixture for the REAL official DepositEvent, modelled on live BNB
 * Testnet tx 0x611ad5347348e5bb0f3fab8664b2fb0f22d2deea9c10877528ba521627df9712
 * (logIndex 3, 97 -> 968).
 */
import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, keccak256, toHex } from 'viem';
import {
  decodeOfficialDepositLog,
  selectCanonicalDepositLog,
  type RawLog,
} from './officialBridgeEvent';
import { OFFICIAL_TESTNET_ROUTES } from '../bridge/officialBridgeConfig';
import type { Hex } from './activityIntent';

const BNB = OFFICIAL_TESTNET_ROUTES[0]!;
const WALLET = '0x628e237b73C5a37EF3968527563FA1a26b32BB97' as Hex;
const AMOUNT = 10110000000000000000n;

const TOPIC = keccak256(
  toHex('DepositEvent(address,address,uint256,uint256,address,uint256,uint256)'),
);

const liveLog: RawLog = {
  address: BNB.gateway,
  logIndex: 3,
  topics: [
    TOPIC,
    encodeAbiParameters([{ type: 'address' }], [WALLET]) as Hex,
    encodeAbiParameters([{ type: 'address' }], [WALLET]) as Hex,
    encodeAbiParameters([{ type: 'uint256' }], [AMOUNT]) as Hex,
  ],
  data: encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
    [AMOUNT - 10000000000000000n, BNB.sourceToken, 42n, 968n],
  ) as Hex,
};

describe('official DepositEvent decoder', () => {
  it('decodes the live BNB Testnet deposit log', () => {
    const decoded = decodeOfficialDepositLog(liveLog);
    expect(decoded).toEqual({
      logIndex: 3,
      emitter: BNB.gateway.toLowerCase(),
      depositor: WALLET.toLowerCase(),
      recipient: WALLET.toLowerCase(),
      destinationChainId: 968n,
      amount: AMOUNT,
      token: BNB.sourceToken.toLowerCase(),
    });
  });

  it('selects it as canonical against the matching expectation', () => {
    const decoded = decodeOfficialDepositLog(liveLog)!;
    const selection = selectCanonicalDepositLog([decoded], {
      gateway: BNB.gateway,
      depositor: WALLET,
      recipient: WALLET,
      destinationChainId: 968n,
      amount: AMOUNT,
      token: BNB.sourceToken,
    });
    expect(selection.ok).toBe(true);
  });

  it('ignores obsolete Deposit-shaped logs', () => {
    const obsolete: RawLog = {
      ...liveLog,
      topics: [keccak256(toHex('Deposit(uint256,bytes32,address,address,uint256,address)'))],
    };
    expect(decodeOfficialDepositLog(obsolete)).toBeNull();
  });
});
