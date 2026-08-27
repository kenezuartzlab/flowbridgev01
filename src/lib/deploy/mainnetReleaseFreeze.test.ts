import { describe, expect, it } from 'vitest';
import {
  CURRENT_RELEASE_FREEZE_INPUT,
  RELEASE_DECISION_SHEET,
  contaminationFindings,
  currentCandidateDigest,
  decisionBlockers,
  decisionGating,
  digestOf,
  evaluateReleaseFreeze,
  stableStringify,
  type DecisionSubmission,
  type ReleaseDecisionId,
  APPROVED_SAFE_DECISION_VALUES,
} from './mainnetReleaseFreeze';
import { APPROVED_PRODUCTION_SAFES, RECORDED_SAFE_OBSERVATIONS, verifySafe } from './safeVerification';

const OWNERS_A = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
  '0x3333333333333333333333333333333333333333',
];
const OWNERS_B = [
  '0x4444444444444444444444444444444444444444',
  '0x5555555555555555555555555555555555555555',
  '0x6666666666666666666666666666666666666666',
];
const OWNERS_C = [
  '0x7777777777777777777777777777777777777777',
  '0x8888888888888888888888888888888888888888',
  '0x9999999999999999999999999999999999999999',
];

const digest = currentCandidateDigest();

function sub(
  decisionId: ReleaseDecisionId,
  value: Record<string, unknown> | null,
  action: DecisionSubmission['action'] = 'REPLACE',
  overrides: Partial<DecisionSubmission> = {},
): DecisionSubmission {
  return {
    decisionId,
    action,
    value,
    approvedByEmail: 'owner@flowbridge.space',
    approvedAt: '2026-08-27T00:00:00.000Z',
    candidateDigest: digest,
    ...overrides,
  };
}

/** A fully approved, internally consistent owner decision set. */
function approvedSubmissions(): DecisionSubmission[] {
  return [
    sub('FLOW_ECONOMICS', null, 'APPROVE'),
    sub('GOVERNANCE_SAFE_PLAN', {
      owners: OWNERS_A,
      threshold: 2,
      address: '0xaaaa111111111111111111111111111111111111',
    }),
    sub('TREASURY_SAFE_PLAN', {
      owners: OWNERS_B,
      threshold: 2,
      address: '0xbbbb222222222222222222222222222222222222',
    }),
    sub('OPERATIONS_SAFE_PLAN', {
      owners: OWNERS_C,
      threshold: 2,
      address: '0xcccc333333333333333333333333333333333333',
    }),
    sub('ROOT_PUBLISHER_ASSIGNMENT', { address: '0xdddd444444444444444444444444444444444444' }),
    sub('ACTIVITY_ATTESTER_ASSIGNMENT', { address: '0xeeee555555555555555555555555555555555555' }),
    sub('TIMELOCK_POLICY', null, 'APPROVE'),
    sub('REWARDS_LAUNCH_PLAN', {
      initialFundingFlow: 1_000_000,
      launchCampaignBudgetFlow: 500_000,
      rootPublishDelaySeconds: 86_400,
    }),
    sub('STAKING_LAUNCH_PLAN', {
      initialTreasuryFundingFlow: 10_000_000,
      maxWeeklyRewardBudgetFlow: 50_000,
      enabledProducts: ['flexible', 'lock30', 'lock90'],
      productSetApprovedByOwner: true,
      activateGenesisAndFloors: true,
    }),
    sub('LIQUIDITY_AND_ORACLE_PLAN', {
      maxFlowReleasedAtLaunch: 5_000_000,
      oracleThresholds: {
        observationWindowSeconds: 7 * 86_400,
        maxFreshnessSeconds: 1_800,
        minLiquidityUsd: 250_000,
        maxDeviationBps: 500,
      },
    }),
    sub('GAS_BUDGET_PLAN', null, 'APPROVE'),
    sub('DEPENDENCY_SNAPSHOT', null, 'APPROVE'),
    sub('LEGAL_SIGNOFF', { signedOff: true, reference: 'external-counsel-2026-08-27' }),
  ];
}

const evalWith = (submissions: DecisionSubmission[], oracleStatus: 'PENDING_POOL' | 'READY' = 'PENDING_POOL') =>
  evaluateReleaseFreeze({ submissions, candidateDigest: digest, oracleStatus });

describe('V30.1D.2 — baseline: no hidden defaults', () => {
  it('starts with every decision NEEDS_APPROVAL and a BLOCKED verdict', () => {
    const r = evaluateReleaseFreeze(CURRENT_RELEASE_FREEZE_INPUT);
    expect(r.verdict).toBe('BLOCKED');
    expect(r.decisions).toHaveLength(RELEASE_DECISION_SHEET.length);
    expect(r.decisions.every((d) => d.status === 'NEEDS_APPROVAL')).toBe(true);
    expect(r.decisions.every((d) => d.value === null && d.decisionHash === null)).toBe(true);
    expect(r.outstanding).toHaveLength(
      RELEASE_DECISION_SHEET.filter((d) => decisionGating(d.id) === 'DEPLOYMENT').length,
    );
  });

  it('pins the mainnet chain and reports zero public writes', () => {
    const r = evaluateReleaseFreeze(CURRENT_RELEASE_FREEZE_INPUT);
    expect(r.chainId).toBe(677);
    expect(Object.values(r.publicWrites).every((v) => v === 0)).toBe(true);
  });
});

describe('V30.1D.2 — approval transitions', () => {
  it('APPROVE freezes the canonical proposal and records identity + hash', () => {
    const r = evalWith([sub('FLOW_ECONOMICS', null, 'APPROVE')]);
    const flow = r.decisions.find((d) => d.id === 'FLOW_ECONOMICS')!;
    expect(flow.status).toBe('APPROVED');
    expect(flow.value?.['supplyFlow']).toBe(1_000_000_000);
    expect(flow.approvedByEmail).toBe('owner@flowbridge.space');
    expect(flow.decisionHash).toMatch(/^fnv1a64:/);
  });

  it('REPLACE records a new value and a REPLACED status', () => {
    const r = evalWith([
      sub('TIMELOCK_POLICY', { delaySeconds: 48 * 3600, rationale: 'wider observation window' }),
    ]);
    const t = r.decisions.find((d) => d.id === 'TIMELOCK_POLICY')!;
    expect(t.status).toBe('REPLACED');
    expect(t.value?.['delaySeconds']).toBe(172_800);
  });

  it('REJECT keeps the value unfrozen and the gate blocked', () => {
    const r = evalWith([sub('FLOW_ECONOMICS', null, 'REJECT')]);
    const flow = r.decisions.find((d) => d.id === 'FLOW_ECONOMICS')!;
    expect(flow.status).toBe('REJECTED');
    expect(flow.value).toBeNull();
    expect(r.verdict).toBe('BLOCKED');
  });

  it('rejects a replacement on a non-editable evidence decision', () => {
    const r = evalWith([sub('DEPENDENCY_SNAPSHOT', { chainId: 968 })]);
    expect(r.decisions.find((d) => d.id === 'DEPENDENCY_SNAPSHOT')!.status).toBe('BLOCKED');
  });

  it('invalidates an approval when candidate hashes change', () => {
    const r = evalWith([sub('FLOW_ECONOMICS', null, 'APPROVE', { candidateDigest: 'fnv1a64:deadbeefdeadbeef' })]);
    const flow = r.decisions.find((d) => d.id === 'FLOW_ECONOMICS')!;
    expect(flow.status).toBe('NEEDS_APPROVAL');
    expect(flow.blockers.join(' ')).toMatch(/candidate hashes changed/);
  });

  it('never infers an approval from a record without identity or timestamp', () => {
    const r = evalWith([sub('FLOW_ECONOMICS', null, 'APPROVE', { approvedByEmail: '', approvedAt: '' })]);
    expect(r.decisions.find((d) => d.id === 'FLOW_ECONOMICS')!.status).toBe('NEEDS_APPROVAL');
  });

  it('takes the latest record per decision', () => {
    const r = evalWith([
      sub('LEGAL_SIGNOFF', { signedOff: false, reference: null }, 'REPLACE'),
      sub('LEGAL_SIGNOFF', { signedOff: true, reference: 'ref-2' }, 'REPLACE', {
        approvedAt: '2026-08-27T05:00:00.000Z',
      }),
    ]);
    const l = r.decisions.find((d) => d.id === 'LEGAL_SIGNOFF')!;
    expect(l.status).toBe('REPLACED');
    expect(l.value?.['reference']).toBe('ref-2');
  });
});

describe('V30.1D.2 — fail-closed conditions', () => {
  it('PASSes only with a complete, consistent approved set', () => {
    const r = evalWith(approvedSubmissions());
    expect(r.failClosedFindings.filter((f) => !f.startsWith('FLAGGED'))).toEqual([]);
    expect(r.outstanding).toEqual([]);
    expect(r.verdict).toBe('PASS');
    expect(r.manifestHash).toMatch(/^fnv1a64:/);
  });

  it('blocks when supply and allocation do not reconcile', () => {
    const r = evalWith([
      ...approvedSubmissions().filter((s) => s.decisionId !== 'FLOW_ECONOMICS'),
      sub('FLOW_ECONOMICS', { supplyFlow: 900_000_000 }),
    ]);
    expect(r.verdict).toBe('BLOCKED');
    expect(r.decisions.find((d) => d.id === 'FLOW_ECONOMICS')!.blockers.join(' ')).toMatch(/reconcile/);
  });

  it('blocks a Safe plan below 3 distinct owners / 2 threshold', () => {
    expect(
      decisionBlockers('GOVERNANCE_SAFE_PLAN', {
        owners: [OWNERS_A[0], OWNERS_A[0]],
        threshold: 1,
        address: '0xaaaa111111111111111111111111111111111111',
      }).length,
    ).toBeGreaterThan(0);
  });

  it('blocks zero and malformed addresses', () => {
    expect(
      decisionBlockers('ROOT_PUBLISHER_ASSIGNMENT', {
        address: '0x0000000000000000000000000000000000000000',
      }),
    ).not.toEqual([]);
    expect(decisionBlockers('ACTIVITY_ATTESTER_ASSIGNMENT', { address: '0x1234' })).not.toEqual([]);
  });

  it('blocks a treasury that is not an approved multisig plan', () => {
    const r = evalWith(approvedSubmissions().filter((s) => s.decisionId !== 'TREASURY_SAFE_PLAN'));
    expect(r.failClosedFindings.join(' ')).toMatch(/genesis treasury recipient is not an approved multisig/);
    expect(r.verdict).toBe('BLOCKED');
  });

  it('blocks Root Publisher equal to Governance or Treasury', () => {
    const r = evalWith([
      ...approvedSubmissions().filter((s) => s.decisionId !== 'ROOT_PUBLISHER_ASSIGNMENT'),
      sub('ROOT_PUBLISHER_ASSIGNMENT', { address: '0xaaaa111111111111111111111111111111111111' }),
    ]);
    expect(r.failClosedFindings.join(' ')).toMatch(/Root Publisher equals/);
    expect(r.verdict).toBe('BLOCKED');
  });

  it('blocks Activity Attester equal to the registry admin authority', () => {
    const r = evalWith([
      ...approvedSubmissions().filter((s) => s.decisionId !== 'ACTIVITY_ATTESTER_ASSIGNMENT'),
      sub('ACTIVITY_ATTESTER_ASSIGNMENT', { address: '0xaaaa111111111111111111111111111111111111' }),
    ]);
    expect(r.failClosedFindings.join(' ')).toMatch(/Activity Attester equals/);
  });

  it('blocks identical Governance/Treasury membership unless concentration is approved', () => {
    const shared = approvedSubmissions().map((s) =>
      s.decisionId === 'TREASURY_SAFE_PLAN'
        ? sub('TREASURY_SAFE_PLAN', {
            owners: OWNERS_A,
            threshold: 2,
            address: '0xbbbb222222222222222222222222222222222222',
          })
        : s,
    );
    expect(evalWith(shared).verdict).toBe('BLOCKED');

    const approvedConcentration = shared.map((s) =>
      s.decisionId === 'TREASURY_SAFE_PLAN'
        ? sub('TREASURY_SAFE_PLAN', {
            owners: OWNERS_A,
            threshold: 2,
            address: '0xbbbb222222222222222222222222222222222222',
            concentrationApproved: true,
          })
        : s,
    );
    const r = evalWith(approvedConcentration);
    expect(r.verdict).toBe('PASS');
    expect(r.failClosedFindings.some((f) => f.startsWith('FLAGGED'))).toBe(true);
  });

  it('blocks a rewards budget above funded inventory', () => {
    const r = evalWith([
      ...approvedSubmissions().filter((s) => s.decisionId !== 'REWARDS_LAUNCH_PLAN'),
      sub('REWARDS_LAUNCH_PLAN', {
        initialFundingFlow: 100_000,
        launchCampaignBudgetFlow: 500_000,
        rootPublishDelaySeconds: 86_400,
      }),
    ]);
    expect(r.decisions.find((d) => d.id === 'REWARDS_LAUNCH_PLAN')!.blockers.join(' ')).toMatch(
      /exceeds the approved funded inventory/,
    );
  });

  it('blocks a root delay outside the contract-supported range', () => {
    expect(
      decisionBlockers('REWARDS_LAUNCH_PLAN', {
        initialFundingFlow: 0,
        launchCampaignBudgetFlow: 0,
        rootPublishDelaySeconds: 60,
      }).join(' '),
    ).toMatch(/publish delay is outside/);
  });

  it('accepts 10M reward-treasury inventory while capping the Year-1 release at 3M', () => {
    expect(
      decisionBlockers('STAKING_LAUNCH_PLAN', {
        initialTreasuryFundingFlow: 10_000_000,
        year1TotalReleaseCeilingFlow: 3_000_000,
        genesisYear1ReleaseCeilingFlow: 1_000_000,
        standardYear1ReleaseCeilingFlow: 2_000_000,
        maxWeeklyRewardBudgetFlow: 50_000,
        enabledProducts: [],
      }),
    ).toEqual([]);
    expect(
      decisionBlockers('STAKING_LAUNCH_PLAN', {
        initialTreasuryFundingFlow: 10_000_000,
        year1TotalReleaseCeilingFlow: 4_000_000,
        enabledProducts: [],
      }).join(' '),
    ).toMatch(/Year-1 maximum distribution exceeds/);
    expect(
      decisionBlockers('STAKING_LAUNCH_PLAN', {
        genesisYear1ReleaseCeilingFlow: 1_500_000,
        enabledProducts: [],
      }).join(' '),
    ).toMatch(/Genesis Year-1 release exceeds/);
    expect(
      decisionBlockers('STAKING_LAUNCH_PLAN', {
        standardYear1ReleaseCeilingFlow: 2_500_000,
        enabledProducts: [],
      }).join(' '),
    ).toMatch(/Standard Year-1 release exceeds/);
  });

  it('blocks a weekly reward budget above the approved bound or the annual cap', () => {
    expect(
      decisionBlockers('STAKING_LAUNCH_PLAN', {
        initialTreasuryFundingFlow: 10_000_000,
        maxWeeklyRewardBudgetFlow: 60_000,
        enabledProducts: [],
      }).join(' '),
    ).toMatch(/exceeds the approved 50,000 FLOW/);
    expect(
      decisionBlockers('STAKING_LAUNCH_PLAN', {
        initialTreasuryFundingFlow: 10_000_000,
        year1TotalReleaseCeilingFlow: 1_000_000,
        genesisYear1ReleaseCeilingFlow: 500_000,
        standardYear1ReleaseCeilingFlow: 500_000,
        maxWeeklyRewardBudgetFlow: 50_000,
        enabledProducts: [],
      }).join(' '),
    ).toMatch(/annualises above/);
  });

  it('never activates a staking product without explicit owner activation', () => {
    expect(
      decisionBlockers('STAKING_LAUNCH_PLAN', {
        initialTreasuryFundingFlow: 10_000_000,
        maxWeeklyRewardBudgetFlow: 50_000,
        enabledProducts: ['flexible'],
      }).join(' '),
    ).toMatch(/explicit owner activation approval/);
  });


  it('allows a deployment-only staking launch with zero funding and no products', () => {
    expect(
      decisionBlockers('STAKING_LAUNCH_PLAN', {
        initialTreasuryFundingFlow: 0,
        maxFlowPerEpoch: 0,
        enabledProducts: [],
      }),
    ).toEqual([]);
  });

  it('blocks dynamic staking while the TWAP source is PENDING_POOL', () => {
    const r = evalWith([
      ...approvedSubmissions().filter((s) => s.decisionId !== 'STAKING_LAUNCH_PLAN'),
      sub('STAKING_LAUNCH_PLAN', {
        initialTreasuryFundingFlow: 10_000_000,
        maxWeeklyRewardBudgetFlow: 20_000,
        enabledProducts: ['flexible'],
        productSetApprovedByOwner: true,
        activateDynamicBonus: true,
      }),
    ]);
    expect(r.failClosedFindings.join(' ')).toMatch(/dynamic staking requested while/);
    expect(r.verdict).toBe('BLOCKED');
  });

  it('blocks an unapproved oracle threshold set', () => {
    expect(
      decisionBlockers('LIQUIDITY_AND_ORACLE_PLAN', {
        venues: ['BDEX V3'],
        maxFlowReleasedAtLaunch: 1_000_000,
        liquidityReserveCeilingFlow: 100_000_000,
        oracleThresholds: { observationWindowSeconds: 0, maxFreshnessSeconds: 0, minLiquidityUsd: null, maxDeviationBps: 0 },
      }).length,
    ).toBe(4);
  });

  it('rejects a hardcoded BOT amount in the gas plan', () => {
    expect(
      decisionBlockers('GAS_BUDGET_PLAN', {
        estimatedGasUnits: 21_500_000,
        safetyBufferPercent: 30,
        hardcodedBotAmount: 12,
      }).join(' '),
    ).toMatch(/fixed BOT amount/);
  });

  it('detects testnet 968 and legacy 1024 contamination', () => {
    expect(contaminationFindings({ chainId: 968 }).join(' ')).toMatch(/not BOT Mainnet 677/);
    expect(contaminationFindings({ chainId: 1024 }).join(' ')).toMatch(/not BOT Mainnet 677/);
    expect(
      contaminationFindings({ token: '0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac' }).join(' '),
    ).toMatch(/BOT Testnet 968 address/);
    expect(contaminationFindings({ chainId: 677, address: OWNERS_A[0] })).toEqual([]);
  });

  it('blocks when production candidate hashes differ from the frozen set', () => {
    const r = evaluateReleaseFreeze({
      submissions: approvedSubmissions(),
      candidateDigest: 'fnv1a64:0000000000000000',
      oracleStatus: 'PENDING_POOL',
    });
    expect(r.failClosedFindings.join(' ')).toMatch(/differ from the frozen candidates/);
    expect(r.verdict).toBe('BLOCKED');
  });
});

describe('V30.1D.2 — manifest freeze', () => {
  it('is deterministic, public-only and carries zero writes', () => {
    const a = evalWith(approvedSubmissions());
    const b = evalWith(approvedSubmissions());
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.manifest.chainId).toBe(677);
    expect(a.manifest.decisionVersion).toBe('V30.1D.4');
    expect(a.manifest.contractCandidates.length).toBeGreaterThan(0);
    expect(Object.values(a.manifest.publicWrites).every((v) => v === 0)).toBe(true);
    expect(stableStringify(a.manifest)).not.toMatch(/privateKey|mnemonic|seed phrase|secret/i);
  });

  it('changes the manifest hash when an approved value changes', () => {
    const base = evalWith(approvedSubmissions()).manifestHash;
    const changed = evalWith([
      ...approvedSubmissions().filter((s) => s.decisionId !== 'GAS_BUDGET_PLAN'),
      sub('GAS_BUDGET_PLAN', { estimatedGasUnits: 21_500_000, safetyBufferPercent: 50 }),
    ]).manifestHash;
    expect(changed).not.toBe(base);
  });

  it('hashes stably regardless of key order', () => {
    expect(digestOf({ a: 1, b: 2 })).toBe(digestOf({ b: 2, a: 1 }));
  });
});

describe('V30.1D.4 — staged gating, Safes and staking semantics', () => {
  it('classifies liquidity/oracle as feature-only and legal as non-technical', () => {
    expect(decisionGating('LIQUIDITY_AND_ORACLE_PLAN')).toBe('FEATURE_ONLY');
    expect(decisionGating('LEGAL_SIGNOFF')).toBe('NON_TECHNICAL');
    expect(decisionGating('TREASURY_SAFE_PLAN')).toBe('DEPLOYMENT');
  });

  it('never blocks deployment readiness on liquidity/oracle or legal sign-off', () => {
    const r = evalWith(
      approvedSubmissions().filter(
        (s) => s.decisionId !== 'LIQUIDITY_AND_ORACLE_PLAN' && s.decisionId !== 'LEGAL_SIGNOFF',
      ),
    );
    expect(r.outstanding).toEqual([]);
    expect(r.verdict).toBe('PASS');
    expect(r.featureOutstanding.join(' ')).toMatch(/LIQUIDITY_AND_ORACLE_PLAN/);
    expect(r.deferredNonTechnical.join(' ')).toMatch(/LEGAL_SIGNOFF/);
  });

  it('verifies a Safe only against read-only chain evidence', () => {
    const ok = verifySafe(APPROVED_PRODUCTION_SAFES[0]!, {
      authority: APPROVED_PRODUCTION_SAFES[0]!.authority,
      address: APPROVED_PRODUCTION_SAFES[0]!.address,
      chainId: 677,
      hasCode: true,
      codeSizeBytes: 171,
      codeHash: '0xabc',
      liveOwners: APPROVED_PRODUCTION_SAFES[0]!.owners,
      liveThreshold: 2,
      readMethods: ['getOwners()', 'getThreshold()'],
      observedAt: '2026-08-27T00:00:00.000Z',
    });
    expect(ok.state).toBe('VERIFIED');
    expect(verifySafe(APPROVED_PRODUCTION_SAFES[0]!, undefined).state).toBe('BLOCKED');
  });

  it('blocks only the mismatched authority and reports live evidence in the manifest', () => {
    const r = evaluateReleaseFreeze({
      submissions: approvedSubmissions().filter(
        (s) =>
          s.decisionId !== 'GOVERNANCE_SAFE_PLAN' &&
          s.decisionId !== 'TREASURY_SAFE_PLAN' &&
          s.decisionId !== 'OPERATIONS_SAFE_PLAN',
      ),
      candidateDigest: digest,
      oracleStatus: 'PENDING_POOL',
      safeObservations: RECORDED_SAFE_OBSERVATIONS,
    });
    expect(r.safeVerification).toHaveLength(3);
    expect(r.safeVerification.filter((s) => s.state === 'VERIFIED').length).toBeGreaterThanOrEqual(2);
    expect(r.manifest.safeAuthorities.every((s) => typeof s.address === 'string')).toBe(true);
    expect(stableStringify(r.manifest)).not.toMatch(/privateKey|mnemonic|secret/i);
    expect(Object.values(r.publicWrites).every((v) => v === 0)).toBe(true);
  });

  it('exposes the frozen Safe values in decision-record shape', () => {
    for (const value of Object.values(APPROVED_SAFE_DECISION_VALUES)) {
      expect((value['owners'] as string[]).length).toBe(3);
      expect(value['threshold']).toBe(2);
    }
  });
});
