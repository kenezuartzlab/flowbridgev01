/**
 * V9.4 — Trade shell scope regression: the workspace must widen with the
 * viewport and must never be a phone-width column on desktop, while the global
 * header (which measures the site shell) can still reach desktop mode.
 */
import { describe, expect, it } from 'vitest';
import { tradeShellHasDeviceChrome, tradeShellWidth } from './tradeShell';
import { computeShellMode, DESKTOP_SHELL_MIN } from '@/components/shell/useShellMode';

describe('V9.4 desktop Trade workspace shell', () => {
  it('never renders faux-device chrome', () => {
    expect(tradeShellHasDeviceChrome()).toBe(false);
  });

  it('keeps mobile full width inside the gutters', () => {
    expect(tradeShellWidth(390)).toBe(390);
    expect(tradeShellWidth(767)).toBe(767);
  });

  it('is materially wider than the mobile card at tablet/narrow desktop', () => {
    expect(tradeShellWidth(768)).toBe(768);
    expect(tradeShellWidth(1024)).toBe(900);
    expect(tradeShellWidth(1024)).toBeGreaterThan(600);
  });

  it('gives a >= 1000px workspace on desktop viewports', () => {
    expect(tradeShellWidth(1280)).toBeGreaterThanOrEqual(1000);
    expect(tradeShellWidth(1440)).toBeGreaterThanOrEqual(1000);
  });

  it('lets the global header reach full desktop mode at 1440px', () => {
    const shell = tradeShellWidth(1440);
    expect(shell).toBeGreaterThanOrEqual(DESKTOP_SHELL_MIN);
    expect(computeShellMode(1440, shell)).toBe('desktop');
    // 1024px shell stays compact — hamburger is still correct there.
    expect(computeShellMode(1024, tradeShellWidth(1024))).toBe('compact');
  });

  it('never exceeds the viewport (no horizontal overflow)', () => {
    for (const w of [390, 768, 1024, 1280, 1440]) {
      expect(tradeShellWidth(w)).toBeLessThanOrEqual(w);
    }
  });
});
