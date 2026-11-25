// EV-01/EV-02/EV-03 evidence-integrity guards for the V1.12 review response. Reads files only.
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
const EV = 'docs/security/bnb-v112-evidence';
const PATH = 'contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol';
const lines = fs.readFileSync(PATH, 'utf8').split('\n');
const j = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
describe('EV-01 HIGH trace evidence matches the frozen V1.12 source', () => {
  const after = j(`${EV}/high-trace-review.json`);
  it('is labelled V1.12, has six OPEN traces and no V1.11 text or one-wei floor', () => {
    expect(after.version).toBe('V1.12'); expect(after.traces).toHaveLength(6); expect(after.suppressed).toBe(0);
    for (const t of after.traces) {
      expect(t.path).toBe(PATH); expect(t.contract).toBe('FlowBridgeBnbSwapAdapterV1_12'); expect(t.status).toBe('HIGH_OPEN_PENDING_INDEPENDENT_AUDIT');
      expect(t.trace).not.toMatch(/V1_11|bnb-swap-adapter-v1-11|amountOutMinimum:1[,}]/);
      for (const e of t.elements) expect(e.code).toBe(e.lines.map((n: number) => lines[n - 1]).join('\n').trim());
    }
    expect(after.traces.some((t: any) => t.trace.includes('_grossMinimum(minNetOut)'))).toBe(true);
  });
  it('trace set equals the Slither after-run and a fresh rerun (same finding IDs)', () => {
    const ids = (p: string) => j(p).results.detectors.filter((d: any) => d.impact === 'High').map((d: any) => d.id).sort();
    expect(after.traces.map((t: any) => t.slitherId).sort()).toEqual(ids(`${EV}/slither-after.json`));
    expect(ids('docs/security/bnb-v112-review-evidence/slither-rerun-20261125.json')).toEqual(ids(`${EV}/slither-after.json`));
  });
  it('keeps the BEFORE traces separately labelled V1.11', () => {
    const before = j(`${EV}/high-trace-before-v111.json`); expect(before.version).toMatch(/^V1\.11/);
    for (const t of before.traces) expect(t.trace).toContain('FlowBridgeBnbSwapAdapterV1_11');
  });
});
describe('EV-02/EV-03 packet provenance and hygiene', () => {
  it('packet builder reads no untracked /tmp evidence', () => { expect(fs.readFileSync('scripts/bnb-v112-external-packet.mjs', 'utf8')).not.toMatch(/\/tmp\//); });
  it('stray "&1" shell-redirect file is no longer tracked', () => { expect(execFileSync('git', ['ls-files', '&1'], { encoding: 'utf8' }).trim()).toBe(''); });
  it('tracked .env holds only publishable/public keys and flags (names checked, values never printed)', () => {
    const names = fs.readFileSync('.env', 'utf8').split('\n').map((l) => l.split('=')[0]!.trim()).filter((n) => n && !n.startsWith('#'));
    for (const n of names) expect(n).toMatch(/^(VITE_)?SUPABASE_(PROJECT_ID|PUBLISHABLE_KEY|URL)$|^VITE_(ENABLE|REQUIRE)_[A-Z_]+$/);
    expect(fs.readFileSync('.env', 'utf8')).not.toMatch(/service_role|sb_secret_|PRIVATE_KEY|ZEROX|-----BEGIN/i);
  });
  it('audit trees are not under public/ or imported by app source', () => {
    expect(fs.existsSync('public/contracts')).toBe(false);
    const hits = (spawnSync('rg', ['-l', '-g', '!**/AGENTS.md', 'contracts/audit|bnb-v112-review', 'src', 'public'], { encoding: 'utf8' }).stdout ?? '').trim();
    expect(hits).toBe('');
  });
});
