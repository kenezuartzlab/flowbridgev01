import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Coins, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { createPublicClient, encodeFunctionData, http, type Hex } from 'viem';

import { SectionHeader, StatusPill, Surface } from '@/components/ui-kit/primitives';
import { botMainnet } from '@/lib/wagmi';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/rewards/flowRewardsRegistry';
import { MERKLE_DISTRIBUTOR_CLAIM_ABI } from '@/lib/rewards/merkleClaim';
import { useMainnetFlowClaim } from '@/lib/rewards/useMainnetFlowClaim';
import {
  runSequentialClaims,
  type ClaimablePreparation,
  type ClaimStepResult,
  type RoundStatus,
  type RoundView,
} from '@/lib/rewards/mainnetClaimRounds';
import { trackProductEvent } from '@/lib/ops/productEvents';
import { getActiveProvider } from '@/lib/wallet/activeProvider';

/**
 * BOT Mainnet 677 FLOW claim surface (shared by /earn and /rewards).
 *
 * Shows every published round for the connected wallet. Each round is gated
 * independently by live on-chain reads and local proof verification. Claims
 * are sent one at a time; "Claimed" is shown only after a successful receipt
 * and an on-chain isClaimed re-read. Users pay their own BOT gas.
 */

const FLOW_DECIMALS = 18n;
const EXPLORER = botMainnet.blockExplorers.default.url;

export function formatFlow(raw: string | null | undefined, maxFrac = 4): string {
  if (raw == null) return '—';
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return '—';
  }
  const base = 10n ** FLOW_DECIMALS;
  const frac = v % base;
  const whole = (v / base).toLocaleString('en-US');
  if (frac === 0n) return whole;
  const fracStr = frac.toString().padStart(18, '0').slice(0, maxFrac).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole;
}

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const asDate = (s?: number | null) =>
  s ? new Date(s * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' }) : '—';

const LABEL: Record<RoundStatus, string> = {
  CLAIMABLE: 'Ready to claim',
  OPENS_LATER: 'Opens soon',
  EXPIRED: 'Expired',
  CLAIMED: 'Claimed',
  ROOT_MISMATCH: 'Blocked',
  PAUSED: 'Paused',
  NOT_PUBLISHED: 'Not published',
  READ_FAILED: 'Retry',
  BLOCKED: 'Blocked',
};

type Step = { epochId: number; phase: 'signing' | 'submitted' | 'done'; hash?: string };

export function MainnetFlowClaimCard() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [results, setResults] = useState<ClaimStepResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const stopRef = useRef(false);
  const claim = useMainnetFlowClaim(wallet);
  const { rounds } = claim;

  useEffect(() => {
    void getActiveProvider()
      .then((eth: any) => (eth ? eth.request({ method: 'eth_accounts' }) : null))
      .then((a: string[] | null) => {
        if (a) setWallet(a?.[0] ? a[0].toLowerCase() : null);
      })
      .catch(() => undefined);
  }, []);

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const eth = (await getActiveProvider()) as any;
      if (!eth) throw new Error('No wallet detected in this browser.');
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      setWallet(accounts?.[0] ? accounts[0].toLowerCase() : null);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Could not connect a wallet.');
    } finally {
      setConnecting(false);
    }
  };

  const claimRounds = async (preps: ClaimablePreparation[]) => {
    if (!preps.length || running) return;
    setRunning(true);
    setError(null);
    setResults([]);
    stopRef.current = false;
    trackProductEvent('claim_started', 'earn');
    const client = createPublicClient({ chain: botMainnet, transport: http() });
    const hexChain = `0x${BOT_MAINNET_CHAIN_ID.toString(16)}`;
    try {
      const eth = (await getActiveProvider()) as any;
      if (!eth) throw new Error('No wallet detected in this browser.');
      const out = await runSequentialClaims(preps, {
        shouldStop: () => stopRef.current,
        readClaimed: async (p) =>
          Boolean(
            await client.readContract({
              address: p.distributor,
              abi: MERKLE_DISTRIBUTOR_CLAIM_ABI,
              functionName: 'isClaimed',
              args: [BigInt(p.epochId), BigInt(p.index)],
            }),
          ),
        preflight: async (p) => {
          const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
          if ((accounts?.[0] ?? '').toLowerCase() !== p.account.toLowerCase()) {
            throw new Error(`Connect ${short(p.account)} — the wallet this allocation was published for.`);
          }
          if ((await eth.request({ method: 'eth_chainId' })) !== hexChain) {
            await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChain }] });
            if ((await eth.request({ method: 'eth_chainId' })) !== hexChain) throw new Error('Switch your wallet to BOT Mainnet.');
          }
        },
        send: async (p) => {
          const data = encodeFunctionData({
            abi: MERKLE_DISTRIBUTOR_CLAIM_ABI,
            functionName: 'claim',
            args: [BigInt(p.epochId), BigInt(p.index), p.account, BigInt(p.amount), p.proof as readonly Hex[]],
          });
          return (await eth.request({
            method: 'eth_sendTransaction',
            params: [{ from: p.account, to: p.distributor, data, value: '0x0' }],
          })) as string;
        },
        waitReceipt: async (hash) => {
          const r = await client.waitForTransactionReceipt({ hash: hash as Hex, timeout: 180_000 });
          return r.status === 'success' ? 'success' : 'reverted';
        },
        onStep: (epochId, phase, hash) => setStep({ epochId, phase, hash }),
      });
      setResults(out);
      if (out.some((r) => r.outcome === 'claimed')) trackProductEvent('claim_confirmed', 'earn');
      const bad = out.find((r) => r.outcome !== 'claimed' && r.outcome !== 'skipped');
      if (bad) {
        setError(
          bad.outcome === 'rejected'
            ? `Round #${bad.epochId}: ${bad.error}. Nothing else was sent — you can retry the remaining rounds.`
            : bad.outcome === 'reverted'
              ? `Round #${bad.epochId} transaction failed on chain. No FLOW moved for that round.`
              : `Round #${bad.epochId} was submitted but is not yet confirmed as claimed. Re-check before retrying.`,
        );
      }
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Claim could not start.');
    } finally {
      setStep(null);
      setRunning(false);
      await claim.refresh();
    }
  };

  const count = rounds.claimable.length;
  const total = formatFlow(rounds.totalClaimableWei);
  const badge = count ? `${total} FLOW ready` : claim.status === 'READ_FAILED' ? 'Retry' : wallet ? 'Nothing to claim now' : 'Connect wallet';

  return (
    <Surface id="mainnet-flow-claim">
      <SectionHeader
        title="FLOW ready to claim"
        hint="Published BOT Mainnet reward rounds for your wallet. Each round is checked live on chain before you can claim."
        badge={<StatusPill tone={(count ? 'ok' : 'pending') as any}>{badge}</StatusPill>}
      />

      <div className="space-y-3 border-t border-hairline p-4">
        {!wallet ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Connect the wallet you earned with to see every published FLOW allocation. Earned Points become
            FLOW only after they are verified, funded and published in a reward round.
          </p>
        ) : (
          <>
            <div className="rounded-2xl border border-hairline bg-card/60 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-soft">Claimable now · {short(wallet)}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-foreground">
                {claim.loading ? '…' : total} <span className="text-sm font-bold text-muted">FLOW</span>
              </p>
              <p className="mt-1 text-[11.5px] text-muted">
                {count > 1
                  ? `${count} rounds — ${count} separate wallet confirmations and ${count} BOT network fees.`
                  : count === 1
                    ? '1 wallet confirmation · you pay a small BOT network fee. No FlowBridge fee.'
                    : claim.loading
                      ? 'Reading live reward state from BOT Mainnet…'
                      : claim.message || 'No open round for this wallet right now.'}
              </p>
            </div>

            {rounds.active.length ? (
              <ul className="space-y-2" aria-label="Reward rounds">
                {rounds.active.map((r) => (
                  <RoundRow key={`${r.epochId}:${r.index}`} r={r} busy={running} step={step} onClaim={(p) => void claimRounds([p])} />
                ))}
              </ul>
            ) : null}

            {rounds.history.length ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="inline-flex min-h-[40px] items-center gap-1 text-[12px] font-bold text-muted"
                  aria-expanded={showHistory}
                >
                  History ({rounds.history.length}) <ChevronDown className={`h-3.5 w-3.5 ${showHistory ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {showHistory ? (
                  <ul className="mt-1 space-y-2">
                    {rounds.history.map((r) => (
                      <RoundRow key={`${r.epochId}:${r.index}`} r={r} busy step={null} onClaim={() => undefined} />
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {step ? (
          <p role="status" className="text-[12px] font-bold text-foreground">
            Round #{step.epochId}:{' '}
            {step.phase === 'signing' ? 'confirm in your wallet…' : step.phase === 'submitted' ? 'transaction submitted — waiting for BOT Mainnet confirmation…' : 'verifying claimed state…'}
            {step.hash ? (
              <a href={`${EXPLORER}/tx/${step.hash}`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 text-primary">
                View <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : null}
          </p>
        ) : null}

        {results.length ? (
          <ul className="space-y-1 text-[12px]">
            {results.map((r) => (
              <li key={r.epochId} className="text-muted">
                Round #{r.epochId}:{' '}
                <span className="font-bold text-foreground">
                  {r.outcome === 'claimed' ? 'Claimed ✓' : r.outcome === 'skipped' ? 'Already claimed' : r.outcome === 'reverted' ? 'Failed' : r.outcome === 'unconfirmed' ? 'Submitted, not yet confirmed' : 'Not sent'}
                </span>
                {'hash' in r ? (
                  <a href={`${EXPLORER}/tx/${r.hash}`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 text-primary">
                    tx <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <p className="text-[12px] leading-relaxed text-destructive">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void (wallet ? claim.refresh() : connect())}
            disabled={connecting || claim.loading || running}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-hairline bg-card px-4 text-[13px] font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-45"
          >
            {connecting || claim.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            {wallet ? 'Re-check live state' : 'Connect wallet'}
          </button>
          {running && count > 1 ? (
            <button
              type="button"
              onClick={() => (stopRef.current = true)}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl border border-hairline bg-card px-4 text-[13px] font-bold text-foreground"
            >
              Stop after this round
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void claimRounds(rounds.claimable)}
              disabled={!count || running || claim.loading}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:border disabled:border-hairline disabled:bg-card disabled:text-muted"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Coins className="h-4 w-4" aria-hidden />}
              {running ? 'Claiming…' : count > 1 ? `Claim available FLOW (${count} confirmations)` : count === 1 ? `Claim ${total} FLOW` : 'Claim FLOW'}
            </button>
          )}
        </div>

        {claim.explorerTxUrl ? (
          <a href={claim.explorerTxUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-muted">
            View the reward distributor <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}

        <p className="text-[11px] leading-relaxed text-muted-soft">
          Only verified, funded and published allocations appear here — not every earned Point. 1 Point = 1 FLOW
          only for allocations in a published round. Claims are sent one at a time from your own wallet; the
          contract has no combined claim. Unclaimed FLOW expires when a round's window closes.
        </p>
      </div>
    </Surface>
  );
}

function RoundRow({
  r,
  busy,
  step,
  onClaim,
}: {
  r: RoundView;
  busy: boolean;
  step: Step | null;
  onClaim: (p: ClaimablePreparation) => void;
}) {
  const dateLine =
    r.status === 'OPENS_LATER'
      ? `Opens ${asDate(r.claimStart)}`
      : r.status === 'CLAIMABLE'
        ? `Claim by ${asDate(r.claimEnd)}`
        : r.status === 'EXPIRED'
          ? `Closed ${asDate(r.claimEnd)}`
          : r.message;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-card/60 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[12.5px] font-black text-foreground">
          Round #{r.epochId} · {formatFlow(r.amount)} FLOW
        </p>
        <p className="break-words text-[11px] text-muted">
          <span className="font-bold">{LABEL[r.status]}</span> · {dateLine}
        </p>
        {r.publicationTxHash ? (
          <a href={`${EXPLORER}/tx/${r.publicationTxHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10.5px] font-bold text-muted-soft">
            Publication tx <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>
      {r.status === 'CLAIMABLE' && r.preparation ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onClaim(r.preparation!)}
          className="inline-flex min-h-[40px] items-center rounded-full bg-primary px-3 text-[12px] font-bold text-primary-foreground disabled:opacity-45"
        >
          {step?.epochId === r.epochId ? 'Claiming…' : 'Claim'}
        </button>
      ) : null}
    </li>
  );
}
