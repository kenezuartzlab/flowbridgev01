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
import { LAST_HISTORICAL_EPOCH, PUBLIC_MAINNET_FLOW_CLAIMS } from './publicClaimPolicy';
import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, http, type Hex } from 'viem';

import { botMainnet } from '@/lib/wagmi';
import { BOT_MAINNET_CHAIN_ID, getFlowRewardsChainConfig } from './flowRewardsRegistry';
import {
  MERKLE_DISTRIBUTOR_CLAIM_ABI,

  type MerkleClaimPreparation,

} from './merkleClaim';
import { MAINNET_EPOCH_MANIFESTS, type MainnetEntitlementMatch } from './mainnetEpochManifest';
import { draftFlowLabel, findMainnetDraftEntitlement } from './mainnetEpochDraft';
import { evaluateRound, summarizeRounds, type EpochRead, type RoundView, type RoundsSummary } from './mainnetClaimRounds';

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
async function discoverEntitlements(wallet: string | null | undefined): Promise<MainnetEntitlementMatch[] | null> {
  if (!wallet || typeof fetch === 'undefined') return [];
  try {
    const res = await fetch(`/api/public/reward-rounds?wallet=${encodeURIComponent(wallet.toLowerCase())}`);
    if (!res.ok) return null;
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
    return null;
  }
}

/** Every round (frozen manifest + discovered) containing the wallet, oldest first, one per epoch. */
async function allEntitlements(wallet: string | null | undefined): Promise<{ list: MainnetEntitlementMatch[]; discoveryFailed: boolean }> {
  const out = new Map<number, MainnetEntitlementMatch>();
  // Automatic discovery (indexed + on-chain historical) is primary.
  const discovered = await discoverEntitlements(wallet);
  for (const d of discovered ?? []) out.set(d.manifest.epochId, d);
  // Built-in manifest: temporary compatibility fallback only, for epochs discovery did not return.
  if (wallet) {
    for (const m of MAINNET_EPOCH_MANIFESTS) {
      if (m.chainId !== BOT_MAINNET_CHAIN_ID) continue;
      const hit = m.entitlements.find((e) => e.account.toLowerCase() === wallet.toLowerCase());
      if (hit && !out.has(m.epochId)) {
        const { proof, ...leaf } = hit;
        out.set(m.epochId, { manifest: m, leaf, proof });
      }
    }
  }
  return { list: [...out.values()].sort((a, b) => a.manifest.epochId - b.manifest.epochId), discoveryFailed: discovered === null };
}

export interface UseMainnetFlowClaim extends MainnetClaimState {
  loading: boolean;
  /** Every round this wallet appears in, evaluated independently. */
  rounds: RoundsSummary;
  refresh: () => Promise<void>;
}

const EMPTY_ROUNDS: RoundsSummary = { active: [], history: [], claimable: [], totalClaimableWei: '0' };

export function useMainnetFlowClaim(wallet: string | null | undefined): UseMainnetFlowClaim {
  const [state, setState] = useState<MainnetClaimState>(IDLE);
  const [rounds, setRounds] = useState<RoundsSummary>(EMPTY_ROUNDS);
  const [loading, setLoading] = useState(false);

  const read = useCallback(async () => {
    setLoading(true);
    try {
      const { list: candidates, discoveryFailed } = await allEntitlements(wallet);
      if (!candidates.length) {
        setRounds(EMPTY_ROUNDS);
        if (discoveryFailed && wallet) {
          setState({ ...IDLE, status: 'READ_FAILED', message: 'Claim data unavailable — retry.' });
          return;
        }
        const draft = findMainnetDraftEntitlement(BOT_MAINNET_CHAIN_ID, wallet);
        setState(
          draft
            ? { ...IDLE, status: 'NOT_PUBLISHED', message: `A ${draftFlowLabel(draft.draft)} FLOW allocation is prepared for this wallet. It becomes claimable once its reward round is published on BOT Mainnet.` }
            : IDLE,
        );
        return;
      }
      const config = getFlowRewardsChainConfig(BOT_MAINNET_CHAIN_ID);
      const distributor = (config?.distributor ?? null) as Hex | null;
      const token = (config?.token ?? null) as Hex | null;
      if (!distributor || !token) {
        setRounds(EMPTY_ROUNDS);
        setState({ ...IDLE, status: 'READ_FAILED', message: 'The mainnet reward distributor could not be resolved.' });
        return;
      }
      const client = createPublicClient({ chain: botMainnet, transport: http() });
      const [epochCount, paused, totalReserved, balance] = (await Promise.all([
        client.readContract({ address: distributor, abi: READ_ABI, functionName: 'epochCount' }),
        client.readContract({ address: distributor, abi: READ_ABI, functionName: 'paused' }),
        client.readContract({ address: distributor, abi: READ_ABI, functionName: 'totalReserved' }),
        client.readContract({ address: token, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [distributor] }),
      ])) as [bigint, boolean, bigint, bigint];
      const nowSeconds = Math.floor(Date.now() / 1000);
      const views = await Promise.all(
        candidates.map(async (c): Promise<RoundView> => {
          let r: EpochRead | null = null;
          if (BigInt(c.leaf.epochId) <= epochCount) {
            try {
              const [e, claimed] = await Promise.all([
                client.readContract({ address: distributor, abi: READ_ABI, functionName: 'getEpoch', args: [BigInt(c.leaf.epochId)] }),
                client.readContract({ address: distributor, abi: READ_ABI, functionName: 'isClaimed', args: [BigInt(c.leaf.epochId), BigInt(c.leaf.index)] }),
              ]);
              r = { root: e.root as Hex, claimStart: Number(e.claimStart), claimEnd: Number(e.claimEnd), cancelled: e.cancelled, released: e.released, claimed: Boolean(claimed) };
            } catch {
              r = null;
            }
          }
          return evaluateRound({
            chainId: BOT_MAINNET_CHAIN_ID, distributor, entitlement: c, epochCount, paused, read: r,
            distributorBalance: balance.toString(), totalReserved: totalReserved.toString(), nowSeconds,
            publicClaimsOpen: PUBLIC_MAINNET_FLOW_CLAIMS, lastHistoricalEpoch: LAST_HISTORICAL_EPOCH,
          });
        }),
      );
      const summary = summarizeRounds(views);
      setRounds(summary);
      const first = summary.active[0] ?? summary.history[0];
      const ent = candidates.find((c) => c.leaf.epochId === first?.epochId) ?? null;
      const status: MainnetClaimStatus =
        first?.status === 'CLAIMABLE' ? 'CLAIMABLE'
        : first?.status === 'CLAIMED' ? 'ALREADY_CLAIMED'
        : first?.status === 'PAUSED' ? 'PAUSED'
        : first?.status === 'ROOT_MISMATCH' ? 'ROOT_MISMATCH'
        : first?.status === 'READ_FAILED' ? 'READ_FAILED'
        : first?.status === 'NOT_PUBLISHED' ? 'NOT_PUBLISHED'
        : 'BLOCKED';
      setState({
        status,
        message: first?.message ?? '',
        preparation: summary.claimable[0] ?? null,
        entitlement: ent,
        epoch: null,
        alreadyClaimed: first?.status === 'CLAIMED',
        distributor,
        explorerTxUrl: `${botMainnet.blockExplorers.default.url}/address/${distributor}`,
      });
    } catch {
      setRounds(EMPTY_ROUNDS);
      setState({ ...IDLE, status: 'READ_FAILED', message: 'Live reward state could not be read from BOT Mainnet. Claiming stays disabled until it can.' });
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void read();
  }, [read]);

  return { ...state, rounds, loading, refresh: read };
}
