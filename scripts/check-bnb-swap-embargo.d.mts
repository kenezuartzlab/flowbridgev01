import type { Plugin } from 'vite';
export function checkSource(root?: string, overrides?: Record<string, string>): true;
export function checkBundle(bundle: Record<string, { type: string; code?: string; modules?: Record<string, unknown> }>): true;
export function bnbSwapEmbargoPlugin(): Plugin;
