import { expect, it } from 'vitest';
import { DEFAULT_APP_CONFIG, mergeAppConfig } from '@/lib/config/appConfig';
import { publicPromotions } from './publicPromotions';

it('omits draft data from every public surface without mutating the admin configuration or legacy slides', () => {
  const config = mergeAppConfig(DEFAULT_APP_CONFIG);
  for (const key of ['home', 'swap', 'bridge', 'cabot'] as const) {
    config.banners[key] = { intervalMs: 4000, slides: [{ id: 'old', title: 'Legacy' }, { id: 'private', title: 'Private draft', promotion: { status: 'draft' } }, { id: 'live', title: 'Published', promotion: { status: 'published' } }] };
  }
  const result = publicPromotions(config);
  for (const key of ['home', 'swap', 'bridge', 'cabot'] as const) {
    expect(result.banners[key].slides.map(slide => slide.id)).toEqual(['old', 'live']);
    expect(config.banners[key].slides).toHaveLength(3);
    expect(result.banners[key].slides[0]).toEqual(config.banners[key].slides[0]);
  }
});