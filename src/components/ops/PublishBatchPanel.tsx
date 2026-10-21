import { useEffect, useRef, useState } from "react";
import { getIdToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PENDING_PUBLICATION_KEY, parsePendingPublication, type PendingPublication } from "@/lib/rewards/publicationVerification";
import { getActiveProvider } from "@/lib/wallet/activeProvider";
import { publisherWalletGate, WALLET_GATE_COPY, AUTONOMOUS_ACTIVATION_REQUIREMENTS, type PublishPhase } from "@/lib/rewards/publishGate";
import type { RewardSolvencyReport } from "@/lib/rewards/rewardSolvency.server";

import { isPublisherCancellation, selectRestorableAttempt, type PublisherAttempt } from "@/lib/rewards/publisherRecovery";

type S = RewardSolvencyReport["settlement"];
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
const PHASE_COPY: Record<PublishPhase, string> = {
  READY: "Ready for publisher review.",
  VALIDATING: "Validating live batch…",
  AWAITING_WALLET: "Waiting for publisher wallet…",
  CANCELLED: "Wallet request cancelled. Safe to retry after reconciliation.",
  CONFIRMING: "Verifying transaction confirmation…",
  CONFIRMED: "Publication confirmed.",
  RECOVERY_REQUIRED: "Broadcast status uncertain. Recover before retrying.",
  IDLE: "Not started.",
  REVALIDATING: "Revalidating against live ledger and contract state…",
  AWAITING_SIGNATURE: "Waiting for the publisher to approve in the wallet…",
  BROADCAST_PENDING: "Broadcast — waiting for BOT Mainnet confirmation. Not published yet.",
  CONFIRMED_VERIFIED: "Confirmed on chain and verified: root, allocation and window match. Claims open at the scheduled time.",
  CONFIRMED_MISMATCH: "Confirmed, but on-chain state does not match the reviewed batch. Do not announce; investigate.",
  REVERTED: "Transaction reverted. Nothing was published.",
  REJECTED: "Signature declined in the wallet. Nothing was sent.",
  ERROR: "Something failed. Nothing is reported as published.",
};

async function authed(wallet: string | undefined, path: string, init?: RequestInit) {
  const token = await getIdToken();
  if (!token || !wallet) throw new Error("Sign in and reconnect your bound operator wallet to verify.");
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, "x-wallet-address": wallet, "content-type": "application/json" } });
}

export function PublishBatchPanel({ s, rebuild, stale, wallet }: { s: S; rebuild: () => Promise<{ data?: RewardSolvencyReport }>; stale: boolean; wallet?: string }) {
  const [phase, setPhase] = useState<PublishPhase>("IDLE");
  const [review, setReview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [history, setHistory] = useState<{ object_id: string; action: string; new_value: { txHash?: string } | null; created_at: string }[]>([]);
  const [pending, setPending] = useState<PendingPublication | null>(null);
  const busy = useRef(false);
  const storageKey = `${PENDING_PUBLICATION_KEY}:${wallet?.toLowerCase() ?? "disconnected"}`;
  function remember(p: PendingPublication) {
    setPending(p); setHash(p.txHash);
    try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch { /* Server recovery remains authoritative. */ }
  }
  async function loadHistory(restore = false) {
    const r = await authed(wallet, "/api/admin/rewards-publish-verify").catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (j?.history) setHistory(j.history);
    if (restore) {
      const a = selectRestorableAttempt(j?.attempts as PublisherAttempt[] | undefined);
      if (a) {
        remember({attemptId:a.id,operationId:a.operation_id,epochId:a.epoch_id,root:a.root,fingerprint:a.fingerprint,txHash:a.tx_hash});
        setPhase(a.tx_hash ? "BROADCAST_PENDING" : "RECOVERY_REQUIRED");
      } else if (j?.attempts) {
        const safe = j.attempts.find((a: { phase: string; retry_safe: boolean; epoch_id: number }) => a.epoch_id === s.epochId && a.retry_safe && ["CANCELLED", "REVERTED"].includes(a.phase));
        setPending(null); setHash(null); setPhase(safe?.phase ?? "IDLE");
        try { localStorage.removeItem(storageKey); } catch { /* Server is authoritative. */ }
      }
    }
  }
  useEffect(() => {
    let local: PendingPublication | null = null;
    try { local = parsePendingPublication(localStorage.getItem(storageKey)); } catch { /* Unavailable storage. */ }
    setPending(local); setHash(local?.txHash ?? null);
    setPhase(local ? "BROADCAST_PENDING" : "IDLE");
    void loadHistory(true);
  }, [wallet, s.epochId]);
  async function verify(p: PendingPublication) {
    const res = await authed(wallet, "/api/admin/rewards-publish-verify", {method:"POST",body:JSON.stringify(p)}).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !j?.phase) {
      setMsg(j?.error ?? "Verification unavailable — keep this transaction and re-check. Never send it again.");
      return "BROADCAST_PENDING";
    }
    setPhase(j.phase);
    if (j.retrySafe) { setPending(null); try { localStorage.removeItem(storageKey); } catch {} }
    if (j.phase === "CONFIRMED_VERIFIED") {
      setPending(null);
      try { localStorage.removeItem(storageKey); } catch { /* Server confirmation persists. */ }
      void rebuild(); void loadHistory();
    }
    return j.phase as PublishPhase;
  }
  async function recheck() {
    if (!pending || busy.current) return;
    const txHash = hash;
    if (!txHash) { await recover(); return; }
    busy.current = true; setMsg(null);
    try { const p={...pending,txHash}; remember(p); await verify(p); void loadHistory(); }
    finally { busy.current=false; }
  }
  async function recover(action = "recover", cancellation?: unknown) {
    if (!pending) return;
    const evidence = cancellation ?? pending.cancellation;
    const r=await authed(wallet,"/api/admin/rewards-publish-verify",{method:"PATCH",body:JSON.stringify({...pending,txHash:hash,action:evidence && action === "recover" ? "cancel" : action,cancellation:evidence})}).catch(()=>null);
    const j=r ? await r.json().catch(()=>null) : null;
    if(!r?.ok) {setPhase("RECOVERY_REQUIRED");setMsg(j?.error ?? "Recovery unavailable; do not resend.");return;}
    setPhase(j.phase);setMsg(null);
    if(j.retrySafe) {setPending(null);setHash(null);try {localStorage.removeItem(storageKey);} catch {} await rebuild();}
    void loadHistory();
  }
  const ready = s.status === "READY_FOR_PUBLISHER_REVIEW" && !!s.tx;
  useEffect(() => { setReview(false); }, [wallet, s.fingerprint, s.root, ready, stale]);
  const states = s.walletStates ?? [];
  const count = (k: string) => states.filter((w) => w.state === k).length;
  const live = s.liveState;
  const freeAfter = live ? live.balanceFlow - live.reservedFlow - s.totalFlow : null;

  async function publish() {
    if (busy.current || pending) return;
    busy.current = true; setMsg(null); setPhase("VALIDATING");
    try {
      const fresh = (await rebuild()).data?.settlement;
      if (!fresh || fresh.status !== 'READY_FOR_PUBLISHER_REVIEW' || fresh.fingerprint !== s.fingerprint || fresh.root !== s.root || !fresh.tx || !fresh.root || !fresh.epochId || !fresh.fingerprint) {
        setReview(false); setPhase("IDLE"); setMsg("Stored batch validation failed — refresh and review the existing batch again. No wallet request was submitted."); return;
      }
      const eth = await getActiveProvider();
      if (!eth) { setPhase("IDLE"); setMsg(WALLET_GATE_COPY.NOT_CONNECTED); return; }
      const accounts = (await eth.request({method:"eth_accounts"})) as string[];
      const chainId = parseInt(String(await eth.request({method:"eth_chainId"})),16);
      const gate = publisherWalletGate({connected:accounts[0] ?? null,chainId,requiredSigner:fresh.signer.address,ready:true,stale:false,simulationOk:!!fresh.simulation?.ok});
      if (gate !== "OK" || accounts[0]?.toLowerCase() !== wallet?.toLowerCase()) { setPhase("IDLE"); setMsg(WALLET_GATE_COPY[gate] === WALLET_GATE_COPY.OK ? "Reconnect your bound operator wallet." : WALLET_GATE_COPY[gate]); return; }
      const locked = await authed(wallet,"/api/admin/rewards-publish-verify",{method:"PUT",body:JSON.stringify({epochId:fresh.epochId,root:fresh.root,fingerprint:fresh.fingerprint})});
      const lock = await locked.json();
      if (!locked.ok || !lock.attemptId) { setReview(false); setPhase("IDLE"); setMsg(lock.error ?? "Publication blocked."); void loadHistory(true); return; }
      const p: PendingPublication = {attemptId:lock.attemptId,operationId:lock.operationId,epochId:fresh.epochId,root:fresh.root,fingerprint:fresh.fingerprint,txHash:null};
      remember(p); setPhase("AWAITING_WALLET");
      let txHash: string;
      try { txHash=String(await eth.request({method:"eth_sendTransaction",params:[{from:accounts[0],to:fresh.tx.to,data:fresh.tx.data,value:"0x0",nonce:`0x${Number(lock.nonce).toString(16)}`}]})); }
      catch (e) {
        const cancellation=isPublisherCancellation(e);
        if (cancellation) remember({...p,cancellation:{code:4001}});
        const r=await authed(wallet,"/api/admin/rewards-publish-verify",{method:"PATCH",body:JSON.stringify({...p,action:cancellation?"cancel":"recover",cancellation:cancellation?{code:4001}:undefined})}).catch(()=>null);
        const j=r ? await r.json().catch(()=>null) : null;
        if(r?.ok && j?.retrySafe) {setPending(null);setHash(null);setPhase("CANCELLED");try {localStorage.removeItem(storageKey);} catch {} setMsg(null);}
        else {setPhase("RECOVERY_REQUIRED");setMsg("Broadcast status uncertain. Recover this operation before retrying.");}
        return;
      }
      if (!/^0x[0-9a-f]{64}$/i.test(txHash)) { setPhase("ERROR"); setMsg("Wallet returned an invalid hash. Attempt remains locked for investigation."); return; }
      const sent={...p,txHash}; remember(sent); setPhase("BROADCAST_PENDING");
      for (let i=0;i<60;i++) {
        const result=await verify(sent);
        if (result!=="BROADCAST_PENDING") return;
        await new Promise(r=>setTimeout(r,5000));
      }
      setMsg("Still unconfirmed. Keep the original transaction and re-check; do not send again.");
    } catch { setPhase("ERROR"); setMsg("Service unavailable. Recover any existing attempt before trying again."); }
    finally { busy.current=false; }
  }

  return (
    <section className="min-w-0 border-t border-hairline py-4 md:col-span-2">
      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted">Review &amp; publish batch</h2>
      <div className="mt-3 grid min-w-0 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
        <Row k="Eligible wallets in batch" v={fmt(s.leaves)} />
        <Row k="Verified funded FLOW" v={`${fmt(s.totalFlow)} FLOW`} />
        <Row k="Payout contract FLOW (on-chain)" v={live ? `${fmt(live.balanceFlow)} balance · ${fmt(live.reservedFlow)} reserved on-chain · ${fmt(freeAfter)} unreserved after this batch` : "UNKNOWN"} />
        <Row k="Batch limits" v={`${fmt(s.leaves)}/${fmt(s.publisherConfig?.maxWalletsPerEpoch)} wallets · ${fmt(s.totalFlow)}/${fmt(s.publisherConfig?.maxFlowPerEpoch)} FLOW`} />
        <Row k="Daily limit (24h)" v={`${fmt((s.flowPublishedLast24h ?? 0) + s.totalFlow)}/${fmt(s.publisherConfig?.maxFlowPerDay)} FLOW`} />
        <Row k="Pending / review-held / rejected" v={`${count("PENDING_BELOW_MINIMUM") + count("PENDING_NO_WALLET") + count("PENDING_LIMITS")} / ${count("REVIEW_HELD")} / ${count("REJECTED_HISTORICAL")}`} />
        <Row k="Merkle root" v={s.root ?? "—"} />
        <Row k="Merkle proofs" v={s.root && s.leaves > 0 && s.checks.find((c) => c.id === "PROOFS_VERIFIED")?.pass ? "every proof re-verified against the root" : "none — no batch built"} />
        <Row k="Claim opens / closes" v={s.root && s.claimStartIso ? `${s.claimStartIso.slice(0, 16)} → ${s.claimEndIso?.slice(0, 16)} UTC` : "—"} />
        <Row k="Simulation" v={s.simulation?.ran ? (s.simulation.ok ? "PASS" : "FAIL") : "not run (no publishable batch)"} />
        <Row k="Emergency pause" v={live ? (live.paused ? "PAUSED — publishing blocked" : "not paused") : "UNKNOWN"} />
        <Row k="Queue" v={`${fmt(count("INCLUDED"))} queued · ${fmt(count("PENDING_BELOW_MINIMUM"))} below 1,000 · ${fmt(count("REVIEW_HELD"))} held`} />
        <Row k="Signing" v={`${s.publisherConfig?.mode ?? "ONE_CLICK"} · automatic signing OFF`} />
      </div>
      {states.length > 0 && (
        <details className="mt-2 text-[12px]">
          <summary className="cursor-pointer text-muted">Wallet states ({states.length})</summary>
          {states.map((w) => <Row key={w.account} k={`${w.account} · ${w.state.replaceAll("_", " ")}`} v={`${fmt(w.fundedPoints)} funded · ${fmt(w.alreadySettled)} settled · Δ ${fmt(w.delta)}`} />)}
        </details>
      )}
      {s.signupReconciliation && (
        <details className="mt-2 text-[12px]">
          <summary className="cursor-pointer text-muted">Signup award network attribution</summary>
          <p className="py-1 text-muted-soft">{s.signupReconciliation.rootCause}</p>
          <Row k="Signup rows / points" v={`${s.signupReconciliation.totalRows} / ${fmt(s.signupReconciliation.totalPoints)}`} />
          <Row k="Program funding verified" v={s.signupReconciliation.programFundingVerified ? "YES" : "NO — excluded from funded totals"} />
          <Row k="Counted as Mainnet" v={fmt(s.signupReconciliation.countedAsMainnet)} />
          {s.signupReconciliation.states.map((x) => <Row key={x.state} k={x.state.replaceAll("_", " ")} v={`${x.rows} rows · ${fmt(x.points)} pts`} />)}
        </details>
      )}
      {!pending && !review ? (
        <Button type="button" disabled={!ready || stale || !!pending} onClick={() => setReview(true)} className="mt-3 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-40">Review &amp; Publish</Button>
      ) : !pending && ready && !stale ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3 text-[12.5px]">
          <p className="font-bold">You are about to publish round #{s.epochId} on BOT Mainnet (677).</p>
          <p className="text-muted">{fmt(s.leaves)} wallets will be able to claim {fmt(s.totalFlow)} FLOW from {s.claimStartIso?.slice(0, 16)} to {s.claimEndIso?.slice(0, 16)} UTC. Your wallet will show one publishEpoch call to the payout contract; it moves no tokens and costs only gas. Signer must be {s.signer.address.slice(0, 6)}…{s.signer.address.slice(-4)}.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!ready || stale || !!pending || !["IDLE","READY","CANCELLED","REVERTED"].includes(phase)} onClick={() => void publish()} className="rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground disabled:opacity-40">{phase === "CANCELLED" || phase === "REVERTED" ? "Retry Publication" : "Revalidate & open wallet"}</Button>
            <Button type="button" onClick={() => { setReview(false); }} className="rounded-lg border border-border px-3 py-2">Cancel</Button>
          </div>
        </div>
      ) : null}
      {s.checks.some(c => c.id === 'STORED_CLAIM_WINDOW' && !c.pass) && <p className="mt-2 text-[12px] font-bold text-danger">Stored claim window no longer meets the contract’s minimum publication delay. Nothing submitted. Re-review cannot change the immutable schedule; separately authorized batch replacement is required.</p>}
      {!ready && <p className="mt-2 text-[12px] text-muted">{s.reason ? `Not publishable: ${s.reason.replaceAll("_", " ")}` : "Not publishable."}</p>}
      {msg && <p className="mt-2 text-[12px] font-bold text-danger">{msg}</p>}
      {phase !== "IDLE" && <p className="mt-2 text-[12px] font-bold">{PHASE_COPY[phase]}</p>}
      {pending && phase !== "CONFIRMED_VERIFIED" && <div className="mt-2 space-y-2">
        <Button type="button" variant="outline" onClick={() => void recheck()}>{hash?'Re-check Transaction':'Recover Stuck Batch'}</Button>
        <p className="text-[12px] text-muted">This attempt is locked. Re-checking never opens the wallet or sends another transaction.</p>
      </div>}
      {hash && <a className="mt-1 block break-all font-mono text-[11px] text-primary underline" href={`https://scan.botchain.ai/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a>}
      <details className="mt-3 text-[12px]">
        <summary className="cursor-pointer text-muted">Publish history ({history.length})</summary>
        {history.length === 0 ? <p className="py-1 text-muted-soft">No verified publish outcomes recorded yet.</p>
          : history.map((h, i) => <Row key={i} k={`${h.created_at.slice(0, 16)} · round ${h.object_id.split(":")[1]}`} v={h.action.replace("PUBLISH_", "").replaceAll("_", " ")} />)}
      </details>
      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer text-muted">Automatic publishing — prepared, OFF</summary>
        {AUTONOMOUS_ACTIVATION_REQUIREMENTS.map((r) => <Row key={r.id} k={r.label} v={r.met ? "MET" : "NOT MET"} />)}
      </details>
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-hairline py-1.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="min-w-0 text-muted">{k}</span>
      <span className="min-w-0 break-words font-mono font-bold text-foreground [overflow-wrap:anywhere] sm:text-right">{v}</span>
    </div>
  );
}
