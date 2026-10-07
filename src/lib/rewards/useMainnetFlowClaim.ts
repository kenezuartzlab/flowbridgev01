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
import { MAINNET_EPOCH_MANIFESTS, type MainnetEntitlementMatch } from './mainnetEpochManifest';
import { draftFlowLabel, findMainnetDraftEntitlement } from './mainnetEpochDraft';

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
  | 'NOT_PUBLISHED'
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

/**
 * Automatic round discovery: rounds published after this release are served by
 * the server only when their stored root equals the live on-chain root. The
 * root/proof are re-verified on chain and locally below, so a wrong answer can
 * only block, never pay.
 */
async function discoverEntitlements(wallet: string | null | undefined): Promise<MainnetEntitlementMatch[]> {
  if (!wallet || typeof fetch === 'undefined') return [];
  try {
    const res = await fetch(`/api/public/reward-rounds?wallet=${encodeURIComponent(wallet.toLowerCase())}`);
    if (!res.ok) return [];
    const { rounds } = (await res.json()) as { rounds: { epochId: number; root: Hex; allocationWei: string; claimStart: number; claimEnd: number; distributor: Hex; leaf: { index: number; account: Hex; amount: string; proof: Hex[] } }[] };
    return (rounds ?? []).map((r) => {
    const leaf = { epochId: r.epochId, index: r.leaf.index, account: r.leaf.account, amount: r.leaf.amount };
    return {
      manifest: { chainId: BOT_MAINNET_CHAIN_ID, epochId: r.epochId, campaignId: `MAINNET_SETTLEMENT_ROUND_${r.epochId}`, distributor: r.distributor, root: r.root, allocationWei: r.allocationWei, claimStart: r.claimStart, claimEnd: r.claimEnd, publicationTxHash: null, entitlements: [{ ...leaf, proof: r.leaf.proof }] },
      leaf,
      proof: r.leaf.proof,
    };
    });
  } catch {
    return [];
  }
}

/** Every round (frozen manifest + discovered) containing the wallet, oldest first, one per epoch. */
async function allEntitlements(wallet: string | null | undefined): Promise<MainnetEntitlementMatch[]> {
  const out = new Map<number, MainnetEntitlementMatch>();
  if (wallet) {
    for (const m of MAINNET_EPOCH_MANIFESTS) {
      if (m.chainId !== BOT_MAINNET_CHAIN_ID) continue;
      const hit = m.entitlements.find((e) => e.account.toLowerCase() === wallet.toLowerCase());
      if (hit) {
        const { proof, ...leaf } = hit;
        out.set(m.epochId, { manifest: m, leaf, proof });
      }
    }
  }
  for (const d of await discoverEntitlements(wallet)) if (!out.has(d.manifest.epochId)) out.set(d.manifest.epochId, d);
  return [...out.values()].sort((a, b) => a.manifest.epochId - b.manifest.epochId);
}

export interface UseMainnetFlowClaim extends MainnetClaimState {
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useMainnetFlowClaim(wallet: string | null | undefined): UseMainnetFlowClaim {
  const [state, setState] = useState<MainnetClaimState>(IDLE);
  const [loading, setLoading] = useState(false);

  const read = useCallback(async () => {
    const candidates = await allEntitlements(wallet);
    let entitlement: MainnetEntitlementMatch | undefined = candidates[candidates.length - 1];
    if (!entitlement) {
      // A prepared-but-unpublished round is explained, never offered as a claim.
      const draft = findMainnetDraftEntitlement(BOT_MAINNET_CHAIN_ID, wallet);
      setState(
        draft
          ? {
              ...IDLE,
              status: 'NOT_PUBLISHED',
              message: `A ${draftFlowLabel(draft.draft)} FLOW allocation is prepared for this wallet. It becomes claimable once its reward round is published on BOT Mainnet.`,
            }
          : IDLE,
      );
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
      // Offer the oldest published, unclaimed round; when every round is
      // claimed, show the newest. A wallet in several rounds is never stuck.
      if (candidates.length > 1) {
        const count = (await client.readContract({ address: distributor, abi: READ_ABI, functionName: 'epochCount' })) as bigint;
        const published = candidates.filter((c) => BigInt(c.leaf.epochId) <= count);
        const flags = await Promise.all(
          published.map((c) =>
            client.readContract({ address: distributor, abi: READ_ABI, functionName: 'isClaimed', args: [BigInt(c.leaf.epochId), BigInt(c.leaf.index)] }),
          ),
        );
        entitlement = published.find((_, i) => !flags[i]) ?? published[published.length - 1] ?? entitlement;
      }
      const { epochId, index } = entitlement.leaf;

      // A manifest may never be shipped ahead of its publication: an epoch id
      // above the live epochCount means the root is not on chain yet.
      const liveEpochCount = (await client.readContract({
        address: distributor,
        abi: READ_ABI,
        functionName: 'epochCount',
      })) as bigint;
      if (BigInt(epochId) > liveEpochCount) {
        setState({
          ...IDLE,
          status: 'NOT_PUBLISHED',
          entitlement,
          distributor,
          message: 'This reward round has not been published on BOT Mainnet yet. Claiming opens once it is.',
        });
        return;
      }

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
      const explorerTxUrl = entitlement.manifest.publicationTxHash
        ? `${botMainnet.blockExplorers.default.url}/tx/${entitlement.manifest.publicationTxHash}`
        : `${botMainnet.blockExplorers.default.url}/address/${distributor}`;
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
