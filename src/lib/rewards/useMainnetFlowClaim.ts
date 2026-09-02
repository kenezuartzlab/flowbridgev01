/**
 * FlowBridge V30.2B P2E — live BOT Mainnet 677 claim state.
 *
 * Every gate is read from the canonical distributor on chain 677 immediately
 * before a claim can be offered:
 *   paused(), getEpoch(epochId) (root, window, cancelled/released),
 *   isClaimed(epochId, index), totalReserved() and the distributor's FLOW
 *   balance. The frozen manifest root MUST equal the on-chain root, and the
 *   Merkle proof is re-verified locally before any wallet is asked to sign.
 *
 * Fail-closed: any read failure, mismatch or unknown state blocks the claim.
 * No amount, address or proof ever comes from user input.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, http, type Hex } from 'viem';

import { botMainnet } from '@/lib/wagmi';
import { BOT_MAINNET_CHAIN_ID, getFlowRewardsChainConfig } from './flowRewardsRegistry';
import {
  MERKLE_DISTRIBUTOR_CLAIM_ABI,
  prepareMerkleClaim,
  type MerkleClaimPreparation,
  type PublishedEpochState,
} from './merkleClaim';
import { findMainnetEntitlement, type MainnetEntitlementMatch } from './mainnetEpochManifest';

const READ_ABI = [
  ...MERKLE_DISTRIBUTOR_CLAIM_ABI,
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'epochCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'getEpoch',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'root', type: 'bytes32' },
          { name: 'allocation', type: 'uint256' },
          { name: 'claimed', type: 'uint256' },
          { name: 'claimStart', type: 'uint64' },
          { name: 'claimEnd', type: 'uint64' },
          { name: 'cancelled', type: 'bool' },
          { name: 'released', type: 'bool' },
        ],
      },
    ],
  },
] as const;

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export type MainnetClaimStatus =
  | 'NO_ENTITLEMENT'
  | 'PAUSED'
  | 'READ_FAILED'
  | 'ROOT_MISMATCH'
  | 'ALREADY_CLAIMED'
  | 'BLOCKED'
  | 'CLAIMABLE';

export interface MainnetClaimState {
  status: MainnetClaimStatus;
  message: string;
  /** Only present when status === 'CLAIMABLE'. */
  preparation: Extract<MerkleClaimPreparation, { claimable: true }> | null;
  entitlement: MainnetEntitlementMatch | null;
  epoch: PublishedEpochState | null;
  alreadyClaimed: boolean;
  distributor: Hex | null;
  explorerTxUrl: string | null;
}

const IDLE: MainnetClaimState = {
  status: 'NO_ENTITLEMENT',
  message: 'This wallet has no allocation in a published BOT Mainnet reward epoch.',
  preparation: null,
  entitlement: null,
  epoch: null,
  alreadyClaimed: false,
  distributor: null,
  explorerTxUrl: null,
};

export interface UseMainnetFlowClaim extends MainnetClaimState {
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useMainnetFlowClaim(wallet: string | null | undefined): UseMainnetFlowClaim {
  const [state, setState] = useState<MainnetClaimState>(IDLE);
  const [loading, setLoading] = useState(false);

  const read = useCallback(async () => {
    const entitlement = findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, wallet);
    if (!entitlement) {
      setState(IDLE);
      return;
    }
    const config = getFlowRewardsChainConfig(BOT_MAINNET_CHAIN_ID);
    const distributor = config?.distributor ?? null;
    const token = config?.token ?? null;
    if (!distributor || !token || distributor.toLowerCase() !== entitlement.manifest.distributor.toLowerCase()) {
      setState({
        ...IDLE,
        status: 'READ_FAILED',
        entitlement,
        message: 'The mainnet reward distributor could not be resolved from the canonical registry.',
      });
      return;
    }

    setLoading(true);
    try {
      const client = createPublicClient({ chain: botMainnet, transport: http() });
      const { epochId, index } = entitlement.leaf;
      const [paused, epochRaw, claimed, totalReserved, balance] = await Promise.all([
        client.readContract({ address: distributor, abi: READ_ABI, functionName: 'paused' }),
        client.readContract({
          address: distributor,
          abi: READ_ABI,
          functionName: 'getEpoch',
          args: [BigInt(epochId)],
        }),
        client.readContract({
          address: distributor,
          abi: READ_ABI,
          functionName: 'isClaimed',
          args: [BigInt(epochId), BigInt(index)],
        }),
        client.readContract({ address: distributor, abi: READ_ABI, functionName: 'totalReserved' }),
        client.readContract({
          address: token,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [distributor],
        }),
      ]);

      const epoch: PublishedEpochState = {
        epochId,
        root: epochRaw.root as Hex,
        claimStart: Number(epochRaw.claimStart),
        claimEnd: Number(epochRaw.claimEnd),
        cancelled: epochRaw.cancelled,
        released: epochRaw.released,
        distributorBalance: (balance as bigint).toString(),
        totalReserved: (totalReserved as bigint).toString(),
      };
      const explorerTxUrl = `${botMainnet.blockExplorers.default.url}/tx/${entitlement.manifest.publicationTxHash}`;
      const base = { entitlement, epoch, alreadyClaimed: Boolean(claimed), distributor, explorerTxUrl };

      if (epoch.root.toLowerCase() !== entitlement.manifest.root.toLowerCase()) {
        setState({
          ...base,
          preparation: null,
          status: 'ROOT_MISMATCH',
          message:
            'The published epoch root on chain does not match this release — claiming is blocked until it is reconciled.',
        });
        return;
      }
      if (paused) {
        setState({
          ...base,
          preparation: null,
          status: 'PAUSED',
          message: 'The reward distributor is paused. No claim can be submitted right now.',
        });
        return;
      }

      const prep = prepareMerkleClaim({
        chainId: BOT_MAINNET_CHAIN_ID,
        distributor,
        epoch,
        leaf: entitlement.leaf,
        proof: entitlement.proof,
        alreadyClaimed: Boolean(claimed),
        nowSeconds: Math.floor(Date.now() / 1000),
      });

      if (prep.claimable) {
        setState({ ...base, preparation: prep, status: 'CLAIMABLE', message: 'Your allocation is claimable now.' });
      } else {
        setState({
          ...base,
          preparation: null,
          status: prep.reason === 'alreadyClaimed' ? 'ALREADY_CLAIMED' : 'BLOCKED',
          message: prep.message,
        });
      }
    } catch {
      setState({
        ...IDLE,
        status: 'READ_FAILED',
        entitlement,
        distributor,
        message: 'Live reward state could not be read from BOT Mainnet. Claiming stays disabled until it can.',
      });
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void read();
  }, [read]);

  return { ...state, loading, refresh: read };
}
