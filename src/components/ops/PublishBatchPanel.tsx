import { useEffect, useRef, useState } from "react";
import { getIdToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PENDING_PUBLICATION_KEY, parsePendingPublication, type PendingPublication } from "@/lib/rewards/publicationVerification";
import { getActiveProvider } from "@/lib/wallet/activeProvider";
import { publisherWalletGate, WALLET_GATE_COPY, AUTONOMOUS_ACTIVATION_REQUIREMENTS, type PublishPhase } from "@/lib/rewards/publishGate";
import type { RewardSolvencyReport } from "@/lib/rewards/rewardSolvency.server";

type S = RewardSolvencyReport["settlement"];
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
const PHASE_COPY: Record<PublishPhase, string> = {
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
  const [recoveryHash, setRecoveryHash] = useState("");
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
      const a = j?.attempts?.find((a: { phase: string }) => a.phase !== "CONFIRMED_VERIFIED");
      if (a) {
        remember({attemptId:a.id,epochId:a.epoch_id,root:a.root,fingerprint:a.fingerprint,txHash:a.tx_hash});
        setPhase(a.tx_hash ? "BROADCAST_PENDING" : "AWAITING_SIGNATURE");
      }
    }
  }
  useEffect(() => {
    let local: PendingPublication | null = null;
    try { local = parsePendingPublication(localStorage.getItem(storageKey)); } catch { /* Unavailable storage. */ }
    setPending(local); setHash(local?.txHash ?? null);
    setPhase(local ? "BROADCAST_PENDING" : "IDLE");
    void loadHistory(true);
  }, [wallet]);
  async function verify(p: PendingPublication) {
    const res = await authed(wallet, "/api/admin/rewards-publish-verify", {method:"POST",body:JSON.stringify(p)}).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !j?.phase) {
      setMsg(j?.error ?? "Verification unavailable — keep this transaction and re-check. Never send it again.");
      return "BROADCAST_PENDING";
    }
    setPhase(j.phase);
    if (j.phase === "CONFIRMED_VERIFIED") { void rebuild(); void loadHistory(); }
    return j.phase as PublishPhase;
  }
  async function recheck() {
    if (!pending || busy.current) return;
    const txHash = hash ?? recoveryHash.trim();
    if (!/^0x[0-9a-f]{64}$/i.test(txHash)) { setMsg("Enter the original transaction hash from your wallet."); return; }
    busy.current = true; setMsg(null);
    try { const p={...pending,txHash}; remember(p); await verify(p); void loadHistory(); }
    finally { busy.current=false; }
  }
  const ready = s.status === "READY_FOR_PUBLISHER_REVIEW" && !!s.tx;
  const states = s.walletStates ?? [];
  const count = (k: string) => states.filter((w) => w.state === k).length;
  const live = s.liveState;
  const freeAfter = live ? live.balanceFlow - live.reservedFlow - s.totalFlow : null;

  async function publish() {
    if (busy.current || pending) return;
    busy.current = true; setMsg(null); setPhase("REVALIDATING");
    try {
      const fresh = (await rebuild()).data?.settlement;
      if (!fresh || fresh.fingerprint !== s.fingerprint || fresh.root !== s.root || !fresh.tx || !fresh.root || !fresh.epochId || !fresh.fingerprint) {
        setPhase("IDLE"); setMsg("Settlement changed during revalidation — review the rebuilt batch."); return;
      }
      const eth = await getActiveProvider();
      if (!eth) { setPhase("IDLE"); setMsg(WALLET_GATE_COPY.NOT_CONNECTED); return; }
      const accounts = (await eth.request({method:"eth_accounts"})) as string[];
      const chainId = parseInt(String(await eth.request({method:"eth_chainId"})),16);
      const gate = publisherWalletGate({connected:accounts[0] ?? null,chainId,requiredSigner:fresh.signer.address,ready:true,stale:false,simulationOk:!!fresh.simulation?.ok});
      if (gate !== "OK" || accounts[0]?.toLowerCase() !== wallet?.toLowerCase()) { setPhase("IDLE"); setMsg(WALLET_GATE_COPY[gate] === WALLET_GATE_COPY.OK ? "Reconnect your bound operator wallet." : WALLET_GATE_COPY[gate]); return; }
      const locked = await authed(wallet,"/api/admin/rewards-publish-verify",{method:"PUT",body:JSON.stringify({epochId:fresh.epochId,root:fresh.root,fingerprint:fresh.fingerprint})});
      const lock = await locked.json();
      if (!locked.ok || !lock.attemptId) { setPhase("IDLE"); setMsg(lock.error ?? "Publication blocked."); void loadHistory(true); return; }
      const p: PendingPublication = {attemptId:lock.attemptId,epochId:fresh.epochId,root:fresh.root,fingerprint:fresh.fingerprint,txHash:null};
      remember(p); setPhase("AWAITING_SIGNATURE");
      let txHash: string;
      try { txHash=String(await eth.request({method:"eth_sendTransaction",params:[{from:accounts[0],to:fresh.tx.to,data:fresh.tx.data,value:"0x0"}]})); }
      catch (e) { setPhase((e as {code?:number}).code===4001 ? "REJECTED" : "ERROR"); setMsg("Attempt locked. Recover the original transaction if one was sent; no automatic resend."); return; }
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
    <section className="min-w-0 rounded-2xl border border-hairline bg-card p-3.5 sm:p-4 md:col-span-2">
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
      {!review ? (
        <Button type="button" disabled={!ready || stale || !!pending} onClick={() => setReview(true)} className="mt-3 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-40">Review &amp; Publish</Button>
      ) : (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3 text-[12.5px]">
          <p className="font-bold">You are about to publish round #{s.epochId} on BOT Mainnet (677).</p>
          <p className="text-muted">{fmt(s.leaves)} wallets will be able to claim {fmt(s.totalFlow)} FLOW from {s.claimStartIso?.slice(0, 16)} to {s.claimEndIso?.slice(0, 16)} UTC. Your wallet will show one publishEpoch call to the payout contract; it moves no tokens and costs only gas. Signer must be {s.signer.address.slice(0, 6)}…{s.signer.address.slice(-4)}.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!!pending || phase !== "IDLE"} onClick={() => void publish()} className="rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground disabled:opacity-40">Revalidate &amp; open wallet</Button>
            <Button type="button" onClick={() => { setReview(false); }} className="rounded-lg border border-border px-3 py-2">Cancel</Button>
          </div>
        </div>
      )}
      {!ready && <p className="mt-2 text-[12px] text-muted">{s.reason ? `Not publishable: ${s.reason.replaceAll("_", " ")}` : "Not publishable."}</p>}
      {msg && <p className="mt-2 text-[12px] font-bold text-danger">{msg}</p>}
      {phase !== "IDLE" && <p className="mt-2 text-[12px] font-bold">{PHASE_COPY[phase]}</p>}
      {pending && phase !== "CONFIRMED_VERIFIED" && <div className="mt-2 space-y-2">
        {!hash && <label className="block text-[12px]">Original transaction hash<input aria-label="Original transaction hash" value={recoveryHash} onChange={e=>setRecoveryHash(e.target.value)} className="mt-1 block w-full min-w-0 rounded border border-border bg-background p-2 font-mono" /></label>}
        <Button type="button" variant="outline" onClick={() => void recheck()}>Re-check transaction</Button>
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
