import { useCallback, useEffect, useState } from "react";
import { getIdToken } from "@/lib/auth";

type Row = { email: string; role: string; disabled: boolean; created_at: string };

export function AdminUsersPanel({ wallet }: { wallet: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [owner, setOwner] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("internal_operator");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (method: string, body?: unknown) => {
    const token = await getIdToken();
    const res = await fetch("/api/admin/users", {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-wallet-address": wallet },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
    return json;
  }, [wallet]);

  const load = useCallback(async () => {
    try {
      const r = await call("GET");
      setRows(r.admins ?? []);
      setOwner(r.owner ?? "");
    } catch (e: any) { setMsg(e.message); }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const act = async (method: string, body: unknown, ok: string) => {
    setBusy(true); setMsg(null);
    try { await call(method, body); setMsg(ok); await load(); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const label = (r: string) => (r === "super_admin" ? "Super admin" : "Operator");

  return (
    <section className="space-y-4 rounded-2xl border border-foreground/10 bg-card/70 p-4 font-mono">
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Admins & Operators</h2>
        <p className="mt-1 text-[11px] text-muted">
          Only super admins can manage this list. Each person must sign in with a verified email and bind their wallet in Profile. Operators can review and publish reward rounds; owner-only tools stay with super admins.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => { e.preventDefault(); void act("POST", { email, role }, "Added.").then(() => setEmail("")); }}
      >
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="min-w-0 flex-1 rounded-xl border border-foreground/10 bg-background px-3 py-2 text-[12px] text-foreground"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="rounded-xl border border-foreground/10 bg-background px-2 py-2 text-[12px] text-foreground">
          <option value="internal_operator">Operator</option>
          <option value="super_admin">Super admin</option>
        </select>
        <button disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-widest text-primary-foreground disabled:opacity-50">
          Add
        </button>
      </form>

      {msg && <p className="text-[11px] text-muted">{msg}</p>}

      <ul className="space-y-2">
        {rows.map((r) => {
          const locked = r.email === owner;
          return (
            <li key={r.email} className="flex flex-wrap items-center gap-2 rounded-xl border border-foreground/10 bg-background/60 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-all text-[12px] text-foreground">{r.email}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted">
                  {label(r.role)}{locked ? " · Owner" : ""}{r.disabled ? " · Disabled" : ""}
                </p>
              </div>
              {!locked && (
                <div className="flex flex-wrap gap-1.5">
                  <select value={r.role} disabled={busy}
                    onChange={(e) => void act("PATCH", { email: r.email, role: e.target.value }, "Role updated.")}
                    className="rounded-lg border border-foreground/10 bg-background px-2 py-1 text-[11px] text-foreground">
                    <option value="internal_operator">Operator</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                  <button disabled={busy}
                    onClick={() => void act("PATCH", { email: r.email, disabled: !r.disabled }, r.disabled ? "Enabled." : "Disabled.")}
                    className="rounded-lg border border-foreground/10 px-2 py-1 text-[11px] text-foreground">
                    {r.disabled ? "Enable" : "Disable"}
                  </button>
                  <button disabled={busy}
                    onClick={() => { if (confirm(`Remove ${r.email}?`)) void act("DELETE", { email: r.email }, "Removed."); }}
                    className="rounded-lg border border-destructive/40 px-2 py-1 text-[11px] text-destructive">
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
