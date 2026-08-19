/**
 * Growth Hub V7 — Campaign Action Runner (pure, presentation/orchestration only).
 *
 * Resolves whether a published campaign task maps to a CURRENTLY supported
 * FlowBridge action (verified direct BNB <-> BOT bridge) using ONLY the
 * existing parsed rule types, and builds/validates safe deep links.
 *
 * Hard boundaries:
 * - never authoritative: no PTS, no completion, no verification, no settlement
 * - never carries signatures, intent hashes, contract addresses or trusted state
 * - fail-closed: an unknown rule type or an unmapped route yields `null`
 */
import {
  OFFICIAL_CHAIN_IDS,
  findOfficialTestnetRoute,
  officialSourceDecimals,
} from '../bridge/officialBridgeConfig';
import {
  VERIFIED_SWAP_V1_ACTION_TYPE,
  findVerifiedSwapPath,
} from '../swap/verifiedSwapConfig';
import type { CampaignApiCampaign, CampaignApiTask } from './campaignApi';
import { CAMPAIGN_RULE_TYPES } from './campaignTypes';

export type CampaignActionDirection = 'BNB_TO_BOT' | 'BOT_TO_BNB';

export interface CampaignBridgeAction {
  kind: 'VERIFIED_BRIDGE';
  direction: CampaignActionDirection;
  sourceChainId: number;
  destinationChainId: number;
  /** true when the resolved chain pair is the official mainnet pair. */
  isMainnet: boolean;
  /** Display-only token label, present only when a TOKEN rule validated. */
  tokenLabel?: string;
  /** Raw minimum amount (source-token base units) when a MIN_AMOUNT rule exists. */
  minAmountRaw?: string;
  /** Human minimum amount using official SOURCE decimals. */
  minAmountLabel?: string;
}

export interface CampaignActionSearch {
  mode: 'bridge';
  direction: CampaignActionDirection;
  source: number;
  destination: number;
  campaign: string;
  task: string;
}

const SUPPORTED_PAIRS: {
  direction: CampaignActionDirection;
  source: number;
  destination: number;
  isMainnet: boolean;
}[] = [
  {
    direction: 'BNB_TO_BOT',
    source: OFFICIAL_CHAIN_IDS.bnbTestnet,
    destination: OFFICIAL_CHAIN_IDS.botTestnet,
    isMainnet: false,
  },
  {
    direction: 'BOT_TO_BNB',
    source: OFFICIAL_CHAIN_IDS.botTestnet,
    destination: OFFICIAL_CHAIN_IDS.bnbTestnet,
    isMainnet: false,
  },
  {
    direction: 'BNB_TO_BOT',
    source: OFFICIAL_CHAIN_IDS.bnbMainnet,
    destination: OFFICIAL_CHAIN_IDS.botMainnet,
    isMainnet: true,
  },
  {
    direction: 'BOT_TO_BNB',
    source: OFFICIAL_CHAIN_IDS.botMainnet,
    destination: OFFICIAL_CHAIN_IDS.bnbMainnet,
    isMainnet: true,
  },
];

function findPair(source: number, destination: number) {
  return SUPPORTED_PAIRS.find((p) => p.source === source && p.destination === destination);
}

const isSafeId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 96 && /^[a-zA-Z0-9._:-]+$/.test(v);

function formatMinAmount(raw: string, decimals: number | undefined): string | undefined {
  if (decimals === undefined) return undefined;
  try {
    const value = BigInt(raw);
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const frac = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch {
    return undefined;
  }
}

/**
 * Supported V7 pattern (all rules must be known types):
 *   ACTIVITY_KIND(BRIDGE_SUBMITTED|BRIDGE_COMPLETED)
 * + SOURCE_CHAIN + DESTINATION_CHAIN forming an official BNB<->BOT pair
 * + optional ACTION_TYPE / CAMPAIGN_ID / TOKEN / MIN_AMOUNT
 * A TOKEN rule must equal the official source token when a testnet route exists.
 */
export function resolveCampaignTaskAction(task: CampaignApiTask): CampaignBridgeAction | null {
  const rules = Array.isArray(task.rules) ? (task.rules as Record<string, unknown>[]) : [];
  if (rules.length === 0) return null;

  let kindOk = false;
  let source: number | undefined;
  let destination: number | undefined;
  let token: string | undefined;
  let minAmountRaw: string | undefined;

  for (const rule of rules) {
    const type = typeof rule?.type === 'string' ? rule.type : '';
    if (!(CAMPAIGN_RULE_TYPES as readonly string[]).includes(type)) return null;
    switch (type) {
      case 'ACTIVITY_KIND':
        if (rule.kind !== 'BRIDGE_SUBMITTED' && rule.kind !== 'BRIDGE_COMPLETED') return null;
        kindOk = true;
        break;
      case 'SOURCE_CHAIN':
        if (typeof rule.chainId !== 'number') return null;
        source = rule.chainId;
        break;
      case 'DESTINATION_CHAIN':
        if (typeof rule.chainId !== 'number') return null;
        destination = rule.chainId;
        break;
      case 'TOKEN':
        if (typeof rule.token !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(rule.token)) return null;
        token = rule.token;
        break;
      case 'MIN_AMOUNT':
        if (typeof rule.minAmountRaw !== 'string' || !/^\d+$/.test(rule.minAmountRaw)) return null;
        minAmountRaw = rule.minAmountRaw;
        break;
      default:
        break; // ACTION_TYPE / CAMPAIGN_ID: no action-preselection meaning
    }
  }

  if (!kindOk || source === undefined || destination === undefined) return null;
  const pair = findPair(source, destination);
  if (!pair) return null;

  const officialRoute = pair.isMainnet ? undefined : findOfficialTestnetRoute(pair.direction);
  if (token && officialRoute && token.toLowerCase() !== officialRoute.sourceToken.toLowerCase()) {
    return null;
  }

  return {
    kind: 'VERIFIED_BRIDGE',
    direction: pair.direction,
    sourceChainId: pair.source,
    destinationChainId: pair.destination,
    isMainnet: pair.isMainnet,
    ...(token ? { tokenLabel: 'USDT' } : {}),
    ...(minAmountRaw
      ? {
          minAmountRaw,
          minAmountLabel: formatMinAmount(minAmountRaw, officialSourceDecimals(pair.source)),
        }
      : {}),
  };
}

/** Build the safe deep-link search for the existing trading route. */
export function campaignActionLink(
  campaign: Pick<CampaignApiCampaign, 'slug'>,
  task: Pick<CampaignApiTask, 'taskId'>,
  action: CampaignBridgeAction,
): CampaignActionSearch {
  return {
    mode: 'bridge',
    direction: action.direction,
    source: action.sourceChainId,
    destination: action.destinationChainId,
    campaign: campaign.slug,
    task: task.taskId,
  };
}

/** Validate untrusted query state. Anything unexpected fails closed to `null`. */
export function parseCampaignActionSearch(raw: unknown): CampaignActionSearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  if (q.mode !== 'bridge') return null;
  if (q.direction !== 'BNB_TO_BOT' && q.direction !== 'BOT_TO_BNB') return null;

  const source = Number(q.source);
  const destination = Number(q.destination);
  if (!Number.isInteger(source) || !Number.isInteger(destination)) return null;
  const pair = findPair(source, destination);
  if (!pair || pair.direction !== q.direction) return null;
  if (!isSafeId(q.campaign) || !isSafeId(q.task)) return null;

  return {
    mode: 'bridge',
    direction: pair.direction,
    source: pair.source,
    destination: pair.destination,
    campaign: q.campaign,
    task: q.task,
  };
}

/** Parse a raw location search string (browser URL) into a safe descriptor. */
export function parseCampaignActionSearchString(search: string): CampaignActionSearch | null {
  try {
    const params = new URLSearchParams(search);
    if (!params.get('mode')) return null;
    return parseCampaignActionSearch(Object.fromEntries(params.entries()));
  } catch {
    return null;
  }
}

export function isMainnetActionSearch(search: CampaignActionSearch): boolean {
  return findPair(search.source, search.destination)?.isMainnet ?? false;
}

/* ------------------------------ V8 verified swap ----------------------------- */

export interface CampaignSwapAction {
  kind: 'VERIFIED_SWAP';
  chainId: number;
  /** Configured token-in of the approved swap path (display + prefill only). */
  tokenIn: string;
  tokenLabel: string;
  minAmountRaw?: string;
  minAmountLabel?: string;
}

export interface CampaignSwapActionSearch {
  mode: 'swap';
  chain: number;
  token: string;
  campaign: string;
  task: string;
}

export type CampaignTaskAnyAction = CampaignBridgeAction | CampaignSwapAction;

/**
 * Supported V8 swap pattern (all rules must be known types):
 *   ACTIVITY_KIND(SWAP_EXECUTED)
 * + SOURCE_CHAIN === DESTINATION_CHAIN matching an approved swap path
 * + optional ACTION_TYPE (must be the verified swap action type)
 * + optional TOKEN (must be the configured token-in) / MIN_AMOUNT / CAMPAIGN_ID
 */
export function resolveCampaignTaskSwapAction(task: CampaignApiTask): CampaignSwapAction | null {
  const rules = Array.isArray(task.rules) ? (task.rules as Record<string, unknown>[]) : [];
  if (rules.length === 0) return null;

  let kindOk = false;
  let source: number | undefined;
  let destination: number | undefined;
  let token: string | undefined;
  let actionType: string | undefined;
  let minAmountRaw: string | undefined;

  for (const rule of rules) {
    const type = typeof rule?.type === 'string' ? rule.type : '';
    if (!(CAMPAIGN_RULE_TYPES as readonly string[]).includes(type)) return null;
    switch (type) {
      case 'ACTIVITY_KIND':
        if (rule.kind !== 'SWAP_EXECUTED') return null;
        kindOk = true;
        break;
      case 'SOURCE_CHAIN':
        if (typeof rule.chainId !== 'number') return null;
        source = rule.chainId;
        break;
      case 'DESTINATION_CHAIN':
        if (typeof rule.chainId !== 'number') return null;
        destination = rule.chainId;
        break;
      case 'ACTION_TYPE':
        if (typeof rule.actionType !== 'string') return null;
        actionType = rule.actionType;
        break;
      case 'TOKEN':
        if (typeof rule.token !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(rule.token)) return null;
        token = rule.token;
        break;
      case 'MIN_AMOUNT':
        if (typeof rule.minAmountRaw !== 'string' || !/^\d+$/.test(rule.minAmountRaw)) return null;
        minAmountRaw = rule.minAmountRaw;
        break;
      default:
        break;
    }
  }

  if (!kindOk || source === undefined) return null;
  if (destination !== undefined && destination !== source) return null;
  if (actionType && actionType.toLowerCase() !== VERIFIED_SWAP_V1_ACTION_TYPE.toLowerCase()) {
    return null;
  }

  const path = findVerifiedSwapPath(source, token);
  if (!path) return null;

  return {
    kind: 'VERIFIED_SWAP',
    chainId: path.chainId,
    tokenIn: path.tokenIn,
    tokenLabel: path.tokenInSymbol,
    ...(minAmountRaw
      ? {
          minAmountRaw,
          minAmountLabel: formatMinAmount(minAmountRaw, path.tokenInDecimals),
        }
      : {}),
  };
}

/** Bridge first (unchanged), then the V8 verified swap path. */
export function resolveCampaignTaskAnyAction(task: CampaignApiTask): CampaignTaskAnyAction | null {
  return resolveCampaignTaskAction(task) ?? resolveCampaignTaskSwapAction(task);
}

export function campaignSwapActionLink(
  campaign: Pick<CampaignApiCampaign, 'slug'>,
  task: Pick<CampaignApiTask, 'taskId'>,
  action: CampaignSwapAction,
): CampaignSwapActionSearch {
  return {
    mode: 'swap',
    chain: action.chainId,
    token: action.tokenIn,
    campaign: campaign.slug,
    task: task.taskId,
  };
}

/** Validate untrusted swap query state. Anything unexpected fails closed. */
export function parseCampaignSwapActionSearch(raw: unknown): CampaignSwapActionSearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  if (q.mode !== 'swap') return null;
  const chain = Number(q.chain);
  if (!Number.isInteger(chain)) return null;
  const token = typeof q.token === 'string' ? q.token : undefined;
  const path = findVerifiedSwapPath(chain, token);
  if (!path) return null;
  if (!isSafeId(q.campaign) || !isSafeId(q.task)) return null;
  return {
    mode: 'swap',
    chain: path.chainId,
    token: path.tokenIn,
    campaign: q.campaign,
    task: q.task,
  };
}

export function parseCampaignSwapActionSearchString(
  search: string,
): CampaignSwapActionSearch | null {
  try {
    const params = new URLSearchParams(search);
    if (params.get('mode') !== 'swap') return null;
    return parseCampaignSwapActionSearch(Object.fromEntries(params.entries()));
  } catch {
    return null;
  }
}
