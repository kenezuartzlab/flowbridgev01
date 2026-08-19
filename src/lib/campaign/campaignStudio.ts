/**
 * Growth Hub V4 — Campaign Studio shared contract.
 *
 * Browser-safe. Defines the ONLY shape the Studio may submit and the
 * validation the server re-runs before any write. Rule types are frozen: the
 * browser can never introduce a new rule type or predicate.
 */
import { parseCampaignRule } from './campaignRules';
import { CAMPAIGN_RULE_TYPES } from './campaignTypes';
import type { CampaignRule, CampaignStatus } from './campaignTypes';
import {
  OFFICIAL_CHAIN_IDS,
  OFFICIAL_TESTNET_ROUTES,
} from '../bridge/officialBridgeConfig';
import { DIRECT_BRIDGE_ACTION_TYPE } from '../activity/activityVerifier';

export { CAMPAIGN_RULE_TYPES };

export interface StudioTaskInput {
  taskId: string;
  title: string;
  description?: string | null;
  points: number;
  requiredCount: number;
  completionLimitPerWallet: number;
  rules: unknown[];
  sortOrder: number;
}

export interface StudioCampaignInput {
  /** Present only when editing an existing definition. */
  campaignId?: string;
  slug: string;
  name: string;
  description?: string | null;
  status: CampaignStatus;
  /** Epoch ms. */
  startsAt: number;
  endsAt: number;
  tasks: StudioTaskInput[];
}

export interface StudioCampaignSummary extends StudioCampaignInput {
  campaignId: string;
  updatedAt?: number;
  /** Durable completions already recorded. Non-zero => delete is refused. */
  completionCount: number;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const HEX32_RE = /^0x[0-9a-fA-F]{64}$/;
const TASK_ID_RE = /^[a-z0-9][a-z0-9-_]{1,62}$/;

export const normalizeSlug = (raw: string) =>
  raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

/** Cryptographically random campaign id (bytes32 hex). */
export function newCampaignId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Full validation. Returns human-readable errors; empty array === valid. */
export function validateStudioCampaign(input: StudioCampaignInput): string[] {
  const errors: string[] = [];

  if (input.campaignId !== undefined && !HEX32_RE.test(input.campaignId)) {
    errors.push('Campaign id must be a bytes32 hex string.');
  }
  if (!input.name?.trim()) errors.push('Name is required.');
  if (input.name && input.name.trim().length > 120) errors.push('Name is too long (max 120).');
  if (!SLUG_RE.test(input.slug ?? '')) {
    errors.push('Slug must be lowercase letters, numbers and dashes (2-63 chars).');
  }
  if (input.description && input.description.length > 600) {
    errors.push('Description is too long (max 600).');
  }
  if (!['draft', 'published', 'archived'].includes(input.status)) {
    errors.push('Status must be draft, published or archived.');
  }
  if (!Number.isFinite(input.startsAt) || !Number.isFinite(input.endsAt)) {
    errors.push('Schedule dates are required.');
  } else if (input.endsAt <= input.startsAt) {
    errors.push('End date must be after the start date.');
  }

  if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
    errors.push('Add at least one verified task.');
    return errors;
  }
  if (input.tasks.length > 25) errors.push('A campaign may hold at most 25 tasks.');

  const seenTaskIds = new Set<string>();
  input.tasks.forEach((task, i) => {
    const label = `Task ${i + 1}`;
    if (!TASK_ID_RE.test(task.taskId ?? '')) {
      errors.push(`${label}: id must be lowercase letters, numbers, dash or underscore.`);
    } else if (seenTaskIds.has(task.taskId)) {
      errors.push(`${label}: duplicate task id "${task.taskId}".`);
    } else {
      seenTaskIds.add(task.taskId);
    }
    if (!task.title?.trim()) errors.push(`${label}: title is required.`);
    if (!Number.isInteger(task.points) || task.points < 0) {
      errors.push(`${label}: PTS must be a whole number of 0 or more.`);
    }
    if (!Number.isInteger(task.requiredCount) || task.requiredCount < 1) {
      errors.push(`${label}: required activities must be 1 or more.`);
    }
    if (
      !Number.isInteger(task.completionLimitPerWallet) ||
      task.completionLimitPerWallet < 1
    ) {
      errors.push(`${label}: completion limit per wallet must be 1 or more.`);
    }
    if (!Array.isArray(task.rules) || task.rules.length === 0) {
      errors.push(`${label}: add at least one verified rule.`);
      return;
    }
    const parsed: CampaignRule[] = [];
    task.rules.forEach((raw, ri) => {
      try {
        parsed.push(parseCampaignRule(raw));
      } catch (e: any) {
        errors.push(`${label} rule ${ri + 1}: ${e?.message ?? 'invalid rule'}`);
      }
    });
    // Contradiction guard: the same single-value rule type twice can never match.
    const singles = ['ACTIVITY_KIND', 'SOURCE_CHAIN', 'DESTINATION_CHAIN', 'ACTION_TYPE', 'TOKEN', 'MIN_AMOUNT', 'CAMPAIGN_ID'];
    for (const type of singles) {
      const of = parsed.filter((r) => r.type === type);
      if (of.length > 1) {
        const distinct = new Set(of.map((r) => JSON.stringify(r)));
        errors.push(
          distinct.size > 1
            ? `${label}: conflicting ${type} rules can never match.`
            : `${label}: duplicate ${type} rule.`,
        );
      }
    }
  });

  return errors;
}

/* ---------------------------------- templates --------------------------------- */

export interface StudioTemplate {
  id: string;
  label: string;
  hint: string;
  build: () => StudioCampaignInput;
}

const DAY = 86_400_000;

function bridgeTemplate(routeId: 'BNB_TO_BOT' | 'BOT_TO_BNB'): StudioCampaignInput {
  const route = OFFICIAL_TESTNET_ROUTES.find((r) => r.id === routeId)!;
  const now = Date.now();
  const nameSuffix =
    routeId === 'BNB_TO_BOT' ? 'BNB Testnet to BOT Testnet' : 'BOT Testnet to BNB Testnet';
  return {
    slug: normalizeSlug(`verified-bridge-${routeId}`),
    name: `Verified Bridge — ${nameSuffix}`,
    description:
      'Bridge USDT over the official BOT Bridge route. Progress is awarded only from server-verified source-chain activity.',
    status: 'draft',
    startsAt: now,
    endsAt: now + 30 * DAY,
    tasks: [
      {
        taskId: 'verified-bridge',
        title: `Bridge USDT ${nameSuffix}`,
        description: 'Complete one verified bridge submission on the official route.',
        points: 100,
        requiredCount: 1,
        completionLimitPerWallet: 1,
        sortOrder: 0,
        rules: [
          { type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' },
          { type: 'SOURCE_CHAIN', chainId: route.sourceChainId },
          { type: 'DESTINATION_CHAIN', chainId: route.destinationChainId },
          { type: 'ACTION_TYPE', actionType: DIRECT_BRIDGE_ACTION_TYPE },
          { type: 'TOKEN', token: route.sourceToken },
        ],
      },
    ],
  };
}

function verifiedSwapTemplate(): StudioCampaignInput {
  const path = VERIFIED_SWAP_PATHS[0]!;
  const now = Date.now();
  return {
    slug: normalizeSlug(`verified-swap-${path.id}`),
    name: 'Verified Swap — FlowBridgeRouter v3',
    description:
      'Swap USDT through FlowBridgeRouter v3. Progress is awarded only from server-verified on-chain swap activity.',
    status: 'draft',
    startsAt: now,
    endsAt: now + 30 * DAY,
    tasks: [
      {
        taskId: 'verified-swap',
        title: `Swap ${path.tokenInSymbol} on ${path.label}`,
        description: 'Complete one verified swap through the approved router path.',
        points: 100,
        requiredCount: 1,
        completionLimitPerWallet: 1,
        sortOrder: 0,
        rules: [
          { type: 'ACTIVITY_KIND', kind: 'SWAP_EXECUTED' },
          { type: 'SOURCE_CHAIN', chainId: path.chainId },
          { type: 'DESTINATION_CHAIN', chainId: path.chainId },
          { type: 'ACTION_TYPE', actionType: VERIFIED_SWAP_V1_ACTION_TYPE },
          { type: 'TOKEN', token: path.tokenIn },
        ],
      },
    ],
  };
}

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'bridge-bnb-bot',
    label: 'Verified Bridge — BNB Testnet → BOT Testnet',
    hint: 'Preselects BRIDGE_SUBMITTED, official route chains, action type and source token.',
    build: () => bridgeTemplate('BNB_TO_BOT'),
  },
  {
    id: 'bridge-bot-bnb',
    label: 'Verified Bridge — BOT Testnet → BNB Testnet',
    hint: 'Preselects BRIDGE_SUBMITTED, official route chains, action type and source token.',
    build: () => bridgeTemplate('BOT_TO_BNB'),
  },
  {
    id: 'verified-swap',
    label: 'Verified Swap — FlowBridgeRouter v3 (BOT Testnet)',
    hint: 'Preselects SWAP_EXECUTED, the approved swap chain, action type and token-in.',
    build: verifiedSwapTemplate,
  },
  {
    id: 'generic-activity',
    label: 'Verified Activity (advanced)',
    hint: 'Starts from an ACTIVITY_KIND rule only; add other verified rules manually.',
    build: () => {
      const now = Date.now();
      return {
        slug: normalizeSlug(`verified-activity-${now}`),
        name: 'Verified Activity Campaign',
        description: null,
        status: 'draft',
        startsAt: now,
        endsAt: now + 30 * DAY,
        tasks: [
          {
            taskId: 'verified-activity',
            title: 'Complete a verified activity',
            description: null,
            points: 50,
            requiredCount: 1,
            completionLimitPerWallet: 1,
            sortOrder: 0,
            rules: [{ type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' }],
          },
        ],
      };
    },
  },
];

/** Preset option lists for the task builder — sourced from existing config. */
export const STUDIO_CHAIN_OPTIONS = [
  { id: OFFICIAL_CHAIN_IDS.bnbTestnet, label: 'BNB Testnet (97)' },
  { id: OFFICIAL_CHAIN_IDS.botTestnet, label: 'BOT Testnet (968)' },
  { id: OFFICIAL_CHAIN_IDS.bnbMainnet, label: 'BNB Chain (56)' },
  { id: OFFICIAL_CHAIN_IDS.botMainnet, label: 'BOT Chain (1024)' },
];

export const STUDIO_TOKEN_OPTIONS = [
  ...OFFICIAL_TESTNET_ROUTES.map((r) => ({
    address: r.sourceToken,
    label: `USDT · ${r.id === 'BNB_TO_BOT' ? 'BNB Testnet' : 'BOT Testnet'}`,
  })),
  ...VERIFIED_SWAP_PATHS.map((p) => ({
    address: p.tokenIn,
    label: `${p.tokenInSymbol} swap token-in · ${p.label}`,
  })),
];

export const STUDIO_ACTION_TYPES = [
  { value: DIRECT_BRIDGE_ACTION_TYPE, label: 'Direct official bridge' },
  { value: VERIFIED_SWAP_V1_ACTION_TYPE, label: 'Verified swap (FlowBridgeRouter v3)' },
];
