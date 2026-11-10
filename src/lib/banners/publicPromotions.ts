import type { AppConfig, BannerSurfaceKey } from '@/lib/config/appConfig';

/** Public transport must omit drafts, not merely hide them in the renderer. */
export function publicPromotions(config: AppConfig): AppConfig {
  const banners = { ...config.banners };
  for (const key of Object.keys(banners) as BannerSurfaceKey[]) {
    banners[key] = { ...banners[key], slides: banners[key].slides.filter(slide => slide.promotion?.status !== 'draft') };
  }
  return { ...config, banners };
}