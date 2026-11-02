import type { Address, Hex } from 'viem';

export type Step = 'claim' | 'approve' | 'stake';
export type FlexibleQuote = {
  token: Address; stakingVault: Address; controller: Address; treasury: Address;
  principal: bigint; minimum: bigint; active: boolean; paused: boolean; emergency: boolean;
  lockSeconds: number; positions: bigint; positionLimit: bigint; allowance: bigint; balance: bigint;
  genesisRate: number; genesisSeconds: number; genesisObligation: bigint; floorRate: number;
  floorObligation: bigint; genesisAvailable: boolean; variableRate: bigint;
};
export function flexibleGate(q: FlexibleQuote, rewardToken: string, available: bigint) {
  if (q.token.toLowerCase() !== rewardToken.toLowerCase()) throw new Error('FLOW token mismatch.');
  if (!q.active || q.paused || q.emergency || q.lockSeconds !== 0) throw new Error('Flexible staking is currently unavailable.');
  if (q.principal <= 0n || q.principal < q.minimum) throw new Error(`MINIMUM:${q.minimum}`);
  if (q.principal > available) throw new Error('Stake amount exceeds newly claimed FLOW.');
  if (q.positions >= q.positionLimit) throw new Error('Staking position limit reached.');
  // Flexible supports standard positions even with no Genesis quota/backing.
  if (q.floorObligation !== 0n || q.genesisSeconds < 0 || q.genesisSeconds > 7_776_000 || q.genesisRate < 0) throw new Error('Invalid live Flexible quote.');
}
export function quoteFingerprint(q: FlexibleQuote) {
  return [q.token.toLowerCase(),q.stakingVault.toLowerCase(),q.controller.toLowerCase(),q.treasury.toLowerCase(),q.principal,q.minimum,q.active,q.paused,q.emergency,q.lockSeconds,q.genesisRate,q.genesisSeconds,q.genesisObligation,q.floorRate,q.floorObligation,q.genesisAvailable,q.variableRate].join(':');
}
export type Intent = { step: Step; nonce: number; startBlock: string; hash: Hex | null };
export type ClaimStakeOperation = {
  version: 1; wallet: Address; rewardVault: Address; token: Address; stakingVault: Address;
  mode: 'claim' | 'stake'; claimAmount: string; principal: string; terms: string;
  transactions: Partial<Record<Step, Intent>>; complete: boolean;
};
export type ClaimStakePort = {
  identity(): Promise<void>;
  claimable(): Promise<bigint>;
  quote(principal: bigint): Promise<FlexibleQuote>;
  prepare(step: Step, op: ClaimStakeOperation): Promise<Intent>;
  send(intent: Intent, op: ClaimStakeOperation): Promise<Hex>;
  verify(intent: Intent, op: ClaimStakeOperation): Promise<'success' | 'reverted'>;
  save(op: ClaimStakeOperation): void;
  status(message: string): void;
};
export async function runClaimStake(op: ClaimStakeOperation, port: ClaimStakePort) {
  // Recovered storage is only a locator, never evidence of financial success.
  await port.identity();
  const execute = async (step: Step) => {
    let intent = op.transactions[step];
    if (!intent) {
      await port.identity();
      intent = await port.prepare(step, op);
      op.transactions[step] = intent;
      port.save(op); // persist nonce BEFORE the wallet prompt; unknown sends are never repeated
      try {
        const hash = await port.send(intent, op);
        intent.hash = hash;
        port.save(op);
      } catch (error) {
        if ((error as { code?: number })?.code === 4001) {
          delete op.transactions[step];
          port.save(op);
        }
        throw error;
      }
    }
    port.status(`${step === 'claim' ? 'Claim' : step === 'approve' ? 'Approval' : 'Stake'} submitted — verifying receipt…`);
    const outcome = await port.verify(intent, op);
    if (outcome === 'reverted') {
      delete op.transactions[step];
      port.save(op);
      throw new Error(`${step} reverted. ${step === 'claim' ? 'Credits remain in the rewards vault.' : 'FLOW claimed to your wallet; staking not completed.'}`);
    }
    await port.identity();
  };
  if (!op.transactions.claim) {
    if (await port.claimable() !== BigInt(op.claimAmount)) throw new Error('Claimable balance changed. Review again before claiming.');
    if (op.mode === 'stake') {
      const q = await port.quote(BigInt(op.principal));
      flexibleGate(q, op.token, BigInt(op.claimAmount));
      if (quoteFingerprint(q) !== op.terms) throw new Error('Staking terms changed. Review again before claiming.');
    }
  }
  await execute('claim');
  if (op.mode === 'claim') {
    op.complete = true; port.save(op); port.status('FLOW claimed to your wallet — verified.'); return;
  }
  port.status('FLOW claimed to your wallet. Checking Flexible staking…');
  // An existing stake intent must be verified before any new approval or quote.
  if (op.transactions.stake) {
    await execute('stake');
  } else {
    const checkQuote = async () => {
      await port.identity();
      const q = await port.quote(BigInt(op.principal));
      flexibleGate(q, op.token, BigInt(op.claimAmount));
      if (q.balance < BigInt(op.principal)) throw new Error('FLOW claimed to your wallet; insufficient wallet FLOW to resume staking.');
      if (quoteFingerprint(q) !== op.terms) throw new Error('FLOW claimed to your wallet; staking terms changed. Review before resuming.');
      return q;
    };
    let q = await checkQuote();
    if (op.transactions.approve) await execute('approve');
    else if (q.allowance < BigInt(op.principal)) await execute('approve');
    q = await checkQuote();
    if (q.allowance < BigInt(op.principal)) throw new Error('FLOW claimed to your wallet; exact approval not verified.');
    await execute('stake');
  }
  op.complete = true; port.save(op); port.status('FLOW claimed and Staked in your Flexible position — verified.');
}