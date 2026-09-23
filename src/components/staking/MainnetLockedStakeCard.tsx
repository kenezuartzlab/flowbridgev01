import { useEffect, useMemo, useState } from 'react';
import { Coins, ExternalLink, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { encodeFunctionData, formatUnits, parseUnits } from 'viem';

import { SectionHeader, StatusPill, Surface } from '@/components/ui-kit/primitives';
import { botMainnet } from '@/lib/wagmi';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import { FLOW_ERC20_ABI, STAKING_VAULT_ABI } from '@/lib/staking/mainnetGenesisStaking';
import {
  LOCKED_PRODUCT_IDS,
  LOCKED_PRODUCT_LABELS,
  isLockedQuoteStale,
  isLockedStakingActivated,
  lockedPhaseCopy,
  type LiveLockedQuote,
  type LockedProductId,
} from '@/lib/staking/mainnetLockedStaking';
import { useMainnetLockedStake } from '@/lib/staking/useMainnetLockedStake';

/**
 * FlowBridge V30.2B P3D — BOT Mainnet 677 locked Genesis staking surface.
 *
 * Presentation only. Every rate, duration and reserved obligation shown comes
 * from the live deployed `quoteOpen()` for the connected wallet; approval and
 * open are always two separate wallet confirmations, the approval is exact, and
 * nothing is ever auto-submitted. A quote that drifts before signing blocks the
 * transaction instead of silently changing the economics.
 */

const fmtFlow = (raw: string | bigint | null | undefined, frac = 6): string => {
  if (raw == null) return '—';
  try {
    const n = Number(formatUnits(BigInt(raw), 18));
    return n.toLocaleString('en-US', { maximumFractionDigits: frac });
  } catch {
    return '—';
  }
};

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const dateOf = (ts: number) =>
  ts > 0 ? new Date(ts * 1000).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—';

export function MainnetLockedStakeCard() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [productId, setProductId] = useState<LockedProductId>(1);
  const [amountInput, setAmountInput] = useState('1');
  const [busy, setBusy] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * P4A.2.1 — the exact economic snapshot the user reviewed. Approval and open
   * are only offered after an explicit review, and the snapshot is compared
   * against a genuinely fresh on-chain quote immediately before signing.
   */
  const [reviewed, setReviewed] = useState<LiveLockedQuote | null>(null);


  const principal = useMemo(() => {
    try {
      const v = parseUnits(amountInput.trim() || '0', 18);
      return v > 0n ? v : 0n;
    } catch {
      return 0n;
    }
  }, [amountInput]);

  const stake = useMainnetLockedStake(wallet, productId, principal);

  useEffect(() => {
    const eth = (globalThis as { window?: { ethereum?: { request: (a: unknown) => Promise<unknown> } } })
      .window?.ethereum;
    if (!eth) return;
    void (eth.request({ method: 'eth_accounts' }) as Promise<string[]>)
      .then((a) => setWallet(a?.[0] ? a[0].toLowerCase() : null))
      .catch(() => undefined);
  }, []);

  // Changing product or amount voids any previously reviewed terms.
  useEffect(() => {
    setReviewed(null);
  }, [productId, principal, wallet]);

  if (!isLockedStakingActivated()) return null;

  const quote = stake.quote;
  const evaluation = stake.evaluation;
  const copy = quote ? lockedPhaseCopy(quote) : null;
  const executable = evaluation?.decision === 'EXECUTABLE' && !stake.loading && busy == null;

  /** Wallet connection ONLY — never an approval, stake, claim or swap. */
  const connectOnly = async () => {
    setError(null);
    setBusy('connect');
    try {
      const eth = (globalThis as { window?: { ethereum?: { request: (a: unknown) => Promise<unknown> } } })
        .window?.ethereum;
      if (!eth) throw new Error('No wallet detected in this browser.');
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      setWallet(accounts?.[0] ? accounts[0].toLowerCase() : null);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? 'Wallet connection failed.');
    } finally {
      setBusy(null);
    }
  };

  const send = async (kind: 'approve' | 'open' | 'claim' | 'withdraw', positionId?: string) => {
    setError(null);
    setBusy(kind + (positionId ?? ''));
    try {
      const eth = (globalThis as { window?: { ethereum?: { request: (a: unknown) => Promise<unknown> } } })
        .window?.ethereum;
      if (!eth) throw new Error('No wallet detected in this browser.');
      // The wallet must already be connected: no economic action ever triggers
      // the connection request itself.
      const from = (wallet ?? '').toLowerCase();
      if (!from) throw new Error('Connect your wallet first — nothing was submitted.');
      const hexChain = `0x${BOT_MAINNET_CHAIN_ID.toString(16)}`;
      if ((await eth.request({ method: 'eth_chainId' })) !== hexChain) {
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hexChain }],
        });
      }
      if (!stake.vault || !stake.token) throw new Error('Canonical staking addresses unavailable.');

      let to = stake.vault;
      let data: `0x${string}`;
      if (kind === 'approve') {
        // Approval is only ever offered after the user reviewed the live terms.
        if (!reviewed) throw new Error('Review the live terms first — nothing was submitted.');
        to = stake.token;
        // Exact allowance only, never unlimited.
        data = encodeFunctionData({
          abi: FLOW_ERC20_ABI,
          functionName: 'approve',
          args: [stake.vault, reviewed.principalWei],
        });
      } else if (kind === 'open') {
        if (!reviewed) throw new Error('Review the live terms first — nothing was submitted.');
        // Terms-change guard: compare the REVIEWED snapshot against a genuinely
        // fresh on-chain quote (a separate read, never the same object).
        const fresh = await stake.fetchFreshQuote();
        if (!fresh) {
          throw new Error('Live terms could not be re-read from BOT Mainnet — nothing was submitted.');
        }
        if (isLockedQuoteStale(reviewed, fresh)) {
          setReviewed(null);
          await stake.refresh();
          throw new Error('Live terms changed since they were shown. Review the refreshed terms and retry.');
        }
        data = encodeFunctionData({
          abi: STAKING_VAULT_ABI,
          functionName: 'openPosition',
          args: [productId, reviewed.principalWei],
        });
        // Exact simulation from the connected wallet before any signature.
        await eth.request({
          method: 'eth_call',
          params: [{ from, to, data, value: '0x0' }, 'latest'],
        });
      } else {
        data = encodeFunctionData({
          abi: STAKING_VAULT_ABI,
          functionName: kind === 'claim' ? 'claim' : 'withdraw',
          args: [BigInt(positionId!)],
        });
      }

      const hash = (await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from, to, data, value: '0x0' }],
      })) as string;
      setTxHash(hash);
      await stake.refresh();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? 'Transaction failed.');
    } finally {
      setBusy(null);
    }
  };

  const blocked = stake.unavailable ?? evaluation?.blockers[0] ?? (wallet ? null : 'Connect a wallet to read your live locked-staking terms.');

  return (
    <Surface id="mainnet-locked-staking">
      <SectionHeader
        title="Locked FLOW staking — Genesis terms"
        hint="30D / 90D / 180D / 365D. Rate, Genesis duration and reserved rewards are read live from the contract for your wallet before anything can be signed."
        badge={<StatusPill tone={executable ? 'ok' : 'warn'}>{executable ? 'Live' : 'Blocked'}</StatusPill>}
      />

      <div className="space-y-3 border-t border-hairline p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LOCKED_PRODUCT_IDS.map((id) => {
            const authorized = isLockedProductAuthorized(id);
            return (
              <button
                key={id}
                type="button"
                disabled={!authorized}
                title={authorized ? undefined : 'Not approved yet'}
                onClick={() => authorized && setProductId(id)}
                className={`min-h-[44px] rounded-xl border px-3 py-2 text-[12px] font-black transition-colors ${
                  productId === id
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-hairline bg-card/60 text-muted'
                } ${authorized ? '' : 'cursor-not-allowed opacity-45'}`}
              >
                {LOCKED_PRODUCT_LABELS[id]}
                {authorized ? '' : ' · soon'}
              </button>
            );
          })}
        </div>

        <label className="block">
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-muted-soft">
            Amount to lock (FLOW)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="mt-1 w-full rounded-lg border border-hairline bg-card px-3 py-2 text-[14px] font-bold outline-none focus:border-primary"
          />
        </label>

        <dl className="grid grid-cols-2 gap-3 text-[12px]">
          <Row label="Wallet" value={short(wallet)} />
          <Row label="Your FLOW" value={fmtFlow(stake.balance, 4)} />
          <Row
            label="Genesis APR (live)"
            value={quote ? `${(quote.genesisRateBps / 100).toFixed(1)}%` : '—'}
          />
          <Row
            label="Reserved floor APR"
            value={quote ? `${(quote.floorRateBps / 100).toFixed(1)}%` : '—'}
          />
          <Row
            label="Genesis days (this wallet)"
            value={quote ? `${Math.floor(quote.genesisSeconds / 86_400)}d` : '—'}
          />
          <Row label="Unlocks" value={evaluation ? dateOf(evaluation.maturityAt) : '—'} />
          <Row label="Genesis reward reserved" value={`${fmtFlow(quote?.genesisReservedWei)} FLOW`} />
          <Row label="Floor reward reserved" value={`${fmtFlow(quote?.floorReservedWei)} FLOW`} />
        </dl>

        {stake.loading ? (
          <p className="text-[12px] text-muted">Reading live locked-staking terms from BOT Mainnet…</p>
        ) : blocked ? (
          <p className="text-[12px] leading-relaxed text-muted">{blocked}</p>
        ) : null}

        {copy ? (
          <div className="space-y-1.5 rounded-xl border border-hairline bg-card/60 p-3 text-[12px] leading-relaxed text-muted">
            <p>{copy.genesis}</p>
            {copy.postGenesis ? <p>{copy.postGenesis}</p> : null}
            <p className="text-[11px] text-muted-soft">{copy.reserveNote}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void stake.refresh()}
            disabled={busy != null || stake.loading}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-hairline bg-card px-4 text-[13px] font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-45"
          >
            {stake.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            Re-check live terms
          </button>

          {!wallet ? (
            <button
              type="button"
              onClick={() => void connectOnly()}
              disabled={busy != null}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 text-[13px] font-black text-foreground transition-opacity disabled:opacity-45"
            >
              {busy === 'connect' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden />
              )}
              Connect wallet
            </button>
          ) : !reviewed ? (
            <button
              type="button"
              onClick={() => setReviewed(quote ? { ...quote } : null)}
              disabled={!quote || stake.loading || busy != null}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 text-[13px] font-black text-foreground transition-opacity disabled:opacity-45"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Review these terms to continue
            </button>
          ) : evaluation?.needsApproval ? (
            <button
              type="button"
              onClick={() => void send('approve')}
              disabled={!executable}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground transition-opacity disabled:opacity-45"
            >
              {busy === 'approve' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Lock className="h-4 w-4" aria-hidden />
              )}
              Step 1 · Approve exactly {amountInput || '0'} FLOW
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send('open')}
              disabled={!executable}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground transition-opacity disabled:opacity-45"
            >
              {busy === 'open' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Coins className="h-4 w-4" aria-hidden />
              )}
              Step 2 · Lock {amountInput || '0'} FLOW for {LOCKED_PRODUCT_LABELS[productId]}
            </button>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-soft">
          Connecting a wallet only connects it — no approval or staking request is ever sent at that
          point. Approval and locking are two separate wallet confirmations after you review the live
          terms, nothing is submitted automatically, and no unlimited approval is ever requested. If
          the live terms change before you sign, the transaction is cancelled and you review again.
          Locked principal cannot be withdrawn before its on-chain unlock date.
        </p>

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
            Your locked positions
          </h3>
          {stake.positions.map((p) => (
            <div key={p.positionId} className="rounded-xl border border-hairline bg-card/60 px-3 py-2 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  #{p.positionId} · {LOCKED_PRODUCT_LABELS[p.productId as LockedProductId] ?? `Product ${p.productId}`} ·{' '}
                  {fmtFlow(p.principal, 4)} FLOW · {p.open ? 'Locked' : 'Closed'}
                </span>
                <span className="text-muted">Claimable {fmtFlow(p.pending)} FLOW</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-soft">Unlocks {dateOf(p.maturityAt)}</div>
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
                    disabled={busy != null || p.maturityAt * 1000 > Date.now()}
                    className="min-h-[38px] flex-1 rounded-xl border border-hairline bg-card text-[12px] font-bold disabled:opacity-45"
                  >
                    Withdraw at maturity
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
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
