/**
 * FlowBridge V30.1D.4 — read-only production Safe verification (BOT Mainnet 677).
 *
 * This module is pure. It compares the owner-approved Safe configuration against
 * a recorded READ-ONLY chain observation. It never creates a Safe, never signs,
 * never submits a Safe transaction and holds no key material.
 *
 * Rules (§3 of the V30.1D.4 brief):
 *  - chainId must be exactly BOT Mainnet 677 for a verification batch to count.
 *  - deployed bytecode must be non-empty at the Safe address.
 *  - the live owner set must be exactly the approved 3 owners (order-insensitive).
 *  - the live threshold must be exactly 2.
 *  - duplicate owners, zero addresses and non-mainnet contamination are rejected.
 *  - a mismatch blocks ONLY that authority.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';

export type SafeAuthorityId = 'TREASURY' | 'GOVERNANCE' | 'OPERATIONS';

export const REQUIRED_SAFE_OWNER_COUNT = 3;
export const REQUIRED_SAFE_THRESHOLD = 2;

export interface ApprovedSafeConfig {
  authority: SafeAuthorityId;
  label: string;
  address: string;
  threshold: number;
  owners: readonly string[];
  /** Bounded capability description; never an ownership grant by itself. */
  capabilities: readonly string[];
}

/** Owner-supplied production Safes frozen by the V30.1D.4 decision session. */
export const APPROVED_PRODUCTION_SAFES: readonly ApprovedSafeConfig[] = [
  {
    authority: 'TREASURY',
    label: 'Treasury Safe',
    address: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
    threshold: 2,
    owners: [
      '0xF951c408f2412304ea08ADE94d53D7Df1EBdb25e',
      '0xAbe9AC1bC4b9E99b89c27f97c580B5a0b8Fa75E1',
      '0x2eA57676b4086300C949A7eeba8697AE2fc1A1F0',
    ],
    capabilities: [
      'FLOW reserve custody',
      'rewards and staking funding',
      'treasury asset movement',
    ],
  },
  {
    authority: 'GOVERNANCE',
    label: 'Governance Safe',
    address: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    threshold: 2,
    owners: [
      '0x524Db06954de917025180057BCBeB36eC96A98c5',
      '0x145E201c658706D3D2b9f35E0c51270474453B2B',
      '0x0EdFf26415660c9d2d12320678192f1B97BEBb85',
    ],
    capabilities: [
      'protocol ownership',
      'delayed economic and configuration changes',
      'Router ownership',
      'staking governance',
      'high-impact role administration',
    ],
  },
  {
    authority: 'OPERATIONS',
    label: 'Operations Safe',
    address: '0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF',
    threshold: 2,
    owners: [
      '0x62b1902F23483e0AF44564681865E993AAA47368',
      '0xD5966A3E829A4c366b8F762195beaf38d63D6ABe',
      '0x2c9f04c9091b2dCa91f35fE6e6492E296A7519Cc',
    ],
    capabilities: [
      'bounded pause duty',
      'campaign management',
      'no treasury custody',
      'no unrestricted protocol ownership',
    ],
  },
] as const;

export function approvedSafe(authority: SafeAuthorityId): ApprovedSafeConfig | null {
  return APPROVED_PRODUCTION_SAFES.find((s) => s.authority === authority) ?? null;
}

/** A single recorded read-only observation. Nothing here was signed or sent. */
export interface SafeChainObservation {
  authority: SafeAuthorityId;
  chainId: number;
  address: string;
  /** true when eth_getCode returned non-empty deployed bytecode. */
  hasCode: boolean;
  codeSizeBytes: number;
  codeHash: string | null;
  liveOwners: readonly string[];
  liveThreshold: number | null;
  /** Exact read methods used, for evidence. */
  readMethods: readonly string[];
  observedAt: string;
}

export type SafeVerificationState = 'VERIFIED' | 'BLOCKED';

export interface SafeVerificationResult {
  authority: SafeAuthorityId;
  label: string;
  address: string;
  state: SafeVerificationState;
  approvedOwners: readonly string[];
  approvedThreshold: number;
  liveOwners: readonly string[];
  liveThreshold: number | null;
  codeHash: string | null;
  codeSizeBytes: number;
  readMethods: readonly string[];
  observedAt: string | null;
  mismatches: readonly string[];
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';
const lower = (v: string) => v.toLowerCase();
const isAddr = (v: unknown): v is string =>
  typeof v === 'string' && ADDR.test(v) && lower(v) !== ZERO;

export function verifySafe(
  config: ApprovedSafeConfig,
  observation: SafeChainObservation | undefined,
): SafeVerificationResult {
  const mismatches: string[] = [];
  const base = {
    authority: config.authority,
    label: config.label,
    address: config.address,
    approvedOwners: config.owners,
    approvedThreshold: config.threshold,
  };

  if (!observation) {
    return {
      ...base,
      state: 'BLOCKED',
      liveOwners: [],
      liveThreshold: null,
      codeHash: null,
      codeSizeBytes: 0,
      readMethods: [],
      observedAt: null,
      mismatches: ['no read-only chain observation recorded for this authority'],
    };
  }

  if (observation.chainId !== BOT_MAINNET_CHAIN_ID) {
    mismatches.push(
      `observation chain ${observation.chainId} is not BOT Mainnet ${BOT_MAINNET_CHAIN_ID}`,
    );
  }
  if (lower(observation.address) !== lower(config.address)) {
    mismatches.push('observed address does not match the approved Safe address');
  }
  if (!observation.hasCode || observation.codeSizeBytes <= 0) {
    mismatches.push('no deployed bytecode at the Safe address');
  }

  // Approved-side structural rules.
  if (!isAddr(config.address)) mismatches.push('approved Safe address is malformed or zero');
  if (config.owners.length !== REQUIRED_SAFE_OWNER_COUNT) {
    mismatches.push(`approved owner set must contain exactly ${REQUIRED_SAFE_OWNER_COUNT} owners`);
  }
  if (!config.owners.every(isAddr)) mismatches.push('approved owner set contains a malformed or zero address');
  if (new Set(config.owners.map(lower)).size !== config.owners.length) {
    mismatches.push('approved owner set contains duplicate addresses');
  }
  if (config.threshold !== REQUIRED_SAFE_THRESHOLD) {
    mismatches.push(`approved threshold must be exactly ${REQUIRED_SAFE_THRESHOLD}`);
  }

  // Live-side rules.
  const live = observation.liveOwners.map(lower);
  if (live.length !== REQUIRED_SAFE_OWNER_COUNT) {
    mismatches.push(
      `live owner count ${live.length} does not equal the required ${REQUIRED_SAFE_OWNER_COUNT}`,
    );
  }
  if (!observation.liveOwners.every(isAddr)) mismatches.push('live owner set contains a malformed or zero address');
  if (new Set(live).size !== live.length) mismatches.push('live owner set contains duplicate addresses');
  if (observation.liveThreshold !== REQUIRED_SAFE_THRESHOLD) {
    mismatches.push(
      `live threshold ${observation.liveThreshold ?? 'unreadable'} does not equal the required ${REQUIRED_SAFE_THRESHOLD}`,
    );
  }

  const approved = config.owners.map(lower);
  for (const owner of approved) {
    if (!live.includes(owner)) mismatches.push(`approved owner ${owner} is absent from the live Safe`);
  }
  for (const owner of live) {
    if (!approved.includes(owner)) mismatches.push(`live owner ${owner} is not in the approved owner set`);
  }

  return {
    ...base,
    state: mismatches.length === 0 ? 'VERIFIED' : 'BLOCKED',
    liveOwners: observation.liveOwners,
    liveThreshold: observation.liveThreshold,
    codeHash: observation.codeHash,
    codeSizeBytes: observation.codeSizeBytes,
    readMethods: observation.readMethods,
    observedAt: observation.observedAt,
    mismatches,
  };
}

export function verifySafes(
  observations: readonly SafeChainObservation[],
): readonly SafeVerificationResult[] {
  return APPROVED_PRODUCTION_SAFES.map((config) =>
    verifySafe(
      config,
      observations.find((o) => o.authority === config.authority),
    ),
  );
}

/**
 * Recorded V30.1D.4 read-only observations against https://rpc.botchain.ai.
 * Methods used: eth_chainId, eth_getCode, eth_call getOwners() 0xa0e67e2b and
 * eth_call getThreshold() 0xe75235b8. Zero transactions, zero signatures.
 */
export const RECORDED_SAFE_OBSERVATIONS: readonly SafeChainObservation[] = [
  {
    authority: 'TREASURY',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0xF03752926fF468D71e4AA9053e29216b9e216239',
    hasCode: true,
    codeSizeBytes: 171,
    codeHash: '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c',
    liveOwners: [
      '0xf951c408f2412304ea08ade94d53d7df1ebdb25e',
      '0xabe9ac1bc4b9e99b89c27f97c580b5a0b8fa75e1',
      '0x2c9f04c9091b2dca91f35fe6e6492e296a7519cc',
    ],
    liveThreshold: 2,
    readMethods: ['eth_chainId', 'eth_getCode', 'getOwners()', 'getThreshold()'],
    observedAt: '2026-08-27T14:05:00.000Z',
  },
  {
    authority: 'GOVERNANCE',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    hasCode: true,
    codeSizeBytes: 171,
    codeHash: '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c',
    liveOwners: [
      '0x524db06954de917025180057bcbeb36ec96a98c5',
      '0x145e201c658706d3d2b9f35e0c51270474453b2b',
      '0x0edff26415660c9d2d12320678192f1b97bebb85',
    ],
    liveThreshold: 2,
    readMethods: ['eth_chainId', 'eth_getCode', 'getOwners()', 'getThreshold()'],
    observedAt: '2026-08-27T14:05:00.000Z',
  },
  {
    authority: 'OPERATIONS',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF',
    hasCode: true,
    codeSizeBytes: 171,
    codeHash: '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c',
    liveOwners: [
      '0x62b1902f23483e0af44564681865e993aaa47368',
      '0xd5966a3e829a4c366b8f762195beaf38d63d6abe',
      '0x2c9f04c9091b2dca91f35fe6e6492e296a7519cc',
    ],
    liveThreshold: 2,
    readMethods: ['eth_chainId', 'eth_getCode', 'getOwners()', 'getThreshold()'],
    observedAt: '2026-08-27T14:05:00.000Z',
  },
] as const;

/** Bounded role mapping (§4). Descriptive only; grants nothing. */
export const AUTHORITY_ROLE_MATRIX = [
  {
    authority: 'GOVERNANCE' as SafeAuthorityId,
    roles: ['protocol owner', 'Router owner', 'staking governance', 'role admin'],
    timelocked: true,
  },
  {
    authority: 'TREASURY' as SafeAuthorityId,
    roles: ['FLOW genesis recipient', 'rewards funding', 'staking reward funding'],
    timelocked: false,
  },
  {
    authority: 'OPERATIONS' as SafeAuthorityId,
    roles: ['pauser', 'campaign manager'],
    timelocked: false,
  },
] as const;
