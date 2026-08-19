/**
 * V9 — navigation regression: one canonical destination set, legacy `/` deep
 * links still resolve to Trade, and operator surfaces stay secondary.
 */
import { describe, expect, it } from 'vitest';
import { OPERATOR_NAV, PRIMARY_NAV, activeNavId } from './navModel';

describe('V9 navigation model', () => {
  it('exposes at most five primary destinations', () => {
    expect(PRIMARY_NAV.length).toBeLessThanOrEqual(5);
    expect(PRIMARY_NAV.map((d) => d.id)).toEqual(['home', 'trade', 'explore', 'activity', 'profile']);
  });

  it('treats the legacy root workspace and /trade as the same destination', () => {
    expect(activeNavId('/')).toBe('trade');
    expect(activeNavId('/trade')).toBe('trade');
  });

  it('maps campaign and operator routes to Explore without stealing other routes', () => {
    expect(activeNavId('/campaigns')).toBe('explore');
    expect(activeNavId('/campaigns/grant-demo')).toBe('explore');
    expect(activeNavId('/activity')).toBe('activity');
    expect(activeNavId('/account')).toBe('profile');
    expect(activeNavId('/markets')).toBeNull();
  });

  it('keeps operator surfaces out of the primary set', () => {
    const primary = new Set(PRIMARY_NAV.map((d) => d.to));
    for (const item of OPERATOR_NAV) expect(primary.has(item.to)).toBe(false);
  });
});
