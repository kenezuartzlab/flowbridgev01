import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Suspended (non-operational) partner orgs must lose campaign read access immediately.
describe('partner campaign reads require an operational org', () => {
  for (const f of ['src/routes/api/studio.campaigns.ts', 'src/routes/api/studio.campaigns.$id.ts']) {
    it(f, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain('requirePartner(request');
      expect(src).not.toMatch(/requireOperational:\s*false/);
    });
  }
});
