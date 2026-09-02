import { useEffect, useMemo, useState } from 'react';
import { Coins, ExternalLink, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { encodeFunctionData, formatUnits, parseUnits } from 'viem';

import { SectionHeader, StatusPill, Surface } from '@/components/ui-kit/primitives';
import { botMainnet } from '@/lib/wagmi';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import {
  FLOW_ERC20_ABI,
  MAINNET_FLEXIBLE_PRODUCT_ID,
  P3B_CANARY_EVIDENCE,
  STAKING_VAULT_ABI,
} from '@/lib/staking/mainnetGenesisStaking';
import {
  genesisObligation,
  useMainnetGenesisStake,
} from '@/lib/staking/useMainnetGenesisStake';
import { STAKING_V2_PRODUCTS } from '@/lib/staking/stakingV2Matrix';

/**
 * FlowBridge V30.2B P3B — BOT Mainnet 677 Flexible Genesis staking surface.
 *
 * Presentation only. The Flexible (no-lock) product is the single mainnet path
 * proven end-to-end by the P3B lifecycle canary, so it is the only option that
 * can be submitted here. The locked products stay visibly non-executable —
 * their safety is not inferred from the Flexible canary.
 */

const fmtFlow = (raw: string | null | undefined, frac = 6): string => {
  if (raw == null) return '—';
  try {
    const v = formatUnits(BigInt(raw), 18);
    const n = Number(v);
    return n.toLocaleString('en-US', { maximumFractionDigits: frac });
  } catch {
    return '—';
  }
};

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

export function MainnetGenesisStakeCard() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('1');
  const [busy, setBusy] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stake = useMainnetGenesisStake(wallet);

  useEffect(() => {
    const eth = (globalThis as any).window?.ethereum;
    if (!eth) return;
    eth
      .request({ method: 'eth_accounts' })
      .then((a: string[]) => setWallet(a?.[0] ? a[0].toLowerCase() : null))
      .catch(() => undefined);
  }, []);

  const principal = useMemo(() => {
    try {
      const v = parseUnits(amountInput.trim() || '0', 18);
      return v > 0n ? v : 0n;
    } catch {
      return 0n;
    }
  }, [amountInput]);

  const minPrincipal = stake.minPrincipal ? BigInt(stake.minPrincipal) : null;
  const balance = stake.balance ? BigInt(stake.balance) : null;
  const allowance = stake.allowance ? BigInt(stake.allowance) : null;
  const genesisSecs = stake.genesisSecondsRemaining ?? 0;
  const projectedGenesis = genesisObligation(principal, stake.genesisAprBps, genesisSecs);

  const amountProblem =
    principal === 0n
      ? 'Enter an amount of FLOW to stake.'
      : minPrincipal != null && principal < minPrincipal
        ? `Minimum stake is ${fmtFlow(stake.minPrincipal)} FLOW.`
        : balance != null && principal > balance
          ? `Your wallet holds ${fmtFlow(stake.balance)} FLOW.`
          : wallet && genesisSecs === 0
            ? 'This wallet has already used its lifetime Genesis reward window.'
            : null;

  const needsApproval = allowance != null && allowance < principal;
  const canSubmit = stake.executable && !amountProblem && !busy;

  const send = async (kind: 'approve' | 'open' | 'claim' | 'withdraw', positionId?: string) => {
    setError(null);
    setBusy(kind + (positionId ?? ''));
    try {
      const eth = (globalThis as any).window?.ethereum;
      if (!eth) throw new Error('No wallet detected in this browser.');
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      const from = (accounts?.[0] ?? '').toLowerCase();
      setWallet(from || null);
      const hexChain = `0x${BOT_MAINNET_CHAIN_ID.toString(16)}`;
      if ((await eth.request({ method: 'eth_chainId' })) !== hexChain) {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChain }] });
      }
      if (!stake.vault || !stake.token) throw new Error('Canonical staking addresses unavailable.');

      let to = stake.vault;
      let data: `0x${string}`;
      if (kind === 'approve') {
        to = stake.token;
        // Exact allowance only — never unlimited.
        data = encodeFunctionData({
          abi: FLOW_ERC20_ABI,
          functionName: 'approve',
          args: [stake.vault, principal],
        });
      } else if (kind === 'open') {
        data = encodeFunctionData({
          abi: STAKING_VAULT_ABI,
          functionName: 'openPosition',
          args: [MAINNET_FLEXIBLE_PRODUCT_ID, principal],
        });
      } else {
        data = encodeFunctionData({
          abi: STAKING_VAULT_ABI,
          functionName: kind === 'claim' ? 'claim' : 'withdraw',
          args: [BigInt(positionId!)],
        });
      }

      const hash: string = await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from, to, data, value: '0x0' }],
      });
      setTxHash(hash);
      await stake.refresh();
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Transaction failed.');
    } finally {
      setBusy(null);
    }
  };

  const connect = () => void send('approve').catch(() => undefined);

  return (
    <Surface id="mainnet-flow-staking">
      <SectionHeader
        title="Stake FLOW on BOT Mainnet — Flexible Genesis"
        hint="No lock, exit anytime. Every gate — vault pause, product terms, Genesis capacity and reward funding — is read live from the canonical contracts before the button unlocks."
        badge={
          <StatusPill tone={stake.executable ? 'ok' : 'warn'}>
            {stake.executable ? 'Live' : 'Blocked'}
          </StatusPill>
        }
      />

      <div className="space-y-3 border-t border-hairline p-4">
        <dl className="grid grid-cols-2 gap-3 text-[12px]">
          <Row label="Network" value={`BOT Mainnet · ${BOT_MAINNET_CHAIN_ID}`} />
          <Row label="Wallet" value={short(wallet)} />
          <Row
            label="Genesis APR"
            value={stake.genesisAprBps ? `${(stake.genesisAprBps / 100).toFixed(1)}%` : '—'}
          />
          <Row label="Lock" value="None — withdraw anytime" />
          <Row label="Your FLOW" value={fmtFlow(stake.balance, 4)} />
          <Row label="Minimum stake" value={`${fmtFlow(stake.minPrincipal, 2)} FLOW`} />
          <Row
            label="Genesis days left (wallet)"
            value={
              stake.genesisSecondsRemaining == null
                ? '—'
                : `${Math.floor(stake.genesisSecondsRemaining / 86_400)}d`
            }
          />
          <Row label="Reward inventory free" value={`${fmtFlow(stake.treasuryFree, 2)} FLOW`} />
        </dl>

        <label className="block">
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-muted-soft">
            Amount to stake (FLOW)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="mt-1 w-full rounded-lg border border-hairline bg-card px-3 py-2 text-[14px] font-bold outline-none focus:border-primary"
          />
        </label>

        <p className="text-[12px] leading-relaxed text-muted">
          {stake.loading
            ? 'Reading live staking state from BOT Mainnet…'
            : (stake.blockedReason ??
              amountProblem ??
              (projectedGenesis > 0n
                ? `Estimated Genesis reward reserved for this position: ${fmtFlow(
                    projectedGenesis.toString(),
                  )} FLOW over the remaining ${Math.floor(
                    genesisSecs / 86_400,
                  )} Genesis days. APR, never compounded.`
                : 'Enter an amount to see the Genesis reward that will be reserved for your position.'))}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void (wallet ? stake.refresh() : connect())}
            disabled={busy != null || stake.loading}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-hairline bg-card px-4 text-[13px] font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-45"
          >
            {stake.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            {wallet ? 'Re-check live state' : 'Connect wallet'}
          </button>

          {needsApproval ? (
            <button
              type="button"
              onClick={() => void send('approve')}
              disabled={!canSubmit}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground transition-opacity disabled:opacity-45"
            >
              {busy === 'approve' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Lock className="h-4 w-4" aria-hidden />
              )}
              Approve exactly {amountInput || '0'} FLOW
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send('open')}
              disabled={!canSubmit}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground transition-opacity disabled:opacity-45"
            >
              {busy === 'open' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Coins className="h-4 w-4" aria-hidden />
              )}
              Stake {amountInput || '0'} FLOW
            </button>
          )}
        </div>

        {txHash ? (
          <a
            href={`${botMainnet.blockExplorers.default.url}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary"
          >
            View transaction <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}

        {error ? <p className="text-[12px] leading-relaxed text-destructive">{error}</p> : null}
      </div>

      {stake.positions.length > 0 ? (
        <div className="space-y-2 border-t border-hairline p-4">
          <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-muted-soft">
            Your positions
          </h3>
          {stake.positions.map((p) => (
            <div
              key={p.positionId}
              className="rounded-xl border border-hairline bg-card/60 px-3 py-2 text-[12px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  #{p.positionId} · {fmtFlow(p.principal, 4)} FLOW ·{' '}
                  {p.open ? 'Open' : 'Closed'}
                </span>
                <span className="text-muted">
                  Claimable {fmtFlow(p.pending)} FLOW
                </span>
              </div>
              {p.open ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void send('claim', p.positionId)}
                    disabled={busy != null || BigInt(p.pending) === 0n}
                    className="min-h-[38px] flex-1 rounded-xl border border-hairline bg-card text-[12px] font-bold disabled:opacity-45"
                  >
                    Claim reward
                  </button>
                  <button
                    type="button"
                    onClick={() => void send('withdraw', p.positionId)}
                    disabled={busy != null}
                    className="min-h-[38px] flex-1 rounded-xl border border-hairline bg-card text-[12px] font-bold disabled:opacity-45"
                  >
                    Withdraw principal
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <p className="text-[11px] leading-relaxed text-muted-soft">
            Claiming only moves earned rewards and never touches principal. Withdrawing returns your
            principal exactly and releases any unvested Genesis reservation back to the reward
            reserve.
          </p>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-hairline p-4 text-[11px] leading-relaxed text-muted">
        <p>
          <strong className="text-foreground">Locked products stay unavailable.</strong> 30D / 90D /
          180D / 365D are shown for reference only and cannot be submitted on mainnet — only the
          Flexible path has been proven end-to-end on chain {BOT_MAINNET_CHAIN_ID}.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STAKING_V2_PRODUCTS.filter((p) => p.lockSeconds > 0).map((p) => (
            <div key={p.id} className="rounded-xl border border-hairline bg-card/60 px-3 py-2">
              <div className="text-[12px] font-black">{p.label}</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-soft">
                Not executable
              </div>
            </div>
          ))}
        </div>
        <p>
          Rewards are paid only from the pre-funded, segregated reward reserve — nothing is minted,
          and principal is never classified as reward inventory. Proven live lifecycle:{' '}
          <a
            href={`${botMainnet.blockExplorers.default.url}/tx/${P3B_CANARY_EVIDENCE.withdrawTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-primary"
          >
            P3B canary
          </a>
          .
        </p>
      </div>
    </Surface>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-card/60 px-3 py-2">
      <dt className="text-[10.5px] font-bold uppercase tracking-wide text-muted-soft">{label}</dt>
      <dd className="mt-0.5 font-mono text-[12px] font-bold text-foreground">{value}</dd>
    </div>
  );
}
