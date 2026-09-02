/**
 * FlowBridge V30.2B P3B — live BOT Mainnet 677 Flexible Genesis staking state.
 *
 * Every gate is read from the canonical contracts immediately before a stake,
 * claim or withdrawal can be offered: vault pause, controller emergency mode,
 * live product terms (active / lockSeconds / minPrincipal / Genesis APR),
 * remaining Year-1 Genesis capacity, reward-treasury free inventory, the
 * wallet's FLOW balance and allowance, and the wallet's own open positions.
 *
 * Fail-closed: any read failure, inactive product, non-flexible lock, missing
 * funding or closed feature gate blocks execution. Nothing is ever assumed.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, http, type Hex } from 'viem';

import { botMainnet } from '@/lib/wagmi';
import {
  FLOW_ERC20_ABI,
  MAINNET_FLEXIBLE_PRODUCT_ID,
  STAKING_CONTROLLER_PRODUCT_ABI,
  STAKING_TREASURY_ABI,
  STAKING_VAULT_ABI,
  isMainnetStakingProductExecutable,
  mainnetStakingAddresses,
} from './mainnetGenesisStaking';
import { resolveCanonicalAddress } from '@/lib/deploy/v302bCanonicalRegistry';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';

const CONTROLLER_ABI = STAKING_CONTROLLER_PRODUCT_ABI;
const YEAR = 31_536_000n;
const BPS = 10_000n;

export interface MainnetStakePosition {
  positionId: string;
  productId: number;
  open: boolean;
  principal: string;
  genesisRateBps: number;
  genesisEndAt: number;
  pending: string;
}

export interface MainnetGenesisStakeState {
  loading: boolean;
  /** True only when a Flexible Genesis stake may actually be submitted. */
  executable: boolean;
  blockedReason: string | null;
  token: Hex | null;
  vault: Hex | null;
  productActive: boolean;
  lockSeconds: number;
  genesisAprBps: number;
  minPrincipal: string | null;
  genesisCapacityRemaining: string | null;
  treasuryFree: string | null;
  genesisSecondsRemaining: number | null;
  balance: string | null;
  allowance: string | null;
  positions: readonly MainnetStakePosition[];
  refresh: () => Promise<void>;
}

const EMPTY: Omit<MainnetGenesisStakeState, 'refresh'> = {
  loading: false,
  executable: false,
  blockedReason: 'Connect a wallet on BOT Mainnet to read live staking state.',
  token: null,
  vault: null,
  productActive: false,
  lockSeconds: 0,
  genesisAprBps: 0,
  minPrincipal: null,
  genesisCapacityRemaining: null,
  treasuryFree: null,
  genesisSecondsRemaining: null,
  balance: null,
  allowance: null,
  positions: [],
};

/** Genesis obligation for a principal over the whole remaining Genesis window. */
export function genesisObligation(
  principal: bigint,
  aprBps: number,
  seconds: number,
): bigint {
  if (principal <= 0n || aprBps <= 0 || seconds <= 0) return 0n;
  return (principal * BigInt(aprBps) * BigInt(seconds)) / (BPS * YEAR);
}

export function useMainnetGenesisStake(wallet: string | null) {
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    const { token, vault, treasury } = mainnetStakingAddresses();
    const controller = resolveCanonicalAddress(BOT_MAINNET_CHAIN_ID, 'FlowStakingController');

    if (!isMainnetStakingProductExecutable(MAINNET_FLEXIBLE_PRODUCT_ID)) {
      setState({
        ...EMPTY,
        blockedReason: 'Flexible Genesis staking is not activated on BOT Mainnet.',
      });
      return;
    }
    if (!token || !vault || !treasury || !controller) {
      setState({ ...EMPTY, blockedReason: 'Canonical mainnet staking addresses are unavailable.' });
      return;
    }

    setState((s) => ({ ...s, loading: true }));
    try {
      const client = createPublicClient({ chain: botMainnet, transport: http() });
      const read = (address: Hex, abi: any, functionName: string, args: unknown[] = []) =>
        client.readContract({ address, abi, functionName, args } as any);

      const [paused, emergency, product, genesisUsed, genesisCap, treasuryFree] = await Promise.all([
        read(vault, STAKING_VAULT_ABI, 'paused') as Promise<boolean>,
        read(controller, CONTROLLER_ABI, 'emergencyMode') as Promise<boolean>,
        read(controller, CONTROLLER_ABI, 'products', [
          BigInt(MAINNET_FLEXIBLE_PRODUCT_ID),
        ]) as Promise<readonly [boolean, number, number, number, number, number, bigint]>,
        read(controller, CONTROLLER_ABI, 'genesisYear1Used') as Promise<bigint>,
        read(controller, CONTROLLER_ABI, 'GENESIS_YEAR1_CAP') as Promise<bigint>,
        read(treasury, STAKING_TREASURY_ABI, 'freeBalance') as Promise<bigint>,
      ]);

      const [active, lockSeconds, genesisAprBps, , , , minPrincipal] = product;

      let balance: bigint | null = null;
      let allowance: bigint | null = null;
      let genesisSecondsRemaining: number | null = null;
      const positions: MainnetStakePosition[] = [];

      if (wallet) {
        const w = wallet as Hex;
        const [bal, allo, consumed, count] = await Promise.all([
          read(token, FLOW_ERC20_ABI, 'balanceOf', [w]) as Promise<bigint>,
          read(token, FLOW_ERC20_ABI, 'allowance', [w, vault]) as Promise<bigint>,
          read(vault, [
            {
              type: 'function',
              name: 'genesisSecondsConsumed',
              stateMutability: 'view',
              inputs: [{ type: 'address' }],
              outputs: [{ type: 'uint256' }],
            },
          ] as any, 'genesisSecondsConsumed', [w]) as Promise<bigint>,
          read(vault, STAKING_VAULT_ABI, 'positionCountOf', [w]) as Promise<bigint>,
        ]);
        balance = bal;
        allowance = allo;
        genesisSecondsRemaining = Math.max(0, 7_776_000 - Number(consumed));

        const n = Number(count);
        for (let i = Math.max(0, n - 10); i < n; i++) {
          const id = (await read(vault, STAKING_VAULT_ABI, 'positionsOf', [w, BigInt(i)])) as bigint;
          const p = (await read(vault, STAKING_VAULT_ABI, 'getPosition', [id])) as any;
          const pending = (await read(vault, STAKING_VAULT_ABI, 'previewPending', [id])) as bigint;
          positions.push({
            positionId: id.toString(),
            productId: Number(p.productId),
            open: Number(p.status) === 0,
            principal: p.principal.toString(),
            genesisRateBps: Number(p.genesisRateBps),
            genesisEndAt: Number(p.genesisEndAt),
            pending: pending.toString(),
          });
        }
      }

      const capacityRemaining = genesisCap > genesisUsed ? genesisCap - genesisUsed : 0n;

      let blockedReason: string | null = null;
      if (paused) blockedReason = 'The staking vault is paused on chain — new positions are blocked.';
      else if (emergency) blockedReason = 'The staking controller is in emergency mode.';
      else if (!active) blockedReason = 'The Flexible product is not active on chain.';
      else if (Number(lockSeconds) !== 0)
        blockedReason = 'On-chain product 0 is no longer lock-free; execution is blocked.';
      else if (capacityRemaining === 0n) blockedReason = 'Year-1 Genesis capacity is fully used.';
      else if (treasuryFree === 0n)
        blockedReason = 'The reward treasury has no free inventory to reserve rewards from.';
      else if (!wallet) blockedReason = 'Connect a wallet to stake FLOW.';

      setState({
        loading: false,
        executable: blockedReason === null,
        blockedReason,
        token,
        vault,
        productActive: active,
        lockSeconds: Number(lockSeconds),
        genesisAprBps: Number(genesisAprBps),
        minPrincipal: minPrincipal.toString(),
        genesisCapacityRemaining: capacityRemaining.toString(),
        treasuryFree: treasuryFree.toString(),
        genesisSecondsRemaining,
        balance: balance == null ? null : balance.toString(),
        allowance: allowance == null ? null : allowance.toString(),
        positions,
      });
    } catch {
      setState({
        ...EMPTY,
        blockedReason: 'Live BOT Mainnet staking state could not be read. Staking stays blocked.',
      });
    }
  }, [wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load } as MainnetGenesisStakeState;
}
