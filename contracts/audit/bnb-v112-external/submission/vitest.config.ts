import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { include: ['contracts/candidates/bnb-swap-adapter-v1-12/test/**/*.test.ts', 'contracts/audit/bnb-v111/**/*.test.ts'] } });
