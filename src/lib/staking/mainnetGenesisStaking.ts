/**
 * FlowBridge V30.2B P3B — BOT Mainnet 677 Flexible Genesis staking policy.
 *
 * Only the Flexible product (productId 0, lockSeconds 0) is executable on
 * mainnet. That is the single path proven end-to-end on chain 677 by the P3B
 * lifecycle canary: approve → openPosition → positive contract-computed
 * accrual → claim → exact 1 FLOW principal withdrawal, with the unused Genesis
 * reservation released and the reward treasury left solvent.
 *
 * 30D / 90D / 180D / 365D remain non-executable by construction. Their safety
 * is NOT inferred from the Flexible canary; each needs its own proven live
 * lifecycle before it may be enabled here.
 */
import {
  V30_2B_FEATURE_ACTIVATION,
  resolveCanonicalAddress,
} from '@/lib/deploy/v302bCanonicalRegistry';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';

export const MAINNET_FLEXIBLE_PRODUCT_ID = 0;

/** Product ids that may be prepared as a mainnet stake transaction. */
export const MAINNET_EXECUTABLE_PRODUCT_IDS: readonly number[] = [
  MAINNET_FLEXIBLE_PRODUCT_ID,
];

export const P3B_CANARY_EVIDENCE = {
  chainId: BOT_MAINNET_CHAIN_ID,
  productId: MAINNET_FLEXIBLE_PRODUCT_ID,
  principalFlow: '1',
  genesisAprBps: 1800,
  genesisReservedFlow: '0.044383561643835616',
  claimTxHash: '0x1514c6db432b5fe9f974da4d319ae3705b424c3028c52eda3ea80d835dae1570',
  withdrawTxHash: '0x531116aba0310af070e4312660d5f737d56d97e88628e047f48e764288ab57e9',
} as const;

/** Fail-closed: a product is executable only when it is the proven Flexible one. */
export function isMainnetStakingProductExecutable(productId: number): boolean {
  if (!V30_2B_FEATURE_ACTIVATION.stakingExecutionEnabled) return false;
  if (!V30_2B_FEATURE_ACTIVATION.genesisFlexibleStakingEnabled) return false;
  return MAINNET_EXECUTABLE_PRODUCT_IDS.includes(productId);
}

export function mainnetStakingAddresses(): {
  token: `0x${string}` | null;
  vault: `0x${string}` | null;
  treasury: `0x${string}` | null;
} {
  return {
    token: resolveCanonicalAddress(BOT_MAINNET_CHAIN_ID, 'FlowToken'),
    vault: resolveCanonicalAddress(BOT_MAINNET_CHAIN_ID, 'FlowStakingVaultV2'),
    treasury: resolveCanonicalAddress(BOT_MAINNET_CHAIN_ID, 'FlowStakingRewardTreasury'),
  };
}

export const FLOW_ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

export const STAKING_VAULT_ABI = [
  {
    type: 'function',
    name: 'openPosition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'productId', type: 'uint8' },
      { name: 'principal', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'previewPending',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'positionCountOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'positionsOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getPosition',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'productId', type: 'uint8' },
          { name: 'status', type: 'uint96' },
          { name: 'principal', type: 'uint256' },
          { name: 'openedAt', type: 'uint40' },
          { name: 'maturityAt', type: 'uint40' },
          { name: 'genesisEndAt', type: 'uint40' },
          { name: 'genesisRateBps', type: 'uint16' },
          { name: 'floorRateBps', type: 'uint16' },
          { name: 'genesisReserved', type: 'uint256' },
          { name: 'genesisAccrued', type: 'uint256' },
          { name: 'floorReserved', type: 'uint256' },
          { name: 'floorAccrued', type: 'uint256' },
          { name: 'varPaid', type: 'uint256' },
          { name: 'pending', type: 'uint256' },
          { name: 'lastAccrualAt', type: 'uint40' },
        ],
      },
    ],
  },
] as const;

/** Deployed controller exposes the fixed-array getter `products(uint256)`. */
export const STAKING_CONTROLLER_PRODUCT_ABI = [
  {
    type: 'function',
    name: 'products',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'active', type: 'bool' },
      { name: 'lockSeconds', type: 'uint32' },
      { name: 'genesisAprBps', type: 'uint16' },
      { name: 'floorBps', type: 'uint16' },
      { name: 'targetBps', type: 'uint16' },
      { name: 'hardCapBps', type: 'uint16' },
      { name: 'minPrincipal', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'emergencyMode',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'genesisYear1Used',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'GENESIS_YEAR1_CAP',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'standardYear1Used',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'STANDARD_YEAR1_CAP',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'oracle',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

export const STAKING_TREASURY_ABI = [
  {
    type: 'function',
    name: 'freeBalance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;
