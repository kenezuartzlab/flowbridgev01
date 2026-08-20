/**
 * V9.1 — navigation state regression: one canonical destination set, legacy `/`
 * deep links still resolve to Trade, and — critically — Trade is NEVER active
 * on Home, Explore, Activity or Profile (the V9 centre-item defect).
 */
import { describe, expect, it } from 'vitest';
import { OPERATOR_NAV, PRIMARY_NAV, activeNavId, isNavActive } from './navModel';
import { computeShellMode } from './useShellMode';

const trade = PRIMARY_NAV.find((d) => d.id === 'trade')!;

describe('V9.1 navigation model', () => {
  it('exposes exactly five primary destinations with Trade physically centred', () => {
    expect(PRIMARY_NAV.map((d) => d.id)).toEqual([
      'home',
      'explore',
      'trade',
      'activity',
      'profile',
    ]);
    expect(PRIMARY_NAV[2]!.id).toBe('trade');
    expect(PRIMARY_NAV.filter((d) => d.primary).map((d) => d.id)).toEqual(['trade']);
  });

  it('maps every acceptance route to the expected active destination', () => {
    expect(activeNavId('/')).toBe('trade');
    expect(activeNavId('/trade')).toBe('trade');
    expect(activeNavId('/home')).toBe('home');
    expect(activeNavId('/campaigns')).toBe('explore');
    expect(activeNavId('/campaigns/grant-demo')).toBe('explore');
    expect(activeNavId('/campaigns/me')).toBe('explore');
    expect(activeNavId('/activity')).toBe('activity');
    expect(activeNavId('/account')).toBe('profile');
    expect(activeNavId('/markets')).toBeNull();
  });

  it('never marks Trade active outside trade routes', () => {
    for (const path of [
      '/home',
      '/campaigns',
      '/campaigns/grant-demo',
      '/campaigns/me',
      '/activity',
      '/account',
    ]) {
      expect(isNavActive(trade, path)).toBe(false);
      expect(activeNavId(path)).not.toBe('trade');
    }
    expect(isNavActive(trade, '/trade')).toBe(true);
    expect(isNavActive(trade, '/')).toBe(true);
  });

  it('keeps operator surfaces out of the primary set', () => {
    const primary = new Set(PRIMARY_NAV.map((d) => d.to));
    for (const item of OPERATOR_NAV) expect(primary.has(item.to)).toBe(false);
  });
});

describe('V9.3 adaptive shell mode', () => {
  it('uses the mobile shell below 768px', () => {
    expect(computeShellMode(390, 390)).toBe('mobile');
    expect(computeShellMode(767, 767)).toBe('mobile');
  });

  it('uses the compact shell for tablet and narrow desktop widths', () => {
    for (const w of [768, 900, 1024, 1100, 1199]) {
      expect(computeShellMode(w, w)).toBe('compact');
    }
  });

  it('uses the full desktop shell only when viewport AND shell width allow a no-wrap row', () => {
    for (const w of [1200, 1280, 1440]) {
      expect(computeShellMode(w, w - 64)).toBe('desktop');
    }
    // Wide browser window but a narrow measured shell (iframe / split view / sidebar)
    expect(computeShellMode(1440, 900)).toBe('compact');
    expect(computeShellMode(1280, 1079)).toBe('compact');
  });
});
