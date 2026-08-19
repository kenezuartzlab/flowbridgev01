/**
 * V8.2 — public (non-secret) build flag source of truth.
 *
 * ROOT CAUSE this module fixes: client feature flags were read ONLY from
 * `import.meta.env.VITE_*`, which is populated at build time from the
 * environment / `.env`. A published production build whose environment does
 * not carry `VITE_ENABLE_VERIFIED_SWAP_ACTIVITY` compiles the gate to `false`,
 * so the signed swap-attribution capture and the `/api/public/activity/
 * verify-swap` handoff never run even though the swap itself succeeds.
 *
 * Flags here are PUBLIC booleans only — never secrets. Resolution order:
 *   1. `import.meta.env.VITE_<NAME>` when it is a string ("true"/"1" -> on,
 *      anything else -> off). An explicit env value always wins.
 *   2. the committed default below (source-controlled, so it cannot be lost
 *      by a deployment environment).
 *   3. `false` — default OFF when neither source declares the flag.
 */
export type PublicBuildFlagName =
  | 'ENABLE_VERIFIED_SWAP_ACTIVITY'
  | 'REQUIRE_ACTIVITY_ATTRIBUTION';

/**
 * Committed public build flags. Verified-swap attribution is intended to be ON
 * for production builds; it stays runtime-constrained to the single canonical
 * BOT Testnet (968) Router V4 / BDEX V2 USDT -> WBOT path in
 * `verifiedSwapConfig.ts`. It is NOT "attribution on for every network".
 */
export const PUBLIC_BUILD_FLAG_DEFAULTS: Partial<Record<PublicBuildFlagName, boolean>> = {
  ENABLE_VERIFIED_SWAP_ACTIVITY: true,
  REQUIRE_ACTIVITY_ATTRIBUTION: true,
};

export function parsePublicBuildFlag(raw: unknown): boolean | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '') return undefined;
  return v === 'true' || v === '1';
}

/** Static `import.meta.env` references so Vite inlines the values at build time. */
function envValues(): Partial<Record<PublicBuildFlagName, unknown>> {
  return {
    ENABLE_VERIFIED_SWAP_ACTIVITY: import.meta.env.VITE_ENABLE_VERIFIED_SWAP_ACTIVITY,
    REQUIRE_ACTIVITY_ATTRIBUTION: import.meta.env.VITE_REQUIRE_ACTIVITY_ATTRIBUTION,
  };
}


export function readPublicBuildFlag(
  name: PublicBuildFlagName,
  overrides?: { env?: Partial<Record<PublicBuildFlagName, unknown>>; defaults?: Partial<Record<PublicBuildFlagName, boolean>> },
): boolean {
  const env = overrides?.env ?? ENV_VALUES;
  const fromEnv = parsePublicBuildFlag(env[name]);
  if (fromEnv !== undefined) return fromEnv;
  const defaults = overrides?.defaults ?? PUBLIC_BUILD_FLAG_DEFAULTS;
  return defaults[name] === true;
}
