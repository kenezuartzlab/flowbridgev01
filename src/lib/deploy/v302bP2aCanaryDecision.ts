/**
 * FlowBridge V30.2B P2A — Genesis Core Swap Canary decision freeze (pure).
 *
 * Records the owner-approved, one-off 1 FLOW mainnet reward canary as a NEW
 * canonical decision version that AMENDS (never rewrites) the frozen V30.1D.4
 * manifest. Every historical decision object and its hash stay byte-identical;
 * the amendment only narrows the launch campaign budget for this single canary.
 *
 * This module signs nothing, writes no chain state, holds no key material and
 * never fabricates reward eligibility. Eligibility evaluation is fail-closed:
 * a candidate without complete canonical economic identity (chain + tx hash +
 * ACTUAL receipt log index mapped to a canonical verified activity record) can
 * never become a winner.
 */
import { digestOf } from './decisionDigest';

export const P2A_DECISION_VERSION = 'V30.2B.P2A' as const;
export const P2A_DECISION_ID = 'REWARDS_GENESIS_CORE_SWAP_CANARY' as const;
export const P2A_CAMPAIGN_ID = 'MAINNET_GENESIS_CORE_SWAP_CANARY_V1' as const;

export const BOT_MAINNET_CHAIN_ID = 677;
export const ONE_FLOW_WEI = 1_000_000_000_000_000_000n;
export const CANARY_BUDGET_FLOW = 1;
export const CANARY_MAX_RECIPIENTS = 1;
export const CANARY_PUBLISH_DELAY_SECONDS = 86_400;

/** Deterministic winner ordering, frozen by the owner brief. */
export const CANARY_WINNER_ORDERING = [
  'blockNumber ASC',
  'transactionIndex ASC',
  'logIndex ASC',
  'txHash ASC',
] as const;

export interface CanaryDecisionValue {
  campaignId: string;
  chainId: number;
  campaignBudgetFlow: number;
  rewardFlowPerRecipient: number;
  rewardWeiPerRecipient: string;
  maxRecipients: number;
  eligibilitySource: 'CORE_SWAP';
  winnerOrdering: readonly string[];
  eligibilityCutoffBlock: number;
  /** Explicitly NOT any kind of conversion or rate rule. */
  conversions: {
    flowPointsConversion: false;
    campaignPtsConversion: false;
    usdVolumeConversion: false;
    referralMultiplier: false;
    stakingMultiplier: false;
    aprOrRewardRateRule: false;
  };
  publishDelaySeconds: number;
  ownerApproval: 'APPROVED';
}

export interface CanaryDecisionRecord {
  id: typeof P2A_DECISION_ID;
  decisionVersion: typeof P2A_DECISION_VERSION;
  status: 'APPROVED';
  gating: 'FEATURE_ONLY';
  value: CanaryDecisionValue;
  approvedByEmail: string;
  approvedAt: string;
  decisionHash: string;
}

export function buildCanaryDecision(input: {
  eligibilityCutoffBlock: number;
  candidateDigest: string;
  approvedByEmail: string;
  approvedAt: string;
}): CanaryDecisionRecord {
  if (!Number.isInteger(input.eligibilityCutoffBlock) || input.eligibilityCutoffBlock <= 0) {
    throw new Error('eligibilityCutoffBlock must be a positive finalized block number');
  }
  const value: CanaryDecisionValue = {
    campaignId: P2A_CAMPAIGN_ID,
    chainId: BOT_MAINNET_CHAIN_ID,
    campaignBudgetFlow: CANARY_BUDGET_FLOW,
    rewardFlowPerRecipient: CANARY_BUDGET_FLOW,
    rewardWeiPerRecipient: ONE_FLOW_WEI.toString(),
    maxRecipients: CANARY_MAX_RECIPIENTS,
    eligibilitySource: 'CORE_SWAP',
    winnerOrdering: CANARY_WINNER_ORDERING,
    eligibilityCutoffBlock: input.eligibilityCutoffBlock,
    conversions: {
      flowPointsConversion: false,
      campaignPtsConversion: false,
      usdVolumeConversion: false,
      referralMultiplier: false,
      stakingMultiplier: false,
      aprOrRewardRateRule: false,
    },
    publishDelaySeconds: CANARY_PUBLISH_DELAY_SECONDS,
    ownerApproval: 'APPROVED',
  };
  return {
    id: P2A_DECISION_ID,
    decisionVersion: P2A_DECISION_VERSION,
    status: 'APPROVED',
    gating: 'FEATURE_ONLY',
    value,
    approvedByEmail: input.approvedByEmail,
    approvedAt: input.approvedAt,
    decisionHash: digestOf({
      id: P2A_DECISION_ID,
      version: P2A_DECISION_VERSION,
      candidateDigest: input.candidateDigest,
      value,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Manifest amendment                                                         */
/* -------------------------------------------------------------------------- */

export interface ManifestAmendment {
  amendmentVersion: typeof P2A_DECISION_VERSION;
  priorDecisionVersion: string;
  priorManifestHash: string;
  supersedes: {
    decisionId: 'REWARDS_LAUNCH_PLAN';
    field: 'launchCampaignBudgetFlow';
    previousValue: number;
    amendedValue: number;
    scope: string;
    scopeNote: string;
  };
  settlementEvidenceNote: string;
}

export interface AmendedManifest extends Record<string, unknown> {
  schema: string;
  decisionVersion: string;
  amendments: readonly ManifestAmendment[];
}

/**
 * Produces the new canonical manifest. The base manifest object is copied
 * verbatim: no historical decision, value or hash is modified or removed.
 */
export function amendManifestWithCanary(
  base: Record<string, unknown>,
  priorManifestHash: string,
  decision: CanaryDecisionRecord,
): { manifest: AmendedManifest; manifestHash: string } {
  const baseDecisions = Array.isArray(base['decisions']) ? (base['decisions'] as unknown[]) : [];
  if (baseDecisions.some((d) => (d as { id?: string }).id === P2A_DECISION_ID)) {
    throw new Error('the P2A canary decision is already present in this manifest');
  }
  const priorVersion = String(base['decisionVersion']);
  const amendment: ManifestAmendment = {
    amendmentVersion: P2A_DECISION_VERSION,
    priorDecisionVersion: priorVersion,
    priorManifestHash,
    supersedes: {
      decisionId: 'REWARDS_LAUNCH_PLAN',
      field: 'launchCampaignBudgetFlow',
      previousValue: 0,
      amendedValue: CANARY_BUDGET_FLOW,
      scope: P2A_CAMPAIGN_ID,
      scopeNote:
        'Superseded for this single canary only. The original REWARDS_LAUNCH_PLAN decision object and hash are preserved unchanged in audit history.',
    },
    settlementEvidenceNote:
      'The already-executed 1,000,000 FLOW Distributor funding is settlement evidence, not a retroactive owner decision.',
  };
  const manifest: AmendedManifest = {
    ...(base as AmendedManifest),
    decisionVersion: P2A_DECISION_VERSION,
    decisions: [...baseDecisions, decision],
    amendments: [
      ...((base['amendments'] as ManifestAmendment[] | undefined) ?? []),
      amendment,
    ],
  };
  return { manifest, manifestHash: digestOf(manifest) };
}

/** Fields that this amendment must never touch. */
export const P2A_IMMUTABLE_MANIFEST_KEYS = [
  'schema',
  'chainId',
  'candidateDigest',
  'contractCandidates',
  'safeAuthorities',
  'dependencySnapshot',
  'activationPlan',
  'publicWrites',
] as const;

export function validateCanaryAmendment(
  base: Record<string, unknown>,
  amended: Record<string, unknown>,
): { ok: boolean; findings: readonly string[] } {
  const findings: string[] = [];
  for (const key of P2A_IMMUTABLE_MANIFEST_KEYS) {
    if (digestOf(base[key]) !== digestOf(amended[key])) {
      findings.push(`immutable manifest field changed: ${key}`);
    }
  }
  const baseDecisions = (base['decisions'] as Record<string, unknown>[] | undefined) ?? [];
  const newDecisions = (amended['decisions'] as Record<string, unknown>[] | undefined) ?? [];
  if (newDecisions.length !== baseDecisions.length + 1) {
    findings.push('amended manifest must add exactly one decision record');
  }
  baseDecisions.forEach((d, i) => {
    if (digestOf(d) !== digestOf(newDecisions[i])) {
      findings.push(`historical decision ${String(d['id'])} was rewritten`);
    }
  });
  const added = newDecisions[newDecisions.length - 1];
  if (!added || added['id'] !== P2A_DECISION_ID) {
    findings.push('the appended decision is not the P2A canary record');
  } else {
    const v = added['value'] as CanaryDecisionValue | undefined;
    if (!v || v.chainId !== BOT_MAINNET_CHAIN_ID) findings.push('canary chain must be 677');
    if (v?.campaignBudgetFlow !== 1 || v?.rewardFlowPerRecipient !== 1) {
      findings.push('canary budget and reward must both be exactly 1 FLOW');
    }
    if (v?.maxRecipients !== 1) findings.push('canary maxRecipients must be 1');
    if (v?.publishDelaySeconds !== CANARY_PUBLISH_DELAY_SECONDS) {
      findings.push('canary must keep the 86,400-second publish delay');
    }
    if (v && Object.values(v.conversions).some(Boolean)) {
      findings.push('canary must not introduce any conversion or rate rule');
    }
    if (typeof added['decisionHash'] !== 'string' || !added['decisionHash']) {
      findings.push('canary decision hash missing');
    }
  }
  if (amended['decisionVersion'] !== P2A_DECISION_VERSION) {
    findings.push('amended manifest must carry the new decision version');
  }
  return { ok: findings.length === 0, findings };
}

/* -------------------------------------------------------------------------- */
/* Fail-closed eligibility                                                    */
/* -------------------------------------------------------------------------- */

export interface CanaryCandidate {
  /** Canonical ledger row id (audit reference only). */
  ledgerId: string;
  chainId: number | null;
  wallet: string | null;
  txHash: string | null;
  /** ACTUAL canonical receipt log index. null/undefined fails closed. */
  sourceLogIndex: number | null;
  /** Canonical verified-activity record id. Missing fails closed. */
  verifiedActivityId: string | null;
  activityKey: string | null;
  reason: string;
  verifiedUsd: number | null;
  /** On-chain ordering facts, resolved from the receipt. */
  blockNumber: number | null;
  transactionIndex: number | null;
}

export interface QualifiedCandidate {
  canonicalIdentity: string;
  wallet: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  transactionIndex: number;
  verifiedActivityId: string;
}

export interface CanaryEligibilityResult {
  status: 'PASS' | 'FAIL_CLOSED';
  cutoffBlock: number;
  considered: number;
  qualified: readonly QualifiedCandidate[];
  rejected: readonly { ledgerId: string; reason: string }[];
  winner: QualifiedCandidate | null;
  entitlementWei: string | null;
  blockers: readonly string[];
}

const isHash = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-f]{64}$/i.test(v);
const isAddr = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-f]{40}$/i.test(v);

export function evaluateCanaryEligibility(
  candidates: readonly CanaryCandidate[],
  cutoffBlock: number,
): CanaryEligibilityResult {
  const rejected: { ledgerId: string; reason: string }[] = [];
  const qualified: QualifiedCandidate[] = [];
  const seen = new Map<string, QualifiedCandidate>();

  for (const c of candidates) {
    const reject = (reason: string) => rejected.push({ ledgerId: c.ledgerId, reason });
    if (c.reason !== 'CORE_SWAP') {
      reject('not a CORE_SWAP activity');
      continue;
    }
    if (c.chainId !== BOT_MAINNET_CHAIN_ID) {
      reject(`chain ${String(c.chainId)} is not BOT Mainnet 677`);
      continue;
    }
    if (!isHash(c.txHash)) {
      reject('missing or malformed transaction hash');
      continue;
    }
    if (!isAddr(c.wallet)) {
      reject('missing or malformed recipient wallet');
      continue;
    }
    if (!Number.isInteger(c.sourceLogIndex) || (c.sourceLogIndex as number) < 0) {
      reject('missing actual receipt log index — canonical log identity unknown');
      continue;
    }
    if (!c.verifiedActivityId) {
      reject('not mapped to a canonical verified activity record');
      continue;
    }
    const logIndex = c.sourceLogIndex as number;
    const expectedKey = `${BOT_MAINNET_CHAIN_ID}:${c.txHash.toLowerCase()}:${logIndex}`;
    if ((c.activityKey ?? '').toLowerCase() !== expectedKey) {
      reject(`activity key does not match canonical identity ${expectedKey}`);
      continue;
    }
    if (!Number.isInteger(c.blockNumber) || (c.blockNumber as number) <= 0) {
      reject('unresolved on-chain block ordering');
      continue;
    }
    if ((c.blockNumber as number) > cutoffBlock) {
      reject('activity is after the frozen eligibility cutoff block');
      continue;
    }
    if (!Number.isInteger(c.transactionIndex) || (c.transactionIndex as number) < 0) {
      reject('unresolved on-chain transaction ordering');
      continue;
    }
    const entry: QualifiedCandidate = {
      canonicalIdentity: expectedKey,
      wallet: c.wallet.toLowerCase(),
      txHash: c.txHash.toLowerCase(),
      logIndex,
      blockNumber: c.blockNumber as number,
      transactionIndex: c.transactionIndex as number,
      verifiedActivityId: c.verifiedActivityId,
    };
    // Replayed representations of the same on-chain activity collapse.
    if (!seen.has(entry.canonicalIdentity)) {
      seen.set(entry.canonicalIdentity, entry);
      qualified.push(entry);
    }
  }

  const ordered = [...qualified].sort(
    (a, b) =>
      a.blockNumber - b.blockNumber ||
      a.transactionIndex - b.transactionIndex ||
      a.logIndex - b.logIndex ||
      (a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : 0),
  );

  // One wallet can win only once; the earliest activity of the earliest wallet wins.
  const winner = ordered[0] ?? null;
  const blockers: string[] = [];
  if (!winner) {
    blockers.push(
      'no qualifying canonical CORE_SWAP with complete economic identity exists at the frozen cutoff',
    );
  }
  return {
    status: winner ? 'PASS' : 'FAIL_CLOSED',
    cutoffBlock,
    considered: candidates.length,
    qualified: ordered,
    rejected,
    winner,
    entitlementWei: winner ? ONE_FLOW_WEI.toString() : null,
    blockers,
  };
}
