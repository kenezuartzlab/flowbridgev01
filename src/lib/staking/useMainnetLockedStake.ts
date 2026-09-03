/**
 * FlowBridge V30.2B P3D — live BOT Mainnet 677 locked-product staking state.
 *
 * Reads pause, emergency mode, live product terms, Year-1 Genesis/standard
 * capacity, funded reward inventory, the wallet's FLOW balance and allowance,
 * and — the authority for every number shown — the deployed `quoteOpen()` for
 * this wallet, this product and this exact principal. Any read failure blocks
 * execution.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, http, type Hex } from 'viem';

import { botMainnet } from '@/lib/wagmi';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import { resolveCanonicalAddress } from '@/lib/deploy/v302bCanonicalRegistry';
import {
  FLOW_ERC20_ABI,
  STAKING_CONTROLLER_PRODUCT_ABI,
  STAKING_TREASURY_ABI,
  STAKING_VAULT_ABI,
  mainnetStakingAddresses,
} from './mainnetGenesisStaking';
import {
  LOCKED_UNAVAILABLE_COPY,
  evaluateLockedExecution,
  isLockedStakingActivated,
  type LiveLockedQuote,
  type LockedExecutionEvaluation,
  type LockedProductId,
} from './mainnetLockedStaking';

export const VAULT_QUOTE_ABI = [
  {
    type: 'function',
    name: 'quoteOpen',
    stateMutability: 'view',
    inputs: [
      { name: 'productId', type: 'uint8' },
      { name: 'owner', type: 'address' },
      { name: 'principal', type: 'uint256' },
    ],
    outputs: [
      { name: 'genesisRateBps', type: 'uint16' },
      { name: 'genesisSeconds', type: 'uint40' },
      { name: 'genesisObligation', type: 'uint256' },
      { name: 'floorRateBps', type: 'uint16' },
      { name: 'floorObligation', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'genesisQuotaRemainingSeconds',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export interface MainnetLockedPosition {
  positionId: string;
  productId: number;
  open: boolean;
  principal: string;
  maturityAt: number;
  genesisEndAt: number;
  pending: string;
}

export interface MainnetLockedStakeState {
  loading: boolean;
  unavailable: string | null;
  token: Hex | null;
  vault: Hex | null;
  quote: LiveLockedQuote | null;
  evaluation: LockedExecutionEvaluation | null;
  minPrincipal: string | null;
  balance: string | null;
  allowance: string | null;
  genesisSecondsRemaining: number | null;
  treasuryFree: string | null;
  oracle: string | null;
  positions: readonly MainnetLockedPosition[];
  refresh: () => Promise<void>;
}

const EMPTY: Omit<MainnetLockedStakeState, 'refresh'> = {
  loading: false,
  unavailable: null,
  token: null,
  vault: null,
  quote: null,
  evaluation: null,
  minPrincipal: null,
  balance: null,
  allowance: null,
  genesisSecondsRemaining: null,
  treasuryFree: null,
  oracle: null,
  positions: [],
};

export function useMainnetLockedStake(
  wallet: string | null,
  productId: LockedProductId,
  principal: bigint,
) {
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    if (!isLockedStakingActivated()) {
      setState({ ...EMPTY, unavailable: 'Locked staking is not activated on BOT Mainnet.' });
      return;
    }
    const { token, vault, treasury } = mainnetStakingAddresses();
    const controller = resolveCanonicalAddress(BOT_MAINNET_CHAIN_ID, 'FlowStakingController');
    if (!token || !vault || !treasury || !controller) {
      setState({ ...EMPTY, unavailable: 'Canonical mainnet staking addresses are unavailable.' });
      return;
    }

    setState((s) => ({ ...s, loading: true, unavailable: null }));
    try {
      const client = createPublicClient({ chain: botMainnet, transport: http() });
      const read = (address: Hex, abi: unknown, functionName: string, args: unknown[] = []) =>
        client.readContract({ address, abi, functionName, args } as never);

      const [block, paused, emergency, product, genesisUsed, genesisCap, stdUsed, stdCap, treasuryFree, oracle] =
        await Promise.all([
          client.getBlock(),
          read(vault, STAKING_VAULT_ABI, 'paused') as Promise<boolean>,
          read(controller, STAKING_CONTROLLER_PRODUCT_ABI, 'emergencyMode') as Promise<boolean>,
          read(controller, STAKING_CONTROLLER_PRODUCT_ABI, 'products', [
            BigInt(productId),
          ]) as Promise<readonly [boolean, number, number, number, number, number, bigint]>,
          read(controller, STAKING_CONTROLLER_PRODUCT_ABI, 'genesisYear1Used') as Promise<bigint>,
          read(controller, STAKING_CONTROLLER_PRODUCT_ABI, 'GENESIS_YEAR1_CAP') as Promise<bigint>,
          read(controller, STAKING_CONTROLLER_PRODUCT_ABI, 'standardYear1Used') as Promise<bigint>,
          read(controller, STAKING_CONTROLLER_PRODUCT_ABI, 'STANDARD_YEAR1_CAP') as Promise<bigint>,
          read(treasury, STAKING_TREASURY_ABI, 'freeBalance') as Promise<bigint>,
          read(controller, STAKING_CONTROLLER_PRODUCT_ABI, 'oracle') as Promise<string>,
        ]);

      const [active, lockSeconds, , , , , minPrincipal] = product;

      let balance = 0n;
      let allowance = 0n;
      let genesisSecondsRemaining: number | null = null;
      let quote: LiveLockedQuote | null = null;
      const positions: MainnetLockedPosition[] = [];

      if (wallet) {
        const w = wallet as Hex;
        const [bal, allo, quotaRemaining, count] = await Promise.all([
          read(token, FLOW_ERC20_ABI, 'balanceOf', [w]) as Promise<bigint>,
          read(token, FLOW_ERC20_ABI, 'allowance', [w, vault]) as Promise<bigint>,
          read(vault, VAULT_QUOTE_ABI, 'genesisQuotaRemainingSeconds', [w]) as Promise<bigint>,
          read(vault, STAKING_VAULT_ABI, 'positionCountOf', [w]) as Promise<bigint>,
        ]);
        balance = bal;
        allowance = allo;
        genesisSecondsRemaining = Number(quotaRemaining);

        if (principal > 0n) {
          const q = (await read(vault, VAULT_QUOTE_ABI, 'quoteOpen', [
            productId,
            w,
            principal,
          ])) as readonly [number, bigint, bigint, number, bigint];
          quote = {
            productId,
            principalWei: principal,
            lockSeconds: Number(lockSeconds),
            genesisRateBps: Number(q[0]),
            genesisSeconds: Number(q[1]),
            genesisReservedWei: q[2],
            floorRateBps: Number(q[3]),
            floorReservedWei: q[4],
            quotedAt: Number(block.timestamp),
          };
        }

        const n = Number(count);
        for (let i = Math.max(0, n - 10); i < n; i++) {
          const id = (await read(vault, STAKING_VAULT_ABI, 'positionsOf', [w, BigInt(i)])) as bigint;
          const p = (await read(vault, STAKING_VAULT_ABI, 'getPosition', [id])) as {
            productId: number;
            status: bigint;
            principal: bigint;
            maturityAt: number;
            genesisEndAt: number;
          };
          if (Number(p.productId) === 0) continue;
          const pending = (await read(vault, STAKING_VAULT_ABI, 'previewPending', [id])) as bigint;
          positions.push({
            positionId: id.toString(),
            productId: Number(p.productId),
            open: Number(p.status) === 0,
            principal: p.principal.toString(),
            maturityAt: Number(p.maturityAt),
            genesisEndAt: Number(p.genesisEndAt),
            pending: pending.toString(),
          });
        }
      }

      const evaluation = quote
        ? evaluateLockedExecution(quote, {
            chainId: BOT_MAINNET_CHAIN_ID,
            vaultPaused: paused,
            emergencyMode: emergency,
            productActive: active,
            oracle,
            minPrincipalWei: minPrincipal,
            walletBalanceWei: balance,
            allowanceWei: allowance,
            treasuryFreeWei: treasuryFree,
            genesisYear1RemainingWei: genesisCap > genesisUsed ? genesisCap - genesisUsed : 0n,
            standardYear1RemainingWei: stdCap > stdUsed ? stdCap - stdUsed : 0n,
          })
        : null;

      setState({
        loading: false,
        unavailable: null,
        token,
        vault,
        quote,
        evaluation,
        minPrincipal: minPrincipal.toString(),
        balance: wallet ? balance.toString() : null,
        allowance: wallet ? allowance.toString() : null,
        genesisSecondsRemaining,
        treasuryFree: treasuryFree.toString(),
        oracle,
        positions,
      });
    } catch {
      setState({ ...EMPTY, unavailable: LOCKED_UNAVAILABLE_COPY });
    }
  }, [wallet, productId, principal]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load } as MainnetLockedStakeState;
}
