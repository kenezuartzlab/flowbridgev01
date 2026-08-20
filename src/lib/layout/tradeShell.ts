/**
 * FlowBridge V9.4 — Trade workspace shell widths.
 *
 * Root cause of the "phone simulator floating in empty space" defect: the Trade
 * product (including the global header) was mounted inside a fixed
 * `sm:w-[410px]` device frame with a rounded 8px inset border. Because the
 * global header measured THAT wrapper, a 1440px browser still resolved to the
 * compact shell mode and kept the hamburger.
 *
 * The widths below are the single source of truth for the Trade page shell, so
 * layout regressions are testable without a browser.
 */
export const TRADE_SHELL_MAX = {
  /** < 768px — full width inside mobile gutters (no frame at all). */
  mobile: null as number | null,
  /** 768–1099px — wide tablet workspace. */
  tablet: 900,
  /** 1100–1199px — wide single column. */
  wide: 1080,
  /** >= 1200px — true desktop workspace. */
  desktop: 1180,
} as const;

/** Effective Trade shell width for a viewport (excluding page gutters). */
export function tradeShellWidth(viewportWidth: number): number {
  if (viewportWidth < 768) return viewportWidth;
  if (viewportWidth < 1100) return Math.min(viewportWidth, TRADE_SHELL_MAX.tablet);
  if (viewportWidth < 1200) return Math.min(viewportWidth, TRADE_SHELL_MAX.wide);
  return Math.min(viewportWidth, TRADE_SHELL_MAX.desktop);
}

/** True when the Trade shell must never render faux-device chrome. */
export function tradeShellHasDeviceChrome(): boolean {
  return false;
}
