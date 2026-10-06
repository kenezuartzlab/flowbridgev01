/**
 * V32.2 — funded 10 FLOW Mainnet claim canary gate.
 *
 * Locks the three properties this release depends on:
 *  1. the prepared allocation root is reproducible from the local encoder and
 *     binds exactly one wallet for exactly 10 FLOW;
 *  2. an unpublished round can never produce a claim — the frozen manifest stays
 *     published-only, and the claim preparer refuses an epoch with no root;
 *  3. the budget-reservation authority is server-only and refuses double
 *     reservation, wrong budgets and over-commitment.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from './flowRewardsRegistry';
import { MAINNET_EPOCH_MANIFESTS, findMainnetEntitlement } from './mainnetEpochManifest';
import { MAINNET_EPOCH_DRAFTS, draftFlowLabel, findMainnetDraftEntitlement } from './mainnetEpochDraft';
import { merkleClaimLeafHash, prepareMerkleClaim } from './merkleClaim';

const REPO = new URL('../../../', import.meta.url);
const RESERVED_SQL_PATH = new URL(
  'contracts/production/v30-2b-rewards-canary/reserve_reward_budget.sql',
  REPO,
);

const CANARY_WALLET = '0x628e237b73C5a37EF3968527563FA1a26b32BB97';
const PREPARED_ROOT = '0x21c416d3a1dc9da9b7bab9d4d97668598713e5419b0d7fb3aa055705f090c860';
const TEN_FLOW = '10000000000000000000';

describe('V32.2 funded 10 FLOW canary allocation', () => {
  const draft = MAINNET_EPOCH_DRAFTS[0];

  it('is exactly one unpublished mainnet round for one wallet', () => {
    expect(MAINNET_EPOCH_DRAFTS).toHaveLength(1);
    expect(draft.chainId).toBe(BOT_MAINNET_CHAIN_ID);
    expect(draft.epochId).toBe(2);
    expect(draft.distributor).toBe('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922');
    expect(draft.programId).toBe('CORE_SWAP');
    expect(draft.publicationTxHash).toBe('0x98cd9d8689f0cf36476f1947a4468efb1a7bfececce4c9b745b98866f9d288fe');
    expect(draft.entitlements).toHaveLength(1);
    expect(draft.entitlements[0].account).toBe(CANARY_WALLET);
    expect(draft.allocationWei).toBe(TEN_FLOW);
    expect(draftFlowLabel(draft)).toBe('10');
  });

  it('reproduces the prepared root from the local encoder (single leaf => empty proof)', () => {
    const leaf = draft.entitlements[0];
    const root = merkleClaimLeafHash({
      chainId: BOT_MAINNET_CHAIN_ID,
      distributor: draft.distributor,
      leaf: { epochId: leaf.epochId, index: leaf.index, account: leaf.account, amount: leaf.amount },
    });
    expect(root).toBe(PREPARED_ROOT);
    expect(root).toBe(draft.root);
    expect(leaf.proof).toEqual([]);
  });

  it('schedules the claim window beyond the contract publish delay', () => {
    expect(draft.claimEnd).toBeGreaterThan(draft.claimStart);
    expect(draft.claimStart - draft.signBefore).toBe(86_400);
    expect(draft.claimStart - Math.floor(new Date(draft.preparedAt).getTime() / 1000)).toBeGreaterThan(86_400);
  });

  it('after publication the frozen manifest carries round #2 identical to the draft', () => {
    expect(MAINNET_EPOCH_MANIFESTS.map((m) => m.epochId)).toEqual([1, 2]);
    const m = findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, CANARY_WALLET.toLowerCase())!;
    expect(m.manifest.epochId).toBe(2);
    expect(m.manifest.root).toBe(draft.root);
    expect(m.manifest.allocationWei).toBe(draft.allocationWei);
    expect(m.manifest.claimStart).toBe(draft.claimStart);
    expect(m.manifest.claimEnd).toBe(draft.claimEnd);
    expect(m.manifest.publicationTxHash).toBe(draft.publicationTxHash);
    expect(m.manifest.entitlements).toHaveLength(1);
    expect(m.leaf.amount).toBe('10000000000000000000');
  });

  it('resolves the draft case-insensitively and only on mainnet', () => {
    expect(findMainnetDraftEntitlement(BOT_MAINNET_CHAIN_ID, CANARY_WALLET)).not.toBeNull();
    expect(findMainnetDraftEntitlement(BOT_MAINNET_CHAIN_ID, CANARY_WALLET.toLowerCase())).not.toBeNull();
    expect(findMainnetDraftEntitlement(BOT_TESTNET_CHAIN_ID, CANARY_WALLET)).toBeNull();
    expect(findMainnetDraftEntitlement(null, CANARY_WALLET)).toBeNull();
    expect(findMainnetDraftEntitlement(BOT_MAINNET_CHAIN_ID, null)).toBeNull();
    expect(
      findMainnetDraftEntitlement(BOT_MAINNET_CHAIN_ID, '0x0000000000000000000000000000000000000001'),
    ).toBeNull();
  });

  it('cannot prepare a claim while the round has no on-chain root', () => {
    const match = findMainnetDraftEntitlement(BOT_MAINNET_CHAIN_ID, CANARY_WALLET)!;
    const prep = prepareMerkleClaim({
      chainId: BOT_MAINNET_CHAIN_ID,
      distributor: draft.distributor,
      epoch: null,
      leaf: match.leaf,
      proof: match.proof,
      alreadyClaimed: false,
      nowSeconds: draft.claimStart + 60,
    });
    expect(prep).toMatchObject({ claimable: false, reason: 'noPublishedEpoch' });
    expect(prep.claimable).toBe(false);
  });
});

describe('V32.2 reward budget reservation authority', () => {
  const sql = readFileSync(RESERVED_SQL_PATH, 'utf8');

  it('is security-definer with a pinned search path', () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });

  it('is executable by the server only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reserve_reward_budget[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_reward_budget[\s\S]*TO service_role/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_reward_budget[\s\S]*TO authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_reward_budget[\s\S]*TO anon/);
  });

  it('refuses double reservation and wrong-budget funding', () => {
    expect(sql).toMatch(/funding_state <> 'UNFUNDED'/);
    expect(sql).toMatch(/reservation_id IS NOT NULL/);
    expect(sql).toMatch(/v_program <> v_budget\.program_id/);
    expect(sql).toMatch(/v_ledger\.points <> v_points/);
  });

  it('cannot commit more than the budget holds', () => {
    expect(sql).toMatch(/v_budget\.total_points - v_budget\.reserved_points < v_total/);
    expect(sql).toMatch(/status <> 'ACTIVE'/);
  });

  it('flips the ledger row and the budget counter in the same call', () => {
    expect(sql).toMatch(/SET funding_state = 'FUNDED', program_id = v_budget\.program_id, reservation_id = v_ledger\.id/);
    expect(sql).toMatch(/reserved_points = reserved_points \+ v_total/);
  });
});
