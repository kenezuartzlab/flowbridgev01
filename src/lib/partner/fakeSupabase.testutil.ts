/**
 * Minimal in-memory stand-in for the supabase-js query builder, used to exercise
 * the V14.1 submission/review/publish lifecycle end-to-end in tests without a
 * live connection. Supports only the operations this codebase actually uses.
 */
type Row = Record<string, any>;

interface Filter {
  op: 'eq' | 'in' | 'gte';
  column: string;
  value: any;
}

export class FakeSupabase {
  tables: Record<string, Row[]>;
  private seq = 0;

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = tables;
  }

  private rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  from(table: string) {
    const self = this;
    const filters: Filter[] = [];
    let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: Row[] = [];
    let onConflict: string[] = [];
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limitTo: number | null = null;
    let single = false;
    let embedded: string[] = [];

    const matches = (row: Row) =>
      filters.every((f) => {
        if (f.op === 'eq') return row[f.column] === f.value;
        if (f.op === 'in') return (f.value as any[]).includes(row[f.column]);
        return String(row[f.column] ?? '') >= String(f.value);
      });

    const run = () => {
      const rows = self.rows(table);
      if (mode === 'insert' || mode === 'upsert') {
        const written: Row[] = [];
        for (const item of payload) {
          const keyed = onConflict.length
            ? rows.find((r) => onConflict.every((k) => r[k] === item[k]))
            : undefined;
          if (keyed && mode === 'upsert') {
            Object.assign(keyed, item);
            written.push(keyed);
          } else {
            const row: Row = { ...item };
            if (table === 'campaign_submission_revisions') {
              row.revision_id = row.revision_id ?? self.id('rev');
              row.submitted_at = row.submitted_at ?? new Date().toISOString();
              row.status = row.status ?? 'submitted';
            }
            rows.push(row);
            written.push(row);
          }
        }
        payload = [];
        return written;
      }
      if (mode === 'update') {
        const hits = rows.filter(matches);
        hits.forEach((r) => Object.assign(r, payload[0]));
        return hits;
      }
      if (mode === 'delete') {
        const keep = rows.filter((r) => !matches(r));
        const removed = rows.filter(matches);
        self.tables[table] = keep;
        return removed;
      }
      let out = rows.filter(matches).map((r) => ({ ...r }));
      if (orderBy) {
        const { column, ascending } = orderBy;
        out.sort((a, b) => {
          const av = a[column] ?? '';
          const bv = b[column] ?? '';
          const cmp = av > bv ? 1 : av < bv ? -1 : 0;
          return ascending ? cmp : -cmp;
        });
      }
      if (limitTo != null) out = out.slice(0, limitTo);
      // Embedded relations (`partner_organizations(*)`) resolved by convention.
      for (const relation of embedded) {
        const related = self.rows(relation);
        out = out.map((row) => {
          const key = row.organization_id ?? row.org_id ?? null;
          const hit = related.find((r) => r.org_id === key) ?? null;
          return { ...row, [relation]: hit ? { ...hit } : null };
        });
      }
      return out;
    };

    const builder: any = {
      select(cols?: string) {
        embedded = [];
        if (typeof cols === 'string') {
          for (const match of cols.matchAll(/([a-z_]+)\(/g)) embedded.push(match[1]);
        }
        return builder;
      },

      insert(rows: Row | Row[]) {
        mode = 'insert';
        payload = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        mode = 'upsert';
        payload = Array.isArray(rows) ? rows : [rows];
        onConflict = opts?.onConflict ? opts.onConflict.split(',').map((s) => s.trim()) : [];
        return builder;
      },
      update(row: Row) {
        mode = 'update';
        payload = [row];
        return builder;
      },
      delete() {
        mode = 'delete';
        return builder;
      },
      eq(column: string, value: any) {
        filters.push({ op: 'eq', column, value });
        return builder;
      },
      in(column: string, value: any[]) {
        filters.push({ op: 'in', column, value });
        return builder;
      },
      gte(column: string, value: any) {
        filters.push({ op: 'gte', column, value });
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orderBy = { column, ascending: opts?.ascending !== false };
        return builder;
      },
      limit(n: number) {
        limitTo = n;
        return builder;
      },
      maybeSingle() {
        single = true;
        return builder;
      },
      then(resolve: (value: { data: any; error: null }) => any, reject?: (e: any) => any) {
        try {
          const result = run();
          const data = single ? (result[0] ?? null) : result;
          return Promise.resolve(resolve({ data, error: null }));
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return builder;
  }
}
