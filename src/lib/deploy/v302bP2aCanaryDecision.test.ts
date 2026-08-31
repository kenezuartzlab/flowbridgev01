import { describe, expect, it } from 'vitest';
import {
  amendManifestWithCanary,
  buildCanaryDecision,
  evaluateCanaryEligibility,
  validateCanaryAmendment,
  ONE_FLOW_WEI,
  P2A_DECISION_ID,
  P2A_DECISION_VERSION,
  type CanaryCandidate,
} from './v302bP2aCanaryDecision';

const base = {
  schema: 'flowbridge.mainnet-release-decisions',
  decisionVersion: 'V30.1D.4',
  chainId: 677,
  candidateDigest: 'fnv1a64:19671fd13a81be19',
  contractCandidates: [{ contractId: 'X', sourceSha256: 'a', runtimeSha256: 'b' }],
  decisions: [
    { id: 'REWARDS_LAUNCH_PLAN', status: 'APPROVED', value: { launchCampaignBudgetFlow: 0 }, decisionHash: 'fnv1a64:70884004bf65c60f' },
  ],
  safeAuthorities: [],
  dependencySnapshot: {},
  activationPlan: [],
  publicWrites: {},
};

const decision = () =>
  buildCanaryDecision({
    eligibilityCutoffBlock: 21_552_485,
    candidateDigest: base.candidateDigest,
    approvedByEmail: 'owner@flowbridge.space',
    approvedAt: '2026-08-31T03:00:00.000Z',
  });

const candidate = (over: Partial<CanaryCandidate> = {}): CanaryCandidate => ({
  ledgerId: 'row-1',
  chainId: 677,
  wallet: '0x3d8a7fa490f9db09dd8006b74688213ace9c0164',
  txHash: '0x' + 'a'.repeat(64),
  sourceLogIndex: 5,
  verifiedActivityId: '0x' + 'b'.repeat(64),
  activityKey: `677:0x${'a'.repeat(64)}:5`,
  reason: 'CORE_SWAP',
  verifiedUsd: 1.44,
  blockNumber: 20_400_804,
  transactionIndex: 0,
  ...over,
});

describe('V30.2B P2A canary decision freeze', () => {
  it('freezes exactly 1 FLOW to at most one recipient with no conversion rule', () => {
    const d = decision();
    expect(d.id).toBe(P2A_DECISION_ID);
    expect(d.decisionVersion).toBe(P2A_DECISION_VERSION);
    expect(d.value.campaignBudgetFlow).toBe(1);
    expect(d.value.rewardWeiPerRecipient).toBe(ONE_FLOW_WEI.toString());
    expect(d.value.maxRecipients).toBe(1);
    expect(d.value.publishDelaySeconds).toBe(86_400);
    expect(Object.values(d.value.conversions).some(Boolean)).toBe(false);
  });

  it('hashes deterministically and changes when the cutoff changes', () => {
    expect(decision().decisionHash).toBe(decision().decisionHash);
    const other = buildCanaryDecision({
      eligibilityCutoffBlock: 21_552_486,
      candidateDigest: base.candidateDigest,
      approvedByEmail: 'owner@flowbridge.space',
      approvedAt: '2026-08-31T03:00:00.000Z',
    });
    expect(other.decisionHash).not.toBe(decision().decisionHash);
  });

  it('rejects a non-positive cutoff block', () => {
    expect(() =>
      buildCanaryDecision({
        eligibilityCutoffBlock: 0,
        candidateDigest: 'x',
        approvedByEmail: 'o@x',
        approvedAt: 'n',
      }),
    ).toThrow();
  });

  it('amends without rewriting history and produces a new manifest hash', () => {
    const { manifest, manifestHash } = amendManifestWithCanary(base, 'fnv1a64:9972234982dbe76f', decision());
    expect(manifest.decisionVersion).toBe(P2A_DECISION_VERSION);
    expect((manifest['decisions'] as unknown[])[0]).toEqual(base.decisions[0]);
    expect(manifest.amendments[0]?.priorManifestHash).toBe('fnv1a64:9972234982dbe76f');
    expect(manifest.amendments[0]?.supersedes.previousValue).toBe(0);
    expect(manifestHash).not.toBe('fnv1a64:9972234982dbe76f');
    expect(validateCanaryAmendment(base, manifest)).toEqual({ ok: true, findings: [] });
  });

  it('refuses to amend the same manifest twice', () => {
    const { manifest } = amendManifestWithCanary(base, 'h', decision());
    expect(() => amendManifestWithCanary(manifest, 'h2', decision())).toThrow();
  });

  it('flags any tampering with immutable manifest fields', () => {
    const { manifest } = amendManifestWithCanary(base, 'h', decision());
    const tampered = { ...manifest, candidateDigest: 'fnv1a64:deadbeefdeadbeef' };
    const v = validateCanaryAmendment(base, tampered);
    expect(v.ok).toBe(false);
    expect(v.findings.join(' ')).toContain('candidateDigest');
  });
});

describe('V30.2B P2A eligibility (fail-closed)', () => {
  it('selects one winner by the frozen deterministic ordering', () => {
    const early = candidate({ ledgerId: 'a', blockNumber: 20_400_804, txHash: '0x' + 'a'.repeat(64), activityKey: `677:0x${'a'.repeat(64)}:5` });
    const late = candidate({ ledgerId: 'b', blockNumber: 20_419_230, txHash: '0x' + 'c'.repeat(64), activityKey: `677:0x${'c'.repeat(64)}:8`, sourceLogIndex: 8 });
    const r = evaluateCanaryEligibility([late, early], 21_552_485);
    expect(r.status).toBe('PASS');
    expect(r.winner?.ledgerId).toBeUndefined();
    expect(r.winner?.blockNumber).toBe(20_400_804);
    expect(r.entitlementWei).toBe(ONE_FLOW_WEI.toString());
  });

  it('collapses replayed representations of the same canonical identity', () => {
    const r = evaluateCanaryEligibility([candidate(), candidate({ ledgerId: 'dup' })], 21_552_485);
    expect(r.qualified).toHaveLength(1);
  });

  it('fails closed without an actual receipt log index', () => {
    const r = evaluateCanaryEligibility([candidate({ sourceLogIndex: null, activityKey: null })], 21_552_485);
    expect(r.status).toBe('FAIL_CLOSED');
    expect(r.winner).toBeNull();
    expect(r.entitlementWei).toBeNull();
    expect(r.rejected[0]?.reason).toContain('log index');
  });

  it('fails closed without a canonical verified activity record', () => {
    const r = evaluateCanaryEligibility([candidate({ verifiedActivityId: null })], 21_552_485);
    expect(r.status).toBe('FAIL_CLOSED');
    expect(r.rejected[0]?.reason).toContain('verified activity record');
  });

  it('fails closed when the stored activity key contradicts the actual log identity', () => {
    const r = evaluateCanaryEligibility([candidate({ activityKey: `677:0x${'a'.repeat(64)}:0` })], 21_552_485);
    expect(r.status).toBe('FAIL_CLOSED');
    expect(r.rejected[0]?.reason).toContain('activity key');
  });

  it('excludes testnet 968 / 1024 and non-CORE_SWAP data', () => {
    const r = evaluateCanaryEligibility(
      [candidate({ chainId: 968 }), candidate({ chainId: 1024, ledgerId: 'x' }), candidate({ reason: 'REFERRAL_MILESTONE_FIRST_SWAP', ledgerId: 'y' })],
      21_552_485,
    );
    expect(r.status).toBe('FAIL_CLOSED');
    expect(r.qualified).toHaveLength(0);
  });

  it('excludes activity after the frozen cutoff block', () => {
    const r = evaluateCanaryEligibility([candidate({ blockNumber: 21_600_000 })], 21_552_485);
    expect(r.status).toBe('FAIL_CLOSED');
    expect(r.rejected[0]?.reason).toContain('cutoff');
  });
});
