import { useEffect, useState } from "react";
import { Coins, ExternalLink, Loader2, ShieldCheck } from "lucide-react";

import { getIdToken } from "@/lib/auth";
import { BOT_TESTNET_CHAIN_ID } from "@/lib/rewards/flowRewardsRegistry";
import { SectionHeader, StatusPill, Surface } from "@/components/ui-kit/primitives";
import {
  parseClaimHandoffCorrelation,
  type ClaimHandoffCorrelation,
} from "@/lib/ai/mission/claimHandoff";
import { missionAction } from "@/lib/ai/mission/missionClient";


/**
 * FlowBridge V12.3 — on-chain FLOW claim, BOT Testnet 968.
 *
 * Presentation only. Every authoritative value (token, distributor, cumulative
 * entitlement, claimable delta, deadline, signature) comes from the server
 * authorization response; the browser may only ask for chainId 968 and submit
 * the returned authorization verbatim. Nothing is auto-submitted: the user must
 * request the authorization and then explicitly confirm the wallet transaction.
 */

type Authorization = any;

const FLOW_DECIMALS = 18n;

function formatFlow(raw: string | null | undefined, maxFrac = 4): string {
  if (raw == null) return "—";
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return "—";
  }
  const base = 10n ** FLOW_DECIMALS;
  const whole = v / base;
  const frac = v % base;
  if (frac === 0n) return whole.toLocaleString("en-US");
  const fracStr = frac.toString().padStart(Number(FLOW_DECIMALS), "0").slice(0, maxFrac).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fracStr ? `.${fracStr}` : ""}`;
}

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

/** claim(address,uint256,uint256,bytes) calldata, built from the server authorization only. */
function encodeClaim(auth: Authorization): string {
  const selector = "0x2ada8a32";
  const word = (v: bigint) => v.toString(16).padStart(64, "0");
  const addr = auth.account.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const sig = auth.signature.replace(/^0x/, "");
  const sigBytes = BigInt(sig.length / 2);
  const padded = sig.padEnd(Math.ceil(sig.length / 64) * 64, "0");
  return (
    selector +
    addr +
    word(BigInt(auth.cumulativeEntitlement)) +
    word(BigInt(auth.deadline)) +
    word(128n) +
    word(sigBytes) +
    padded
  );
}

export function FlowTokenClaimCard({
  campaignPts,
  onClaimed,
}: {
  campaignPts?: number | null;
  onClaimed?: () => void | Promise<void>;
}) {
  const [auth, setAuth] = useState<Authorization | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  /**
   * V17.1C §2 — a mission may have prepared this claim. The link carries opaque
   * correlation only: this card still requests its own server-signed
   * authorization and only the user's wallet signs. After the user submits, the
   * submission is reported back so the mission's settlement verifier — not this
   * screen, and not a zero claimable balance — decides the outcome.
   */
  const [correlation, setCorrelation] = useState<ClaimHandoffCorrelation | null>(null);
  const [missionNote, setMissionNote] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCorrelation(parseClaimHandoffCorrelation(window.location.search));
  }, []);

  const reportToMission = async (hash: string) => {
    if (!correlation) return;
    try {
      const res = await missionAction({
        action: "settle",
        missionId: correlation.missionId,
        stepId: correlation.stepId,
        txHash: hash,
      });
      setMissionNote(
        res.message ??
          "Your submission was reported to the mission — settlement is verified on chain.",
      );
    } catch {
      setMissionNote(
        "Your claim was submitted. The mission could not be updated right now; it will verify settlement on your next check.",
      );
    }
  };


  const requestAuthorization = async () => {

    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Sign in again to check your FLOW claim.");
      const res = await fetch("/api/rewards/claim-authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chainId: BOT_TESTNET_CHAIN_ID }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.authorization) throw new Error(data?.error ?? "Could not check FLOW claim.");
      setAuth(data.authorization);
    } catch (e: any) {
      setError(e?.message ?? "Could not check FLOW claim.");
    } finally {
      setLoading(false);
    }
  };

  const submitClaim = async () => {
    if (!auth?.authorized) return;
    setSubmitting(true);
    setError(null);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected in this browser.");
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      const from = (accounts?.[0] ?? "").toLowerCase();
      if (from !== String(auth.account).toLowerCase()) {
        throw new Error(`Connect the bound wallet ${short(auth.account)} to claim.`);
      }
      const hexChain = `0x${Number(auth.chainId).toString(16)}`;
      if ((await eth.request({ method: "eth_chainId" })) !== hexChain) {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] });
      }
      const hash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: auth.distributor, data: encodeClaim(auth), value: "0x0" }],
      });
      setTxHash(hash);
      await reportToMission(hash);
      await onClaimed?.();
      /**
       * V17.1C §3 — re-read authoritative state. A zero delta AFTER a submitted
       * claim is the settled state, not a failure: the card says so instead of
       * reading like the claim disappeared.
       */
      await requestAuthorization();

    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? "Claim transaction failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const expiresIn = auth?.authorized
    ? Math.max(0, Number(auth.deadline) - Math.floor(Date.now() / 1000))
    : null;

  return (
    <Surface id="flow-claim">
      <SectionHeader
        title="Claim FLOW on BOT Testnet"
        hint="Server-signed, short-lived authorization. The distributor only transfers pre-funded FLOW — it never mints."
        badge={
          <StatusPill tone={auth?.authorized ? "ok" : "pending"}>
            {auth?.authorized ? "Claimable" : "Check"}
          </StatusPill>
        }
      />

      <div className="space-y-3 border-t border-hairline p-4">
        {auth ? (
          <dl className="grid grid-cols-2 gap-3 text-[12px]">
            <Row label="Network" value={`BOT Testnet · ${auth.chainId ?? BOT_TESTNET_CHAIN_ID}`} />
            <Row label="Eligible FLOW Points" value={Number(auth.display?.lifetimeClaimedPoints ?? 0).toLocaleString("en-US")} />
            <Row label="Cumulative entitlement" value={`${formatFlow(auth.cumulativeEntitlement)} FLOW`} />
            <Row label="Already claimed on-chain" value={`${formatFlow(auth.alreadyClaimed)} FLOW`} />
            <Row label="Claimable now" value={`${formatFlow(auth.claimableDelta)} FLOW`} />
            <Row label="Recipient" value={short(auth.display?.walletAddress ?? auth.account)} />
            <Row label="Distributor" value={short(auth.distributor)} />
            <Row
              label="Authorization expires"
              value={expiresIn != null ? `${Math.floor(expiresIn / 60)}m ${expiresIn % 60}s` : "—"}
            />
            <Row
              label="Campaign PTS (excluded)"
              value={campaignPts != null ? Number(campaignPts).toLocaleString("en-US") : "—"}
            />
          </dl>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Check whether your converted FLOW Points have an on-chain FLOW payout waiting. Campaign
            PTS are never part of this calculation.
          </p>
        )}

        {auth && !auth.authorized ? (
          <p className="text-[12px] leading-relaxed text-muted">
            {txHash
              ? "Your claim was submitted and the distributor now shows nothing further to claim — that is the settled state, not a failure. The transaction below is the record."
              : auth.message}
          </p>
        ) : null}

        {correlation ? (
          <p className="text-[11.5px] leading-relaxed text-muted">
            Opened from a Flow AI mission. The mission carried no amounts or calldata here: this card
            requested its own server-signed authorization, and only your wallet can sign it.
          </p>
        ) : null}


        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void requestAuthorization()}
            disabled={loading || submitting}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-hairline bg-card px-4 text-[13px] font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-45"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            {loading ? "Checking…" : "Check claim authorization"}
          </button>
          <button
            type="button"
            onClick={() => void submitClaim()}
            disabled={!auth?.authorized || submitting || loading}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground transition-opacity disabled:opacity-45"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Coins className="h-4 w-4" aria-hidden />}
            {submitting
              ? "Confirm in wallet…"
              : auth?.authorized
                ? `Claim ${formatFlow(auth.claimableDelta)} FLOW`
                : "Claim FLOW"}
          </button>
        </div>

        {txHash ? (
          <a
            href={`https://scan.bohr.life/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary"
          >
            View claim transaction <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}

        {missionNote ? (
          <p className="text-[11.5px] leading-relaxed text-muted">{missionNote}</p>
        ) : null}

        {error ? <p className="text-[12px] leading-relaxed text-destructive">{error}</p> : null}


        <p className="text-[11px] leading-relaxed text-muted-soft">
          On BOT Testnet, 1 eligible FLOW Point converts to 1 FLOW. This is a testnet validation
          policy only and is not approved mainnet economics. FLOW Points are an off-chain score;
          they are not FLOW in your wallet until a claim settles on chain. Campaign PTS are shown
          separately and never convert.
        </p>
        <p className="text-[11px] leading-relaxed text-muted-soft">
          Rewards are paid from a finite, pre-funded FLOW allocation — nothing is ever minted, and a
          claim can only pay FLOW the distributor already holds. On BOT Mainnet, rewards will be
          distributed by the budgeted epoch distributor, where each reward epoch must be funded and
          reserved on chain before anyone can claim it. Mainnet claims stay disabled until that
          distributor is deployed under approved governance.
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
