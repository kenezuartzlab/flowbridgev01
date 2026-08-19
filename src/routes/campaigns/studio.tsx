import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import {
  ArrowLeft,
  BarChart3,
  Copy,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Wand2,
} from "lucide-react";
import { initAuth } from "@/lib/auth";
import { checkAdmin } from "@/lib/admin/adminApi";
import { BottomNav } from "@/components/nav/BottomNav";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { StatusPill } from "@/components/campaigns/CampaignBits";
import type { CampaignApiCampaign } from "@/lib/campaign/campaignApi";
import {
  STUDIO_ACTION_TYPES,
  STUDIO_CHAIN_OPTIONS,
  STUDIO_TEMPLATES,
  STUDIO_TOKEN_OPTIONS,
  CAMPAIGN_RULE_TYPES,
  normalizeSlug,
  validateStudioCampaign,
  type StudioCampaignInput,
  type StudioCampaignSummary,
  type StudioTaskInput,
} from "@/lib/campaign/campaignStudio";
import {
  deleteStudioCampaign,
  duplicateStudioCampaign,
  fetchStudioCampaigns,
  saveStudioCampaign,
  setStudioCampaignStatus,
} from "@/lib/campaign/campaignStudioApi";

export const Route = createFileRoute("/campaigns/studio")({
  head: () => ({
    meta: [
      { title: "Campaign Studio — FlowBridge Growth Hub Operators" },
      {
        name: "description",
        content:
          "Operator-only FlowBridge Campaign Studio: build, preview and publish verified bridge campaigns backed by server-verified activity rules.",
      },
      { property: "og:title", content: "FlowBridge Campaign Studio" },
      {
        property: "og:description",
        content: "Create, preview and publish verified FlowBridge campaigns in minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudioRoute,
});

/* ------------------------------- primitives ------------------------------- */

const inputCls =
  "w-full min-h-[38px] rounded-xl border border-hairline bg-card-alt px-3 font-mono text-[11px] text-foreground outline-none transition focus:border-primary/60";
const labelCls =
  "block font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted";
const btnPrimary =
  "inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground transition hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition hover:border-primary/40 hover:text-foreground disabled:opacity-50";

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
      {hint && (
        <span className="block font-mono text-[9px] leading-relaxed text-muted">{hint}</span>
      )}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="fb-surface overflow-hidden">
      <div className="border-b border-hairline px-4 py-2.5">
        <p className="fb-eyebrow">{title}</p>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

const toLocalInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/* --------------------------------- route ---------------------------------- */

function StudioRoute() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <StudioPage />
    </WagmiProvider>
  );
}

function StudioPage() {
  const { address } = useAccount();
  const wallet = address?.toLowerCase();

  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [gate, setGate] = useState<{ isAdmin: boolean; reason?: string } | null>(null);

  const [campaigns, setCampaigns] = useState<StudioCampaignSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudioCampaignInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const un = initAuth(
      (u) => {
        setUser(u);
        setAuthReady(true);
      },
      () => {
        setUser(null);
        setAuthReady(true);
      },
    );
    return () => un();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user || !wallet) {
      setGate({
        isAdmin: false,
        reason: !user ? "Sign in with your operator account." : "Connect the bound admin wallet.",
      });
      return;
    }
    let alive = true;
    checkAdmin(wallet).then((r) => alive && setGate(r));
    return () => {
      alive = false;
    };
  }, [authReady, user, wallet]);

  const reload = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await fetchStudioCampaigns(wallet));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (gate?.isAdmin) void reload();
  }, [gate?.isAdmin, reload]);

  // Unsaved-changes protection.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const patchDraft = (patch: Partial<StudioCampaignInput>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  const guardDiscard = () =>
    !dirty || window.confirm("Discard unsaved changes to this campaign?");

  const openDraft = (input: StudioCampaignInput) => {
    if (!guardDiscard()) return;
    setDraft(input);
    setDirty(false);
    setNotice(null);
    setError(null);
  };

  const errors = useMemo(() => (draft ? validateStudioCampaign(draft) : []), [draft]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(async () => {
      if (!wallet || !draft) return;
      const saved = await saveStudioCampaign(wallet, draft);
      setDraft({ ...saved });
      setDirty(false);
      setNotice(`Saved “${saved.name}”.`);
      await reload();
    });

  const publishToggle = (c: StudioCampaignSummary) =>
    act(async () => {
      if (!wallet) return;
      const next = c.status === "published" ? "draft" : "published";
      await setStudioCampaignStatus(wallet, c.campaignId, next);
      setNotice(next === "published" ? `Published “${c.name}”.` : `Unpublished “${c.name}”.`);
      await reload();
    });

  const archive = (c: StudioCampaignSummary) =>
    act(async () => {
      if (!wallet) return;
      await setStudioCampaignStatus(wallet, c.campaignId, "archived");
      setNotice(`Archived “${c.name}”.`);
      await reload();
    });

  const duplicate = (c: StudioCampaignSummary) =>
    act(async () => {
      if (!wallet) return;
      const copy = await duplicateStudioCampaign(wallet, c.campaignId);
      setNotice(`Duplicated as “${copy.name}”.`);
      await reload();
    });

  const remove = (c: StudioCampaignSummary) =>
    act(async () => {
      if (!wallet) return;
      if (!window.confirm(`Delete draft “${c.name}”? This cannot be undone.`)) return;
      await deleteStudioCampaign(wallet, c.campaignId);
      if (draft?.campaignId === c.campaignId) setDraft(null);
      setNotice(`Deleted “${c.name}”.`);
      await reload();
    });

  /* --------------------------------- gates --------------------------------- */

  if (!authReady || gate === null) {
    return (
      <StudioShell>
        <p className="px-1 font-mono text-[10.5px] text-muted">
          <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden /> Checking
          operator access…
        </p>
      </StudioShell>
    );
  }

  if (!gate.isAdmin) {
    return (
      <StudioShell>
        <div className="fb-surface p-5 text-center">
          <ShieldCheck className="mx-auto h-7 w-7 text-primary" aria-hidden />
          <p className="mt-2 font-mono text-[12px] font-black uppercase tracking-[0.08em]">
            Operators only
          </p>
          <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-muted">
            {gate.reason ?? "This wallet is not authorized for Campaign Studio."}
          </p>
          <Link to="/campaigns" className={`${btnGhost} mt-3`}>
            <ArrowLeft className="h-3 w-3" aria-hidden /> Back to Growth Hub
          </Link>
        </div>
      </StudioShell>
    );
  }

  /* --------------------------------- studio -------------------------------- */

  return (
    <StudioShell>
      {(error || notice) && (
        <p
          className={`rounded-xl border px-3 py-2 font-mono text-[10px] leading-relaxed ${
            error
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-success/40 bg-success/10 text-success"
          }`}
        >
          {error ?? notice}
        </p>
      )}

      {!draft ? (
        <>
          <Section title="Create from template">
            <ul className="grid gap-2 sm:grid-cols-2">
              {STUDIO_TEMPLATES.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openDraft(t.build())}
                    className="glass-card flex h-full w-full flex-col gap-1.5 rounded-[var(--fb-radius-md)] p-3 text-left transition hover:border-primary/40"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-black uppercase tracking-[0.08em]">
                      <Wand2 className="h-3.5 w-3.5 text-primary" aria-hidden /> {t.label}
                    </span>
                    <span className="font-mono text-[9.5px] leading-relaxed text-muted">
                      {t.hint}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="font-mono text-[9px] leading-relaxed text-muted">
              Templates are editor presets only — review every field before saving or publishing.
              Publishing changes availability; it never awards Campaign PTS retroactively.
            </p>
          </Section>

          <section className="fb-surface overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
              <p className="fb-eyebrow">Campaign definitions</p>
              <button type="button" onClick={() => void reload()} className={btnGhost}>
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden />
                Refresh
              </button>
            </div>
            {loading ? (
              <p className="px-4 py-4 font-mono text-[10.5px] text-muted">Loading definitions…</p>
            ) : campaigns.length === 0 ? (
              <p className="px-4 py-4 font-mono text-[10.5px] text-muted">
                No campaigns yet — start from a template above.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {campaigns.map((c) => (
                  <li key={c.campaignId} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill
                        tone={
                          c.status === "published"
                            ? "live"
                            : c.status === "archived"
                              ? "ended"
                              : "neutral"
                        }
                      >
                        {c.status}
                      </StatusPill>
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                        {c.tasks.length} task{c.tasks.length === 1 ? "" : "s"} ·{" "}
                        {c.tasks.reduce((s, t) => s + t.points * t.completionLimitPerWallet, 0)} PTS
                        max · {c.completionCount} completion{c.completionCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="truncate text-[13px] font-black leading-tight">{c.name}</p>
                    <p className="font-mono text-[9.5px] text-muted">
                      /{c.slug} · {new Date(c.startsAt).toLocaleDateString()} →{" "}
                      {new Date(c.endsAt).toLocaleDateString()}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() => openDraft({ ...c })}
                      >
                        <Eye className="h-3 w-3" aria-hidden /> Edit & preview
                      </button>
                      <button
                        type="button"
                        disabled={busy || c.status === "archived"}
                        className={btnGhost}
                        onClick={() => void publishToggle(c)}
                      >
                        {c.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                      <Link
                        to="/campaigns/analytics/$id"
                        params={{ id: c.campaignId }}
                        className={btnGhost}
                      >
                        <BarChart3 className="h-3 w-3" aria-hidden /> Analytics
                      </Link>
                      <button
                        type="button"
                        disabled={busy}
                        className={btnGhost}
                        onClick={() => void duplicate(c)}
                      >
                        <Copy className="h-3 w-3" aria-hidden /> Duplicate
                      </button>

                      {c.status !== "archived" && c.completionCount > 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          className={btnGhost}
                          onClick={() => void archive(c)}
                        >
                          Archive
                        </button>
                      )}
                      {c.completionCount === 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          className={btnGhost}
                          onClick={() => void remove(c)}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden /> Delete
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <CampaignEditor
          draft={draft}
          errors={errors}
          dirty={dirty}
          busy={busy}
          onPatch={patchDraft}
          onClose={() => {
            if (guardDiscard()) {
              setDraft(null);
              setDirty(false);
            }
          }}
          onSave={() => void save()}
        />
      )}
    </StudioShell>
  );
}

function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Wand2 className="h-4 w-4" aria-hidden />
            </span>
            <h1 className="truncate font-mono text-[13px] font-black uppercase tracking-[0.14em]">
              Campaign studio<span className="text-primary">.</span>
            </h1>
          </div>
          <Link to="/campaigns" className={btnGhost}>
            <ArrowLeft className="h-3 w-3" aria-hidden /> Growth hub
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">{children}</main>
      <BottomNav />
    </div>
  );
}

/* -------------------------------- editor ---------------------------------- */

function CampaignEditor({
  draft,
  errors,
  dirty,
  busy,
  onPatch,
  onClose,
  onSave,
}: {
  draft: StudioCampaignInput;
  errors: string[];
  dirty: boolean;
  busy: boolean;
  onPatch: (patch: Partial<StudioCampaignInput>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const patchTask = (index: number, patch: Partial<StudioTaskInput>) => {
    onPatch({
      tasks: draft.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    });
  };

  const preview: CampaignApiCampaign = {
    campaignId: (draft.campaignId ?? "0xpreview") as CampaignApiCampaign["campaignId"],
    slug: draft.slug,
    name: draft.name || "Untitled campaign",
    description: draft.description,
    status: draft.status,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    tasks: draft.tasks.map((t) => ({
      taskId: t.taskId,
      title: t.title,
      description: t.description,
      points: t.points,
      requiredCount: t.requiredCount,
      completionLimitPerWallet: t.completionLimitPerWallet,
      sortOrder: t.sortOrder,
      rules: t.rules,
    })),
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>
          <ArrowLeft className="h-3 w-3" aria-hidden /> All campaigns
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {dirty && (
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            className={btnPrimary}
            disabled={busy || errors.length > 0}
            onClick={onSave}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Save definition
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2">
          {errors.map((e) => (
            <li key={e} className="font-mono text-[9.5px] leading-relaxed text-danger">
              {e}
            </li>
          ))}
        </ul>
      )}

      <Section title="Basics">
        <Field label="Name">
          <input
            className={inputCls}
            value={draft.name}
            maxLength={120}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </Field>
        <Field label="Slug" hint="Public URL: /campaigns/<slug>">
          <input
            className={inputCls}
            value={draft.slug}
            onChange={(e) => onPatch({ slug: normalizeSlug(e.target.value) })}
          />
        </Field>
        <Field label="Description">
          <textarea
            className={`${inputCls} min-h-[74px] py-2`}
            value={draft.description ?? ""}
            maxLength={600}
            onChange={(e) => onPatch({ description: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Schedule & state">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts at">
            <input
              type="datetime-local"
              className={inputCls}
              value={toLocalInput(draft.startsAt)}
              onChange={(e) => onPatch({ startsAt: new Date(e.target.value).getTime() })}
            />
          </Field>
          <Field label="Ends at">
            <input
              type="datetime-local"
              className={inputCls}
              value={toLocalInput(draft.endsAt)}
              onChange={(e) => onPatch({ endsAt: new Date(e.target.value).getTime() })}
            />
          </Field>
        </div>
        <Field label="Status" hint="Drafts stay invisible to the public Growth Hub.">
          <select
            className={inputCls}
            value={draft.status}
            onChange={(e) => onPatch({ status: e.target.value as StudioCampaignInput["status"] })}
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </Field>
      </Section>

      <Section title="Verified tasks">
        {draft.tasks.map((task, i) => (
          <TaskEditor
            key={i}
            index={i}
            task={task}
            onPatch={(patch) => patchTask(i, patch)}
            onRemove={
              draft.tasks.length > 1
                ? () => onPatch({ tasks: draft.tasks.filter((_, x) => x !== i) })
                : undefined
            }
          />
        ))}
        <button
          type="button"
          className={btnGhost}
          onClick={() =>
            onPatch({
              tasks: [
                ...draft.tasks,
                {
                  taskId: `task-${draft.tasks.length + 1}`,
                  title: "",
                  description: null,
                  points: 50,
                  requiredCount: 1,
                  completionLimitPerWallet: 1,
                  sortOrder: draft.tasks.length,
                  rules: [{ type: "ACTIVITY_KIND", kind: "BRIDGE_SUBMITTED" }],
                },
              ],
            })
          }
        >
          <Plus className="h-3 w-3" aria-hidden /> Add task
        </button>
        <p className="font-mono text-[9px] leading-relaxed text-muted">
          Every task must map to server-verifiable rules. Social, referral and manual tasks are not
          available because they have no trusted verification adapter yet.
        </p>
      </Section>

      <Section title="Live preview">
        <p className="font-mono text-[9px] leading-relaxed text-muted">
          Rendered with the same card the public Growth Hub uses.
        </p>
        <div className="max-w-sm">
          <CampaignCard campaign={preview} authenticated={false} />
        </div>
      </Section>
    </>
  );
}

function TaskEditor({
  index,
  task,
  onPatch,
  onRemove,
}: {
  index: number;
  task: StudioTaskInput;
  onPatch: (patch: Partial<StudioTaskInput>) => void;
  onRemove?: () => void;
}) {
  const rules = (task.rules ?? []) as Record<string, unknown>[];

  const patchRule = (i: number, next: Record<string, unknown>) =>
    onPatch({ rules: rules.map((r, x) => (x === i ? next : r)) });

  return (
    <div className="fb-inset space-y-3 p-3">
      <datalist id="fb-studio-tokens">
        {STUDIO_TOKEN_OPTIONS.map((t) => (
          <option key={t.address} value={t.address}>
            {t.label}
          </option>
        ))}
      </datalist>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary">
          Task {index + 1}
        </p>
        {onRemove && (
          <button type="button" className={btnGhost} onClick={onRemove}>
            <Trash2 className="h-3 w-3" aria-hidden /> Remove
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Task id">
          <input
            className={inputCls}
            value={task.taskId}
            onChange={(e) =>
              onPatch({ taskId: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-") })
            }
          />
        </Field>
        <Field label="Title">
          <input
            className={inputCls}
            value={task.title}
            onChange={(e) => onPatch({ title: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          className={`${inputCls} min-h-[60px] py-2`}
          value={task.description ?? ""}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="PTS reward">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={task.points}
            onChange={(e) => onPatch({ points: Math.trunc(Number(e.target.value)) })}
          />
        </Field>
        <Field label="Required activities">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={task.requiredCount}
            onChange={(e) => onPatch({ requiredCount: Math.trunc(Number(e.target.value)) })}
          />
        </Field>
        <Field label="Limit per wallet">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={task.completionLimitPerWallet}
            onChange={(e) =>
              onPatch({ completionLimitPerWallet: Math.trunc(Number(e.target.value)) })
            }
          />
        </Field>
      </div>

      <div className="space-y-2">
        <p className={labelCls}>Verified rules (all must match)</p>
        {rules.map((rule, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
            <select
              className={inputCls}
              value={String(rule.type ?? "")}
              onChange={(e) => patchRule(i, defaultRule(e.target.value))}
              aria-label={`Rule ${i + 1} type`}
            >
              {CAMPAIGN_RULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <RuleValue rule={rule} onChange={(next) => patchRule(i, next)} />
            <button
              type="button"
              className={btnGhost}
              onClick={() => onPatch({ rules: rules.filter((_, x) => x !== i) })}
              aria-label={`Remove rule ${i + 1}`}
            >
              <Trash2 className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={btnGhost}
          onClick={() => onPatch({ rules: [...rules, defaultRule("SOURCE_CHAIN")] })}
        >
          <Plus className="h-3 w-3" aria-hidden /> Add rule
        </button>
      </div>
    </div>
  );
}

function defaultRule(type: string): Record<string, unknown> {
  switch (type) {
    case "ACTIVITY_KIND":
      return { type, kind: "BRIDGE_SUBMITTED" };
    case "SOURCE_CHAIN":
    case "DESTINATION_CHAIN":
      return { type, chainId: STUDIO_CHAIN_OPTIONS[0].id };
    case "ACTION_TYPE":
      return { type, actionType: STUDIO_ACTION_TYPES[0].value };
    case "TOKEN":
      return { type, token: STUDIO_TOKEN_OPTIONS[0].address };
    case "MIN_AMOUNT":
      return { type, minAmountRaw: "0" };
    case "CAMPAIGN_ID":
      return { type, campaignId: "0x" + "0".repeat(64) };
    default:
      return { type };
  }
}

function RuleValue({
  rule,
  onChange,
}: {
  rule: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const type = String(rule.type ?? "");
  if (type === "ACTIVITY_KIND") {
    return (
      <select
        className={inputCls}
        value={String(rule.kind ?? "BRIDGE_SUBMITTED")}
        onChange={(e) => onChange({ ...rule, kind: e.target.value })}
        aria-label="Activity kind"
      >
        <option value="BRIDGE_SUBMITTED">BRIDGE_SUBMITTED</option>
        <option value="BRIDGE_COMPLETED">BRIDGE_COMPLETED</option>
        <option value="SWAP_EXECUTED">SWAP_EXECUTED</option>
      </select>
    );
  }
  if (type === "SOURCE_CHAIN" || type === "DESTINATION_CHAIN") {
    return (
      <select
        className={inputCls}
        value={String(rule.chainId ?? "")}
        onChange={(e) => onChange({ ...rule, chainId: Number(e.target.value) })}
        aria-label="Chain"
      >
        {STUDIO_CHAIN_OPTIONS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === "ACTION_TYPE") {
    return (
      <select
        className={inputCls}
        value={String(rule.actionType ?? "")}
        onChange={(e) => onChange({ ...rule, actionType: e.target.value })}
        aria-label="Action type"
      >
        {STUDIO_ACTION_TYPES.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === "TOKEN") {
    return (
      <input
        className={inputCls}
        value={String(rule.token ?? "")}
        placeholder="0x token address"
        onChange={(e) => onChange({ ...rule, token: e.target.value.trim() })}
        aria-label="Token address"
        list="fb-studio-tokens"
      />
    );
  }
  if (type === "MIN_AMOUNT") {
    return (
      <input
        className={inputCls}
        value={String(rule.minAmountRaw ?? "")}
        placeholder="raw integer amount (token decimals)"
        onChange={(e) => onChange({ ...rule, minAmountRaw: e.target.value.replace(/\D/g, "") })}
        aria-label="Minimum raw amount"
      />
    );
  }
  if (type === "CAMPAIGN_ID") {
    return (
      <input
        className={inputCls}
        value={String(rule.campaignId ?? "")}
        placeholder="0x… bytes32"
        onChange={(e) => onChange({ ...rule, campaignId: e.target.value.trim() })}
        aria-label="Campaign id"
      />
    );
  }
  return <input className={inputCls} disabled value="" aria-label="Unsupported rule" />;
}
