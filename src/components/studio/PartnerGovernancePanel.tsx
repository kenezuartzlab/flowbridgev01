/**
 * FlowBridge V14.1 — internal partner review queue (rendered inside /sets).
 *
 * Reviewers act on the FROZEN submission snapshot, not on a partner's live
 * draft. Approve → Publish materializes exactly that snapshot into the canonical
 * campaign engine. Organization verification stays Super-Admin-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  fetchPartnerGovernance,
  runCampaignGovernanceAction,
  runOrgGovernanceAction,
  type GovernanceAuditEvent,
  type GovernanceCampaign,
  type GovernanceOrg,
} from "@/lib/partner/governanceApi";
import { ORG_STATUS_LABEL, REVIEW_STATE_LABEL } from "@/lib/partner/partnerTypes";

const cardCls =
  "rounded-2xl border border-white/10 bg-[#0D1C2A]/70 p-4 space-y-3 font-mono text-[13px]";
const labelCls = "text-[11px] uppercase tracking-widest text-[#C5C1B9] font-black";
const btnPrimary =
  "px-3 py-2 rounded-xl bg-[#32FF8B] text-[#010C1B] text-[11px] font-black uppercase tracking-widest cursor-pointer hover:bg-[#1FFF7D] transition disabled:opacity-50";
const btnGhost =
  "px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/10 transition disabled:opacity-50";
const inputCls =
  "w-full bg-[#010C1B] border border-white/15 rounded-xl px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#32FF8B]/50";

const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

type CampaignAction = "approve" | "request_changes" | "publish" | "pause" | "end";

export function PartnerGovernancePanel({ wallet }: { wallet: string }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [role, setRole] = useState<"super_admin" | "internal_operator">("internal_operator");
  const [orgs, setOrgs] = useState<GovernanceOrg[]>([]);
  const [campaigns, setCampaigns] = useState<GovernanceCampaign[]>([]);
  const [audit, setAudit] = useState<GovernanceAuditEvent[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPartnerGovernance(wallet);
      setRole(data.role);
      setOrgs(data.organizations);
      setCampaigns(data.campaigns);
      setAudit(data.audit);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load governance data.");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  const queue = useMemo(
    () => campaigns.filter((c) => !c.isSystemOrg && c.reviewState === "submitted"),
    [campaigns],
  );
  const approved = useMemo(
    () => campaigns.filter((c) => !c.isSystemOrg && c.reviewState === "approved"),
    [campaigns],
  );
  const running = useMemo(
    () =>
      campaigns.filter(
        (c) => !c.isSystemOrg && ["published", "paused", "changes_requested"].includes(c.reviewState),
      ),
    [campaigns],
  );
  const pendingOrgs = useMemo(() => orgs.filter((o) => !o.isSystem && o.status === "pending"), [orgs]);

  const act = async (campaign: GovernanceCampaign, action: CampaignAction) => {
    const note = notes[campaign.campaignId]?.trim();
    if (action === "request_changes" && !note) {
      setError("Add a reviewer note explaining the required change.");
      return;
    }
    setBusy(`${campaign.campaignId}:${action}`);
    setError(null);
    setNotice(null);
    try {
      await runCampaignGovernanceAction(wallet, campaign.campaignId, action, note || undefined);
      setNotes((prev) => ({ ...prev, [campaign.campaignId]: "" }));
      setNotice(`${campaign.name}: ${action.replace("_", " ")} recorded.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const orgAct = async (
    org: GovernanceOrg,
    action: "verify_org" | "reject_org" | "suspend_org" | "reinstate_org",
  ) => {
    setBusy(`${org.orgId}:${action}`);
    setError(null);
    try {
      await runOrgGovernanceAction(wallet, org.orgId, action, notes[org.orgId]?.trim() || undefined);
      setNotice(`${org.name}: ${action.replace("_", " ")} recorded.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className={cardCls}>
        <div className="flex items-center gap-2 text-[#C5C1B9]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading partner review queue…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#32FF8B]">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-[11px] font-black uppercase tracking-widest">
              {role === "super_admin" ? "Super Admin" : "Internal Operator"}
            </span>
          </div>
          <button type="button" onClick={() => void load()} className={btnGhost}>
            <RefreshCw className="mr-1 -mt-0.5 inline h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-[#C5C1B9]">
          Review acts on the frozen submission snapshot. Publishing materializes exactly that
          snapshot into the live campaign engine — partners can never publish, pause or end.
          {role === "internal_operator"
            ? " Organization verification and suspension require a Super Admin."
            : ""}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="In review" value={queue.length} />
          <Stat label="Approved" value={approved.length} />
          <Stat label="Live / paused" value={running.length} />
          <Stat label="Orgs pending" value={pendingOrgs.length} />
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 font-mono text-[12px] text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-start gap-2 rounded-2xl border border-[#32FF8B]/30 bg-[#32FF8B]/10 p-3 font-mono text-[12px] text-[#32FF8B]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
        </div>
      ) : null}

      <Section title="Submission queue" empty="No partner submissions are waiting for review.">
        {queue.map((c) => (
          <CampaignReviewCard
            key={c.campaignId}
            campaign={c}
            note={notes[c.campaignId] ?? ""}
            onNote={(v) => setNotes((prev) => ({ ...prev, [c.campaignId]: v }))}
            busy={busy}
            actions={["approve", "request_changes"]}
            onAction={act}
          />
        ))}
      </Section>

      <Section title="Approved — ready to publish" empty="Nothing approved is awaiting publication.">
        {approved.map((c) => (
          <CampaignReviewCard
            key={c.campaignId}
            campaign={c}
            note={notes[c.campaignId] ?? ""}
            onNote={(v) => setNotes((prev) => ({ ...prev, [c.campaignId]: v }))}
            busy={busy}
            actions={["publish", "request_changes", "end"]}
            onAction={act}
          />
        ))}
      </Section>

      <Section title="Live, paused and returned" empty="No partner campaigns are running.">
        {running.map((c) => (
          <CampaignReviewCard
            key={c.campaignId}
            campaign={c}
            note={notes[c.campaignId] ?? ""}
            onNote={(v) => setNotes((prev) => ({ ...prev, [c.campaignId]: v }))}
            busy={busy}
            actions={
              c.reviewState === "published"
                ? ["pause", "end"]
                : c.reviewState === "paused"
                  ? ["publish", "end"]
                  : []
            }
            onAction={act}
          />
        ))}
      </Section>

      <div className={cardCls}>
        <div className={labelCls}>Organizations</div>
        {orgs.filter((o) => !o.isSystem).length === 0 ? (
          <p className="text-[12px] text-[#C5C1B9]">No partner organizations yet.</p>
        ) : (
          <div className="space-y-2">
            {orgs
              .filter((o) => !o.isSystem)
              .map((o) => (
                <div key={o.orgId} className="rounded-xl border border-white/10 bg-[#010C1B]/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-black text-white">{o.name}</div>
                      <div className="text-[11px] text-[#C5C1B9]">
                        @{o.slug} · {ORG_STATUS_LABEL[o.status]} · {o.memberCount} member(s) ·{" "}
                        {o.campaignCount} campaign(s) · {o.pendingReviewCount} in review
                      </div>
                    </div>
                    {role === "super_admin" ? (
                      <div className="flex flex-wrap gap-2">
                        {o.status !== "verified" ? (
                          <button
                            type="button"
                            className={btnPrimary}
                            disabled={busy === `${o.orgId}:verify_org`}
                            onClick={() => void orgAct(o, "verify_org")}
                          >
                            Verify
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={busy === `${o.orgId}:suspend_org`}
                            onClick={() => void orgAct(o, "suspend_org")}
                          >
                            Suspend
                          </button>
                        )}
                        {o.status === "pending" ? (
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={busy === `${o.orgId}:reject_org`}
                            onClick={() => void orgAct(o, "reject_org")}
                          >
                            Reject
                          </button>
                        ) : null}
                        {o.status === "suspended" ? (
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={busy === `${o.orgId}:reinstate_org`}
                            onClick={() => void orgAct(o, "reinstate_org")}
                          >
                            Reinstate
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest text-[#C5C1B9]/70">
                        Super Admin only
                      </span>
                    )}
                  </div>
                  {role === "super_admin" ? (
                    <input
                      className={`${inputCls} mt-2`}
                      placeholder="Risk note (stored on the audit trail)"
                      value={notes[o.orgId] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [o.orgId]: e.target.value }))}
                    />
                  ) : null}
                  {o.riskNotes ? (
                    <p className="mt-2 text-[11px] text-[#C5C1B9]">Note: {o.riskNotes}</p>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </div>

      <div className={cardCls}>
        <div className={labelCls}>Audit trail</div>
        {audit.length === 0 ? (
          <p className="text-[12px] text-[#C5C1B9]">No privileged actions recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {audit.map((a) => (
              <li key={a.eventId} className="text-[11px] text-[#C5C1B9]">
                <span className="text-white">{a.action}</span> · {a.objectType} {a.objectId} ·{" "}
                {a.actorEmail ?? "internal"} ({a.actorRole}) · {fmtDate(a.createdAt)}
                {a.reason ? ` · "${a.reason}"` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#010C1B]/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-[#C5C1B9]">{label}</div>
      <div className="text-lg font-black text-white">{value}</div>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className={cardCls}>
      <div className={labelCls}>{title}</div>
      {hasChildren ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <p className="text-[12px] text-[#C5C1B9]">{empty}</p>
      )}
    </div>
  );
}

function CampaignReviewCard({
  campaign,
  note,
  onNote,
  busy,
  actions,
  onAction,
}: {
  campaign: GovernanceCampaign;
  note: string;
  onNote: (v: string) => void;
  busy: string | null;
  actions: CampaignAction[];
  onAction: (c: GovernanceCampaign, a: CampaignAction) => void;
}) {
  const pending = campaign.pendingRevision;
  return (
    <div className="rounded-xl border border-white/10 bg-[#010C1B]/60 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-black text-white">{campaign.name}</div>
          <div className="text-[11px] text-[#C5C1B9]">
            {campaign.orgName} · @{campaign.slug} · {REVIEW_STATE_LABEL[campaign.reviewState]}
            {pending ? ` · revision ${pending.revision}` : ""}
          </div>
        </div>
        <div className="text-right text-[11px] text-[#C5C1B9]">
          <div>Budget {campaign.ptsBudget.toLocaleString()} PTS</div>
          <div>Max/wallet {campaign.maxPtsPerWallet.toLocaleString()} PTS</div>
        </div>
      </div>

      <div className="grid gap-1 text-[11px] text-[#C5C1B9] sm:grid-cols-2">
        <div>Submitted {fmtDate(pending?.submittedAt ?? campaign.submittedAt)}</div>
        <div>
          Window {fmtDate(campaign.startsAt)} → {fmtDate(campaign.endsAt)}
        </div>
        <div>
          {campaign.taskCount} task(s) · {campaign.completionCount} completion(s)
        </div>
        <div>
          Snapshot {pending?.fingerprint ?? "—"}
          {campaign.publishedRevision ? ` · live rev ${campaign.publishedRevision}` : ""}
        </div>
      </div>

      {pending?.changes?.length ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <div className="text-[10px] uppercase tracking-widest text-[#C5C1B9]">
            Changes in this revision
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-white">
            {pending.changes.map((c, i) => (
              <li key={i}>· {c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {campaign.ruleSummary.length ? (
        <div className="text-[11px] text-[#C5C1B9]">
          Verification: {campaign.ruleSummary.slice(0, 8).join(" · ")}
        </div>
      ) : null}

      {campaign.rewardBlockReason ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          {campaign.rewardBlockReason}
        </div>
      ) : null}

      {campaign.reviewNote ? (
        <div className="text-[11px] text-[#C5C1B9]">Last note: “{campaign.reviewNote}”</div>
      ) : null}

      {actions.length ? (
        <>
          <textarea
            className={inputCls}
            rows={2}
            placeholder="Reviewer note (required when requesting changes)"
            value={note}
            onChange={(e) => onNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a}
                type="button"
                className={a === "approve" || a === "publish" ? btnPrimary : btnGhost}
                disabled={busy === `${campaign.campaignId}:${a}`}
                onClick={() => onAction(campaign, a)}
              >
                {busy === `${campaign.campaignId}:${a}` ? "Working…" : a.replace("_", " ")}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
