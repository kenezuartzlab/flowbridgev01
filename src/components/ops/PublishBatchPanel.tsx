import { useState } from "react";
import { getIdToken } from "@/lib/auth";
import { getActiveProvider } from "@/lib/wallet/activeProvider";
import { publisherWalletGate, WALLET_GATE_COPY, type PublishPhase } from "@/lib/rewards/publishGate";
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

async function authed(path: string, init?: RequestInit) {
  const token = await getIdToken();
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" } });
}

export function PublishBatchPanel({ s, rebuild, stale }: { s: S; rebuild: () => Promise<{ data?: RewardSolvencyReport }>; stale: boolean }) {
  const [phase, setPhase] = useState<PublishPhase>("IDLE");
  const [review, setReview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const ready = s.status === "READY_FOR_PUBLISHER_REVIEW" && !!s.tx;
  const states = s.walletStates ?? [];
  const count = (k: string) => states.filter((w) => w.state === k).length;
  const live = s.liveState;
  const freeAfter = live ? live.balanceFlow - live.reservedFlow - s.totalFlow : null;

  async function publish() {
    setMsg(null);
    setPhase("REVALIDATING");
    const fresh = (await rebuild()).data?.settlement;
    if (!fresh || fresh.fingerprint !== s.fingerprint || fresh.root !== s.root || !fresh.tx) {
      setPhase("IDLE"); setMsg("Settlement changed during revalidation — review the rebuilt batch."); return;
    }
    const eth = await getActiveProvider();
    if (!eth) { setPhase("IDLE"); setMsg(WALLET_GATE_COPY.NOT_CONNECTED); return; }
    const accounts = (await eth.request({ method: "eth_requestAccounts" }).catch(() => [])) as string[];
    let chainId = parseInt(String(await eth.request({ method: "eth_chainId" }).catch(() => "0x0")), 16);
    if (accounts[0] && chainId !== 677) {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2a5" }] }).catch(() => null);
      chainId = parseInt(String(await eth.request({ method: "eth_chainId" }).catch(() => "0x0")), 16);
    }
    const gate = publisherWalletGate({ connected: accounts[0] ?? null, chainId, requiredSigner: fresh.signer.address, ready: true, stale: false, simulationOk: !!fresh.simulation?.ok });
    if (gate !== "OK") { setPhase("IDLE"); setMsg(WALLET_GATE_COPY[gate]); return; }
    setPhase("AWAITING_SIGNATURE");
    let txHash: string;
    try {
      txHash = String(await eth.request({ method: "eth_sendTransaction", params: [{ from: accounts[0], to: fresh.tx.to, data: fresh.tx.data, value: "0x0" }] }));
    } catch (e) {
      const code = (e as { code?: number }).code;
      setPhase(code === 4001 ? "REJECTED" : "ERROR"); return;
    }
    setHash(txHash);
    setPhase("BROADCAST_PENDING");
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const res = await authed("/api/admin/rewards-publish-verify", { method: "POST", body: JSON.stringify({ epochId: fresh.epochId, root: fresh.root, txHash }) }).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (j?.phase && j.phase !== "BROADCAST_PENDING") {
        setPhase(j.phase);
        if (j.phase === "CONFIRMED_VERIFIED") void rebuild();
        return;
      }
    }
    setMsg("Still unconfirmed after 5 minutes. Not reported as published; re-check the transaction.");
  }

  return (
    <section className="min-w-0 rounded-2xl border border-hairline bg-card p-3.5 sm:p-4 md:col-span-2">
      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted">Review &amp; publish batch</h2>
      <div className="mt-3 grid min-w-0 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
        <Row k="Eligible wallets in batch" v={fmt(s.leaves)} />
        <Row k="Verified funded FLOW" v={`${fmt(s.totalFlow)} FLOW`} />
        <Row k="Reserve coverage" v={live ? `${fmt(live.balanceFlow)} balance · ${fmt(live.reservedFlow)} reserved · ${fmt(freeAfter)} free after` : "UNKNOWN"} />
        <Row k="Batch limits" v={`${fmt(s.leaves)}/${fmt(s.publisherConfig?.maxWalletsPerEpoch)} wallets · ${fmt(s.totalFlow)}/${fmt(s.publisherConfig?.maxFlowPerEpoch)} FLOW`} />
        <Row k="Daily limit (24h)" v={`${fmt((s.flowPublishedLast24h ?? 0) + s.totalFlow)}/${fmt(s.publisherConfig?.maxFlowPerDay)} FLOW`} />
        <Row k="Pending / review-held / rejected" v={`${count("PENDING_BELOW_MINIMUM") + count("PENDING_NO_WALLET") + count("PENDING_LIMITS")} / ${count("REVIEW_HELD")} / ${count("REJECTED_HISTORICAL")}`} />
        <Row k="Merkle root" v={s.root ?? "—"} />
        <Row k="Proofs" v={s.checks.find((c) => c.id === "PROOFS_VERIFIED")?.pass ? "all self-verified" : "—"} />
        <Row k="Claim opens / closes" v={s.root && s.claimStartIso ? `${s.claimStartIso.slice(0, 16)} → ${s.claimEndIso?.slice(0, 16)} UTC` : "—"} />
        <Row k="Simulation" v={s.simulation?.ran ? (s.simulation.ok ? "PASS" : "FAIL") : "not run (no publishable batch)"} />
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
        <button type="button" disabled={!ready || stale} onClick={() => setReview(true)} className="mt-3 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-40">Review &amp; Publish</button>
      ) : (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3 text-[12.5px]">
          <p className="font-bold">You are about to publish round #{s.epochId} on BOT Mainnet (677).</p>
          <p className="text-muted">{fmt(s.leaves)} wallets will be able to claim {fmt(s.totalFlow)} FLOW from {s.claimStartIso?.slice(0, 16)} to {s.claimEndIso?.slice(0, 16)} UTC. Your wallet will show one publishEpoch call to the payout contract; it moves no tokens and costs only gas. Signer must be {s.signer.address.slice(0, 6)}…{s.signer.address.slice(-4)}.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={phase !== "IDLE" && phase !== "REJECTED" && phase !== "ERROR"} onClick={() => void publish()} className="rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground disabled:opacity-40">Revalidate &amp; open wallet</button>
            <button type="button" onClick={() => { setReview(false); setPhase("IDLE"); }} className="rounded-lg border border-border px-3 py-2">Cancel</button>
          </div>
        </div>
      )}
      {!ready && <p className="mt-2 text-[12px] text-muted">{s.reason ? `Not publishable: ${s.reason.replaceAll("_", " ")}` : "Not publishable."}</p>}
      {msg && <p className="mt-2 text-[12px] font-bold text-danger">{msg}</p>}
      {phase !== "IDLE" && <p className="mt-2 text-[12px] font-bold">{PHASE_COPY[phase]}</p>}
      {hash && <a className="mt-1 block break-all font-mono text-[11px] text-primary underline" href={`https://scan.botchain.ai/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a>}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-0">
      <span className="min-w-0 text-muted">{k}</span>
      <span className="min-w-0 break-all text-right font-mono font-bold text-foreground">{v}</span>
    </div>
  );
}
