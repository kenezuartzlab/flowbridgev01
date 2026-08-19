/**
 * B1 Gate 2 — campaign rule parsing + fail-closed evaluation.
 *
 * Parsing is strict: unknown rule types and malformed payloads are rejected,
 * never silently ignored (an ignored rule would over-award PTS).
 */
import type { Hex } from '../activity/activityIntent';
import type { CampaignRule, VerifiedActivityFacts } from './campaignTypes';

export class CampaignRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignRuleError';
  }
}

const isHex32 = (v: unknown): v is Hex => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
const isChainId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

export function parseCampaignRule(raw: unknown): CampaignRule {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CampaignRuleError('rule must be an object');
  }
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'ACTIVITY_KIND':
      if (
        r.kind !== 'BRIDGE_SUBMITTED' &&
        r.kind !== 'BRIDGE_COMPLETED' &&
        r.kind !== 'SWAP_EXECUTED'
      ) {
        throw new CampaignRuleError('ACTIVITY_KIND.kind is invalid');
      }
      return { type: 'ACTIVITY_KIND', kind: r.kind };
    case 'SOURCE_CHAIN':
      if (!isChainId(r.chainId)) throw new CampaignRuleError('SOURCE_CHAIN.chainId is invalid');
      return { type: 'SOURCE_CHAIN', chainId: r.chainId };
    case 'DESTINATION_CHAIN':
      if (!isChainId(r.chainId)) {
        throw new CampaignRuleError('DESTINATION_CHAIN.chainId is invalid');
      }
      return { type: 'DESTINATION_CHAIN', chainId: r.chainId };
    case 'ACTION_TYPE':
      if (!isHex32(r.actionType)) throw new CampaignRuleError('ACTION_TYPE.actionType is invalid');
      return { type: 'ACTION_TYPE', actionType: r.actionType };
    case 'TOKEN':
      if (typeof r.token !== 'string' || r.token.trim() === '') {
        throw new CampaignRuleError('TOKEN.token is invalid');
      }
      return { type: 'TOKEN', token: r.token };
    case 'MIN_AMOUNT':
      if (typeof r.minAmountRaw !== 'string' || !/^\d+$/.test(r.minAmountRaw)) {
        throw new CampaignRuleError('MIN_AMOUNT.minAmountRaw must be a decimal string');
      }
      return { type: 'MIN_AMOUNT', minAmountRaw: r.minAmountRaw };
    case 'CAMPAIGN_ID':
      if (!isHex32(r.campaignId)) throw new CampaignRuleError('CAMPAIGN_ID.campaignId is invalid');
      return { type: 'CAMPAIGN_ID', campaignId: r.campaignId };
    default:
      throw new CampaignRuleError(`unsupported rule type: ${String(r.type)}`);
  }
}

export function parseCampaignRules(raw: unknown): CampaignRule[] {
  if (!Array.isArray(raw)) throw new CampaignRuleError('rules must be an array');
  return raw.map(parseCampaignRule);
}

/** Fail-closed single-rule evaluation. Absent optional fact => false. */
export function ruleMatches(rule: CampaignRule, facts: VerifiedActivityFacts): boolean {
  switch (rule.type) {
    case 'ACTIVITY_KIND':
      return facts.kind === rule.kind;
    case 'SOURCE_CHAIN':
      return facts.sourceChainId === rule.chainId;
    case 'DESTINATION_CHAIN':
      return facts.destinationChainId !== undefined && facts.destinationChainId === rule.chainId;
    case 'ACTION_TYPE':
      return (
        typeof facts.actionType === 'string' &&
        facts.actionType.toLowerCase() === rule.actionType.toLowerCase()
      );
    case 'TOKEN':
      return (
        typeof facts.token === 'string' &&
        facts.token.toLowerCase() === rule.token.toLowerCase()
      );
    case 'MIN_AMOUNT':
      return facts.amountRaw !== undefined && facts.amountRaw >= BigInt(rule.minAmountRaw);
    case 'CAMPAIGN_ID':
      return (
        typeof facts.campaignId === 'string' &&
        facts.campaignId.toLowerCase() === rule.campaignId.toLowerCase()
      );
  }
}

export function allRulesMatch(rules: CampaignRule[], facts: VerifiedActivityFacts): boolean {
  return rules.every((rule) => ruleMatches(rule, facts));
}
