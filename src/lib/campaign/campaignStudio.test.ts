import { describe, expect, it } from 'vitest';
import {
  STUDIO_TEMPLATES,
  newCampaignId,
  normalizeSlug,
  validateStudioCampaign,
  type StudioCampaignInput,
} from './campaignStudio';

const base = (): StudioCampaignInput => STUDIO_TEMPLATES[0].build();

describe('validateStudioCampaign', () => {
  it('accepts the verified bridge template unchanged', () => {
    expect(validateStudioCampaign(base())).toEqual([]);
  });

  it('rejects an invalid schedule window', () => {
    const c = base();
    c.endsAt = c.startsAt;
    expect(validateStudioCampaign(c).join(' ')).toMatch(/End date/);
  });

  it('rejects bad numeric task fields', () => {
    const c = base();
    c.tasks[0].points = -1;
    c.tasks[0].requiredCount = 0;
    c.tasks[0].completionLimitPerWallet = 0;
    const errors = validateStudioCampaign(c).join(' ');
    expect(errors).toMatch(/PTS/);
    expect(errors).toMatch(/required activities/);
    expect(errors).toMatch(/completion limit/);
  });

  it('rejects duplicate task ids', () => {
    const c = base();
    c.tasks.push({ ...c.tasks[0], sortOrder: 1 });
    expect(validateStudioCampaign(c).join(' ')).toMatch(/duplicate task id/);
  });

  it('rejects unknown rule types (browser cannot invent predicates)', () => {
    const c = base();
    c.tasks[0].rules = [{ type: 'SOCIAL_FOLLOW', handle: 'x' }];
    expect(validateStudioCampaign(c).join(' ')).toMatch(/unsupported rule type/);
  });

  it('rejects contradictory single-value rules', () => {
    const c = base();
    c.tasks[0].rules = [
      { type: 'SOURCE_CHAIN', chainId: 97 },
      { type: 'SOURCE_CHAIN', chainId: 968 },
    ];
    expect(validateStudioCampaign(c).join(' ')).toMatch(/conflicting SOURCE_CHAIN/);
  });

  it('rejects a task with no rules', () => {
    const c = base();
    c.tasks[0].rules = [];
    expect(validateStudioCampaign(c).join(' ')).toMatch(/at least one verified rule/);
  });

  it('normalizes slugs and mints bytes32 campaign ids', () => {
    expect(normalizeSlug('  My Grant Demo!! ')).toBe('my-grant-demo');
    expect(newCampaignId()).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
