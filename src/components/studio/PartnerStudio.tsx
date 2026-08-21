/**
 * FlowBridge V14 — Partner Studio workspace (external builder surface).
 *
 * This is NOT the internal /sets console: it only ever talks to /api/studio/*,
 * which scopes every read/write to the caller's organization membership. The
 * builder can only emit supported canonical rule types and Campaign PTS rewards;
 * publishing is impossible from here by construction.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { initAuth, type AppUser } from "@/lib/auth";
import { SignInButton } from "@/components/auth/SignInButton";
import {
  STUDIO_ACTION_TYPES,
  STUDIO_CHAIN_OPTIONS,
  STUDIO_TEMPLATES,
  STUDIO_TOKEN_OPTIONS,
  normalizeSlug,
  validateStudioCampaign,
  type StudioCampaignInput,
  type StudioTaskInput,
} from "@/lib/campaign/campaignStudio";
import {
  applyForPartnerOrg,
  deleteStudioDraft,
  fetchStudioCampaign,
  fetchStudioCampaigns,
  fetchStudioSession,
  saveStudioDraft,
  submitStudioCampaign,
} from "@/lib/partner/studioApi";
import {
  ORG_STATUS_LABEL,
  PARTNER_EDITABLE_STATES,
  REVIEW_STATE_LABEL,
  REWARD_TYPE_LABEL,
  canSubmit,
  normalizeOrgSlug,
  orgMayOperate,
  rewardTypeBlocksPublish,
  type CampaignRewardType,
  type CampaignReviewEvent,
  type CampaignReviewState,
  type PartnerCampaignSummary,
  type PartnerMemberRole,
  type PartnerOrg,
} from "@/lib/partner/partnerTypes";

const inputCls =
  "w-full min-h-[40px] rounded-xl border border-hairline bg-card-alt px-3 text-[12.5px] text-foreground outline-none transition focus:border-primary/60";
const labelCls = "block font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted";
const btnPrimary =
  "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground transition hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-hairline px-3.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition hover:border-primary/40 hover:text-foreground disabled:opacity-50";

const ACTIVITY_KINDS = ["BRIDGE_SUBMITTED", "BRIDGE_COMPLETED", "SWAP_EXECUTED"] as const;

const toLocalInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

function StatePill({ state }: { state: CampaignReviewState }) {
  const tone =
    state === "published"
      ? "border-success/35 bg-success/10 text-success"
      : state === "submitted"
        ? "border-primary/40 bg-primary/10 text-primary"
        : state === "changes_requested"
          ? "border-warning/35 bg-warning/10 text-warning"
          : state === "approved"
            ? "border-success/30 bg-success/8 text-success"
            : "border-hairline text-muted";
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.1em] ${tone}`}
    >
      {REVIEW_STATE_LABEL[state]}
    </span>
  );
}

/* ------------------------------ studio shell ------------------------------ */

export function PartnerStudio() {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  const [orgs, setOrgs] = useState<PartnerOrg[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<PartnerMemberRole>("partner_editor");
  const [campaigns, setCampaigns] = useState<PartnerCampaignSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let mounted = true;
    initAuth((u) => mounted && setUser(u));
    return () => {
      mounted = false;
    };
  }, []);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await fetchStudioSession();
      setOrgs(session.orgs);
      setOrgId((prev) => prev ?? session.orgs[0]?.orgId ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Studio.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCampaigns = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStudioCampaigns(id);
      setCampaigns(data.campaigns);
      setRole(data.role);
      setOrgs((prev) => prev.map((o) => (o.orgId === id ? { ...o, ...data.org, role: data.role } : o)));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadSession();
  }, [user, loadSession]);

  useEffect(() => {
    if (user && orgId) void loadCampaigns(orgId);
  }, [user, orgId, loadCampaigns]);

  const org = useMemo(() => orgs.find((o) => o.orgId === orgId) ?? null, [orgs, orgId]);

  if (user === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fb-surface space-y-3 p-6 text-center">
        <ShieldCheck className="mx-auto h-6 w-6 text-primary" aria-hidden />
        <h2 className="text-[17px] font-black">Partner Studio</h2>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Sign in to manage your organization&apos;s FlowBridge campaigns. Studio is separate from
          FlowBridge internal administration.
        </p>
        <SignInButton />
      </div>
    );
  }

  if (!loading && orgs.length === 0) {
    return <OrgApplicationCard onCreated={(o) => { setOrgs([o]); setOrgId(o.orgId); }} />;
  }

  if (editing || creating) {
    return (
      <CampaignBuilder
        orgId={orgId!}
        role={role}
        campaignId={editing}
        onClose={(reload) => {
          setEditing(null);
          setCreating(false);
          if (reload && orgId) void loadCampaigns(orgId);
        }}
      />
    );
  }

  const grouped = {
    live: campaigns.filter((c) => c.reviewState === "published"),
    review: campaigns.filter((c) =>
      ["submitted", "approved", "changes_requested"].includes(c.reviewState),
    ),
    drafts: campaigns.filter((c) => c.reviewState === "draft"),
    closed: campaigns.filter((c) => ["paused", "ended"].includes(c.reviewState)),
  };

  return (
    <div className="space-y-5">
      <section className="fb-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="fb-eyebrow">Partner workspace</p>
            <h1 className="mt-1 truncate text-[20px] font-black leading-tight">
              {org?.name ?? "Studio"}
            </h1>
            <p className="mt-1 text-[12px] text-muted">
              @{org?.slug} · {org ? ORG_STATUS_LABEL[org.status] : ""} ·{" "}
              {role === "partner_admin" ? "Partner Admin" : "Partner Editor"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnGhost} onClick={() => orgId && loadCampaigns(orgId)}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={!org || !orgMayOperate(org.status)}
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Create campaign
            </button>
          </div>
        </div>

        {orgs.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {orgs.map((o) => (
              <button
                key={o.orgId}
                type="button"
                onClick={() => setOrgId(o.orgId)}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-bold ${
                  o.orgId === orgId
                    ? "border-primary/45 bg-primary/12 text-primary"
                    : "border-hairline text-muted"
                }`}
              >
                <Building2 className="h-3 w-3" aria-hidden />
                {o.name}
              </button>
            ))}
          </div>
        )}

        {org && !orgMayOperate(org.status) && (
          <p className="mt-3 rounded-xl border border-warning/35 bg-warning/8 p-3 text-[12px] leading-relaxed text-warning">
            {org.status === "suspended"
              ? "This organization is suspended. Campaigns are hidden from Explore and cannot be edited."
              : "FlowBridge is verifying this organization. You can explore Studio, but campaigns can only be submitted once verification completes."}
          </p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Live" value={grouped.live.length} />
        <Stat label="In review" value={grouped.review.length} />
        <Stat label="Drafts" value={grouped.drafts.length} />
        <Stat
          label="Verified completions"
          value={campaigns.reduce((s, c) => s + c.completionCount, 0)}
        />
      </div>

      {error && (
        <p className="rounded-xl border border-danger/35 bg-danger/8 p-3 text-[12px] text-danger">
          {error}
        </p>
      )}

      {(["review", "live", "drafts", "closed"] as const).map((key) =>
        grouped[key].length ? (
          <section key={key}>
            <p className="fb-eyebrow mb-2 px-1">
              {key === "review"
                ? "Awaiting FlowBridge"
                : key === "live"
                  ? "Live on Explore"
                  : key === "drafts"
                    ? "Drafts"
                    : "Paused / ended"}
            </p>
            <ul className="space-y-2.5">
              {grouped[key].map((c) => (
                <li key={c.campaignId}>
                  <CampaignRow
                    campaign={c}
                    role={role}
                    onEdit={() => setEditing(c.campaignId)}
                    onAction={async (action) => {
                      if (!orgId) return;
                      setError(null);
                      try {
                        await submitStudioCampaign(orgId, c.campaignId, action);
                        await loadCampaigns(orgId);
                      } catch (e: any) {
                        setError(e?.message ?? "Action failed");
                      }
                    }}
                    onDelete={async () => {
                      if (!orgId) return;
                      setError(null);
                      try {
                        await deleteStudioDraft(orgId, c.campaignId);
                        await loadCampaigns(orgId);
                      } catch (e: any) {
                        setError(e?.message ?? "Delete failed");
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      {!loading && campaigns.length === 0 && (
        <p className="fb-surface p-6 text-center text-[12.5px] text-muted">
          No campaigns yet. Start with <strong>Create campaign</strong> — every campaign is reviewed
          by FlowBridge before it appears in{" "}
          <Link to="/campaigns" className="font-bold text-primary">
            Explore
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="fb-surface p-3.5">
      <p className={labelCls}>{label}</p>
      <p className="mt-1 font-mono text-[19px] font-black tabular-nums">{value}</p>
    </div>
  );
}

function CampaignRow({
  campaign,
  role,
  onEdit,
  onAction,
  onDelete,
}: {
  campaign: PartnerCampaignSummary;
  role: PartnerMemberRole;
  onEdit: () => void;
  onAction: (action: "submit" | "withdraw") => void;
  onDelete: () => void;
}) {
  const editable = PARTNER_EDITABLE_STATES.includes(campaign.reviewState);
  return (
    <div className="fb-surface space-y-2.5 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatePill state={campaign.reviewState} />
        <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
          {REWARD_TYPE_LABEL[campaign.rewardType]}
        </span>
        <span className="font-mono text-[9.5px] text-muted">rev {campaign.revision}</span>
      </div>
      <p className="truncate text-[14.5px] font-black">{campaign.name}</p>
      <p className="font-mono text-[10px] text-muted">
        {campaign.taskCount} task(s) · {campaign.totalPoints} PTS · {campaign.completionCount}{" "}
        verified completion(s)
      </p>
      {campaign.reviewNote && (
        <p className="rounded-xl border border-warning/30 bg-warning/8 p-2.5 text-[12px] leading-relaxed text-warning">
          Review note: {campaign.reviewNote}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhost} onClick={onEdit}>
          {editable ? "Edit" : "View"}
        </button>
        {editable && canSubmit(role) && (
          <button type="button" className={btnPrimary} onClick={() => onAction("submit")}>
            <Send className="h-3.5 w-3.5" aria-hidden />
            Submit for review
          </button>
        )}
        {campaign.reviewState === "submitted" && canSubmit(role) && (
          <button type="button" className={btnGhost} onClick={() => onAction("withdraw")}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Withdraw
          </button>
        )}
        {campaign.reviewState === "draft" && campaign.completionCount === 0 && canSubmit(role) && (
          <button type="button" className={btnGhost} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------- org application ---------------------------- */

function OrgApplicationCard({ onCreated }: { onCreated: (org: PartnerOrg) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fb-surface space-y-3 p-5">
      <p className="fb-eyebrow">Apply for Studio access</p>
      <h2 className="text-[18px] font-black leading-tight">Bring your project to FlowBridge</h2>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Create your partner organization. FlowBridge verifies every organization before campaigns can
        be submitted for review — no anonymous instant publishing.
      </p>
      <Field label="Project / organization name">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slug) setSlug(normalizeOrgSlug(e.target.value));
          }}
          maxLength={80}
        />
      </Field>
      <Field label="Handle" hint="Used in Studio URLs and review records.">
        <input
          className={inputCls}
          value={slug}
          onChange={(e) => setSlug(normalizeOrgSlug(e.target.value))}
        />
      </Field>
      <Field label="Website (optional)">
        <input
          className={inputCls}
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://"
        />
      </Field>
      <Field label="What are you building? (optional)">
        <textarea
          className={`${inputCls} min-h-[92px] py-2`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={600}
        />
      </Field>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <button
        type="button"
        className={btnPrimary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const org = await applyForPartnerOrg({
              name,
              slug,
              website: website || undefined,
              description: description || undefined,
            });
            onCreated(org);
          } catch (e: any) {
            setError(e?.message ?? "Application failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Submit application
      </button>
    </div>
  );
}

/* ----------------------------- campaign builder ---------------------------- */

const STEPS = ["Basics", "Tasks", "Rewards", "Schedule", "Preview"] as const;
const DAY = 86_400_000;

function emptyDraft(): StudioCampaignInput {
  const now = Date.now();
  return {
    slug: "",
    name: "",
    description: null,
    status: "draft",
    startsAt: now,
    endsAt: now + 30 * DAY,
    tasks: [],
  };
}

function CampaignBuilder({
  orgId,
  role,
  campaignId,
  onClose,
}: {
  orgId: string;
  role: PartnerMemberRole;
  campaignId: string | null;
  onClose: (reload: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<StudioCampaignInput>(emptyDraft);
  const [rewardType, setRewardType] = useState<CampaignRewardType>("campaign_pts");
  const [savedId, setSavedId] = useState<string | null>(campaignId);
  const [readOnly, setReadOnly] = useState(false);
  const [events, setEvents] = useState<CampaignReviewEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    let mounted = true;
    (async () => {
      try {
        const data = await fetchStudioCampaign(orgId, campaignId);
        if (!mounted) return;
        setDraft(data.definition);
        setRewardType(data.summary.rewardType);
        setEvents(data.reviewEvents);
        setReadOnly(!PARTNER_EDITABLE_STATES.includes(data.summary.reviewState));
      } catch (e: any) {
        setError(e?.message ?? "Failed to load campaign");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [orgId, campaignId]);

  const errors = useMemo(() => validateStudioCampaign(draft), [draft]);
  const rewardBlock = rewardTypeBlocksPublish(rewardType);

  const patch = (p: Partial<StudioCampaignInput>) => setDraft((d) => ({ ...d, ...p }));
  const patchTask = (i: number, p: Partial<StudioTaskInput>) =>
    setDraft((d) => ({
      ...d,
      tasks: d.tasks.map((t, ti) => (ti === i ? { ...t, ...p } : t)),
    }));

  const save = async (): Promise<string | null> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveStudioDraft(orgId, { ...draft, rewardType }, savedId ?? undefined);
      setSavedId(saved.campaignId);
      setNotice("Draft saved.");
      return saved.campaignId;
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={btnGhost} onClick={() => onClose(true)}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Studio
        </button>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <button type="button" className={btnGhost} disabled={busy} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" aria-hidden />
              Save draft
            </button>
          )}
          {!readOnly && canSubmit(role) && (
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || errors.length > 0}
              onClick={async () => {
                const id = await save();
                if (!id) return;
                setBusy(true);
                try {
                  await submitStudioCampaign(orgId, id, "submit");
                  onClose(true);
                } catch (e: any) {
                  setError(e?.message ?? "Submit failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              Submit for review
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] font-black uppercase tracking-[0.08em] ${
              i === step
                ? "border-primary/45 bg-primary/12 text-primary"
                : "border-hairline text-muted"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {readOnly && (
        <p className="rounded-xl border border-hairline bg-card-alt p-3 text-[12px] leading-relaxed text-muted">
          This campaign is locked while FlowBridge reviews or runs it. Published rules are immutable
          snapshots — ask FlowBridge for a new reviewable revision to change them.
        </p>
      )}

      {step === 0 && (
        <section className="fb-surface space-y-3 p-4">
          <Field label="Campaign name">
            <input
              className={inputCls}
              disabled={readOnly}
              value={draft.name}
              onChange={(e) => {
                const name = e.target.value;
                patch({ name, slug: draft.slug || normalizeSlug(name) });
              }}
              maxLength={120}
            />
          </Field>
          <Field label="Handle" hint="Public campaign URL segment.">
            <input
              className={inputCls}
              disabled={readOnly}
              value={draft.slug}
              onChange={(e) => patch({ slug: normalizeSlug(e.target.value) })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={`${inputCls} min-h-[100px] py-2`}
              disabled={readOnly}
              value={draft.description ?? ""}
              onChange={(e) => patch({ description: e.target.value || null })}
              maxLength={600}
            />
          </Field>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <div className="fb-surface space-y-2 p-4">
            <p className="fb-eyebrow">Start from a verified template</p>
            <p className="text-[12px] leading-relaxed text-muted">
              Tasks may only use FlowBridge&apos;s server-verified activity sources. There is no
              client-trusted task evidence.
            </p>
            <div className="flex flex-wrap gap-2">
              {STUDIO_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={btnGhost}
                  disabled={readOnly}
                  onClick={() => {
                    const built = t.build();
                    setDraft((d) => ({
                      ...d,
                      tasks: [
                        ...d.tasks,
                        ...built.tasks.map((task, i) => ({
                          ...task,
                          taskId: `${task.taskId}-${d.tasks.length + i + 1}`,
                          sortOrder: d.tasks.length + i,
                        })),
                      ],
                    }));
                  }}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {draft.tasks.map((task, i) => (
            <TaskEditor
              key={i}
              task={task}
              index={i}
              readOnly={readOnly}
              rewardType={rewardType}
              onChange={(p) => patchTask(i, p)}
              onRemove={() =>
                setDraft((d) => ({ ...d, tasks: d.tasks.filter((_, ti) => ti !== i) }))
              }
            />
          ))}

          {draft.tasks.length === 0 && (
            <p className="fb-surface p-5 text-center text-[12.5px] text-muted">
              Add at least one verified task from a template above.
            </p>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="fb-surface space-y-3 p-4">
          <Field label="Reward type">
            <select
              className={inputCls}
              disabled={readOnly}
              value={rewardType}
              onChange={(e) => setRewardType(e.target.value as CampaignRewardType)}
            >
              {(["campaign_pts", "flow_points_bonus", "flow_token"] as CampaignRewardType[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {REWARD_TYPE_LABEL[t]}
                  </option>
                ),
              )}
            </select>
          </Field>
          {rewardBlock ? (
            <p className="rounded-xl border border-warning/35 bg-warning/8 p-3 text-[12px] leading-relaxed text-warning">
              {rewardBlock} You can still record the request as a draft, but task PTS must stay at 0
              and FlowBridge cannot approve or publish it in this release.
            </p>
          ) : (
            <p className="rounded-xl border border-hairline bg-card-alt p-3 text-[12px] leading-relaxed text-muted">
              Campaign PTS is a campaign-only score. It is never converted to FLOW Points or FLOW
              tokens, and it never debits FlowBridge reward contracts.
            </p>
          )}
          <p className="font-mono text-[10px] text-muted">
            Total PTS across tasks: {draft.tasks.reduce((s, t) => s + (t.points || 0), 0)}
          </p>
        </section>
      )}

      {step === 3 && (
        <section className="fb-surface space-y-3 p-4">
          <Field label="Starts (local time)">
            <input
              type="datetime-local"
              className={inputCls}
              disabled={readOnly}
              value={toLocalInput(draft.startsAt)}
              onChange={(e) => patch({ startsAt: new Date(e.target.value).getTime() })}
            />
          </Field>
          <Field label="Ends (local time)">
            <input
              type="datetime-local"
              className={inputCls}
              disabled={readOnly}
              value={toLocalInput(draft.endsAt)}
              onChange={(e) => patch({ endsAt: new Date(e.target.value).getTime() })}
            />
          </Field>
          <p className="text-[12px] leading-relaxed text-muted">
            Eligibility is enforced by the verified activity rules on each task — supported networks
            and action types only. Visibility on Explore starts when FlowBridge publishes.
          </p>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3">
          <div className="fb-surface space-y-2 p-4">
            <p className="fb-eyebrow">Public preview</p>
            <p className="text-[16px] font-black leading-tight">{draft.name || "Untitled campaign"}</p>
            <p className="text-[12.5px] leading-relaxed text-muted">
              {draft.description || "No description yet."}
            </p>
            <ul className="space-y-1.5">
              {draft.tasks.map((t, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-card-alt px-3 py-2"
                >
                  <span className="truncate text-[12.5px] font-bold">{t.title || "Untitled task"}</span>
                  <span className="font-mono text-[10px] font-black text-primary">
                    {t.points} PTS
                  </span>
                </li>
              ))}
            </ul>
            <p className="font-mono text-[10px] text-muted">
              {new Date(draft.startsAt).toUTCString()} → {new Date(draft.endsAt).toUTCString()}
            </p>
          </div>

          {errors.length > 0 && (
            <div className="rounded-xl border border-danger/35 bg-danger/8 p-3">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-danger">
                Fix before submitting
              </p>
              <ul className="mt-1.5 space-y-1 text-[12px] text-danger">
                {errors.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            </div>
          )}

          {events.length > 0 && (
            <div className="fb-surface p-4">
              <p className="fb-eyebrow mb-2">Review history</p>
              <ul className="space-y-1.5">
                {events.map((ev) => (
                  <li key={ev.eventId} className="font-mono text-[10px] text-muted">
                    {new Date(ev.createdAt).toUTCString()} · {ev.actorRole} · {ev.action}
                    {ev.note ? ` — ${ev.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {notice && (
        <p className="flex items-center gap-1.5 text-[12px] text-success">
          <Check className="h-3.5 w-3.5" aria-hidden /> {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-danger/35 bg-danger/8 p-3 text-[12px] text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-between gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={step === STEPS.length - 1}
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
        >
          Next
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function TaskEditor({
  task,
  index,
  readOnly,
  rewardType,
  onChange,
  onRemove,
}: {
  task: StudioTaskInput;
  index: number;
  readOnly: boolean;
  rewardType: CampaignRewardType;
  onChange: (patch: Partial<StudioTaskInput>) => void;
  onRemove: () => void;
}) {
  const rules = (task.rules ?? []) as any[];
  const ruleValue = (type: string, key: string) =>
    rules.find((r) => r?.type === type)?.[key] ?? "";
  const setRule = (type: string, key: string, value: unknown) => {
    const next = rules.filter((r) => r?.type !== type);
    if (value !== "" && value !== undefined && value !== null) {
      next.push({ type, [key]: value });
    }
    onChange({ rules: next });
  };

  return (
    <div className="fb-surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="fb-eyebrow">Task {index + 1}</p>
        {!readOnly && (
          <button type="button" className={btnGhost} onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remove
          </button>
        )}
      </div>
      <Field label="Title">
        <input
          className={inputCls}
          disabled={readOnly}
          value={task.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Campaign PTS">
          <input
            type="number"
            min={0}
            className={inputCls}
            disabled={readOnly || rewardType !== "campaign_pts"}
            value={task.points}
            onChange={(e) => onChange({ points: Math.max(0, Math.trunc(Number(e.target.value))) })}
          />
        </Field>
        <Field label="Activities needed">
          <input
            type="number"
            min={1}
            className={inputCls}
            disabled={readOnly}
            value={task.requiredCount}
            onChange={(e) =>
              onChange({ requiredCount: Math.max(1, Math.trunc(Number(e.target.value))) })
            }
          />
        </Field>
        <Field label="Completions / wallet">
          <input
            type="number"
            min={1}
            className={inputCls}
            disabled={readOnly}
            value={task.completionLimitPerWallet}
            onChange={(e) =>
              onChange({
                completionLimitPerWallet: Math.max(1, Math.trunc(Number(e.target.value))),
              })
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Verified activity kind">
          <select
            className={inputCls}
            disabled={readOnly}
            value={ruleValue("ACTIVITY_KIND", "kind")}
            onChange={(e) => setRule("ACTIVITY_KIND", "kind", e.target.value)}
          >
            <option value="">— required —</option>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Action type">
          <select
            className={inputCls}
            disabled={readOnly}
            value={ruleValue("ACTION_TYPE", "actionType")}
            onChange={(e) => setRule("ACTION_TYPE", "actionType", e.target.value)}
          >
            <option value="">— any verified action —</option>
            {STUDIO_ACTION_TYPES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source chain">
          <select
            className={inputCls}
            disabled={readOnly}
            value={ruleValue("SOURCE_CHAIN", "chainId")}
            onChange={(e) =>
              setRule("SOURCE_CHAIN", "chainId", e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">— any supported —</option>
            {STUDIO_CHAIN_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Destination chain">
          <select
            className={inputCls}
            disabled={readOnly}
            value={ruleValue("DESTINATION_CHAIN", "chainId")}
            onChange={(e) =>
              setRule("DESTINATION_CHAIN", "chainId", e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">— any supported —</option>
            {STUDIO_CHAIN_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Token">
          <select
            className={inputCls}
            disabled={readOnly}
            value={ruleValue("TOKEN", "token")}
            onChange={(e) => setRule("TOKEN", "token", e.target.value)}
          >
            <option value="">— any approved token —</option>
            {STUDIO_TOKEN_OPTIONS.map((t) => (
              <option key={`${t.address}-${t.label}`} value={t.address}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
