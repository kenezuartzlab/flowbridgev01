/**
 * V9.1 — navigation state regression: one canonical destination set, legacy `/`
 * deep links still resolve to Trade, and — critically — Trade is NEVER active
 * on Home, Explore, Activity or Profile (the V9 centre-item defect).
 */
import { describe, expect, it } from 'vitest';
import { OPERATOR_NAV, PRIMARY_NAV, activeNavId, isNavActive } from './navModel';

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
