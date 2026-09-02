import { useEffect, useState } from 'react';
import { Coins, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { encodeFunctionData } from 'viem';

import { SectionHeader, StatusPill, Surface } from '@/components/ui-kit/primitives';
import { botMainnet } from '@/lib/wagmi';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/rewards/flowRewardsRegistry';
import { MERKLE_DISTRIBUTOR_CLAIM_ABI } from '@/lib/rewards/merkleClaim';
import { useMainnetFlowClaim } from '@/lib/rewards/useMainnetFlowClaim';

/**
 * FlowBridge V30.2B P2E — BOT Mainnet 677 FLOW claim surface.
 *
 * Presentation only, and strictly separate from the BOT Testnet 968 card: the
 * epoch, allocation and proof come from the frozen mainnet manifest, every gate
 * is re-read live from the canonical distributor, and the Merkle proof is
 * verified locally before the wallet is ever asked to sign.
 */

const FLOW_DECIMALS = 18n;

function formatFlow(raw: string | null | undefined, maxFrac = 4): string {
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
  s ? new Date(s * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function MainnetFlowClaimCard() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const claim = useMainnetFlowClaim(wallet);

  // Read-only: reflect an already-connected wallet without prompting.
  useEffect(() => {
    const eth = (globalThis as any).window?.ethereum;
    if (!eth) return;
    eth
      .request({ method: 'eth_accounts' })
      .then((a: string[]) => setWallet(a?.[0] ? a[0].toLowerCase() : null))
      .catch(() => undefined);
  }, []);

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const eth = (globalThis as any).window?.ethereum;
      if (!eth) throw new Error('No wallet detected in this browser.');
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      setWallet(accounts?.[0] ? accounts[0].toLowerCase() : null);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Could not connect a wallet.');
    } finally {
      setConnecting(false);
    }
  };

  const submit = async () => {
    const prep = claim.preparation;
    if (!prep) return;
    setSubmitting(true);
    setError(null);
    try {
      const eth = (globalThis as any).window?.ethereum;
      if (!eth) throw new Error('No wallet detected in this browser.');
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      const from = (accounts?.[0] ?? '').toLowerCase();
      if (from !== prep.account.toLowerCase()) {
        throw new Error(`Connect ${short(prep.account)} — the wallet this allocation was published for.`);
      }
      const hexChain = `0x${BOT_MAINNET_CHAIN_ID.toString(16)}`;
      if ((await eth.request({ method: 'eth_chainId' })) !== hexChain) {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChain }] });
      }
      const data = encodeFunctionData({
        abi: MERKLE_DISTRIBUTOR_CLAIM_ABI,
        functionName: 'claim',
        args: [
          BigInt(prep.epochId),
          BigInt(prep.index),
          prep.account,
          BigInt(prep.amount),
          prep.proof as readonly `0x${string}`[],
        ],
      });
      const hash: string = await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: prep.distributor, data, value: '0x0' }],
      });
      setTxHash(hash);
      await claim.refresh();
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Claim transaction failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const tone =
    claim.status === 'CLAIMABLE' ? 'ok' : claim.status === 'ALREADY_CLAIMED' ? 'ok' : 'pending';
  const badge =
    claim.status === 'CLAIMABLE'
      ? 'Claimable'
      : claim.status === 'ALREADY_CLAIMED'
        ? 'Claimed'
        : claim.status === 'PAUSED'
          ? 'Paused'
          : claim.status === 'NO_ENTITLEMENT'
            ? 'No allocation'
            : 'Blocked';

  const manifest = claim.entitlement?.manifest ?? null;

  return (
    <Surface id="mainnet-flow-claim">
      <SectionHeader
        title="Claim FLOW on BOT Mainnet"
        hint="Published epoch allocation. Every gate — pause, window, root and prior claim — is read live from the distributor before the button unlocks."
        badge={<StatusPill tone={tone as any}>{badge}</StatusPill>}
      />

      <div className="space-y-3 border-t border-hairline p-4">
        {!wallet ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Connect the wallet you swapped with to check whether it has an allocation in a published
            BOT Mainnet reward epoch. Allocations are fixed at publication — they are never derived
            from FLOW Points or Campaign PTS.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-[12px]">
            <Row label="Network" value={`BOT Mainnet · ${BOT_MAINNET_CHAIN_ID}`} />
            <Row label="Wallet" value={short(wallet)} />
            <Row label="Epoch" value={manifest ? `#${manifest.epochId}` : '—'} />
            <Row
              label="Allocation"
              value={claim.entitlement ? `${formatFlow(claim.entitlement.leaf.amount)} FLOW` : '—'}
            />
            <Row label="Claim opens" value={asDate(claim.epoch?.claimStart)} />
            <Row label="Claim closes" value={asDate(claim.epoch?.claimEnd)} />
            <Row label="Distributor" value={short(claim.distributor)} />
            <Row label="On-chain status" value={claim.alreadyClaimed ? 'Claimed' : badge} />
          </dl>
        )}

        <p className="text-[12px] leading-relaxed text-muted">
          {claim.loading ? 'Reading live reward state from BOT Mainnet…' : claim.message}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void (wallet ? claim.refresh() : connect())}
            disabled={connecting || claim.loading || submitting}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-hairline bg-card px-4 text-[13px] font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-45"
          >
            {connecting || claim.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            {wallet ? 'Re-check live state' : 'Connect wallet to check'}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!claim.preparation || submitting || claim.loading}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground transition-opacity disabled:opacity-45"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Coins className="h-4 w-4" aria-hidden />
            )}
            {submitting
              ? 'Confirm in wallet…'
              : claim.preparation
                ? `Claim ${formatFlow(claim.preparation.amount)} FLOW`
                : 'Claim FLOW'}
          </button>
        </div>

        {txHash ? (
          <a
            href={`${botMainnet.blockExplorers.default.url}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary"
          >
            View claim transaction <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}

        {error ? <p className="text-[12px] leading-relaxed text-destructive">{error}</p> : null}

        {claim.explorerTxUrl ? (
          <a
            href={claim.explorerTxUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-muted"
          >
            View the on-chain epoch publication <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}

        <p className="text-[11px] leading-relaxed text-muted-soft">
          Mainnet rewards are paid only from an epoch that was already funded and reserved on chain
          before publication — nothing is minted, and a claim can never exceed its published leaf.
          The proof is checked against the distributor's live root in your browser before your wallet
          is asked to sign, and the contract checks it again. Staking execution on BOT Mainnet stays
          inactive.
        </p>
      </div>
    </Surface>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-card/60 px-3 py-2">
      <dt className="text-[10.5px] font-bold uppercase tracking-wide text-muted-soft">{label}</dt>
      <dd className="mt-0.5 text-[12.5px] font-black text-foreground">{value}</dd>
    </div>
  );
}
