import { BANNER_SURFACES, type AppConfig } from '@/lib/config/appConfig';

/** Public transport must omit drafts, not merely hide them in the renderer. */
export function publicPromotions(config: AppConfig): AppConfig {
  const banners = { ...config.banners };
  for (const key of BANNER_SURFACES) {
    banners[key] = { ...banners[key], slides: banners[key].slides.filter(slide => slide.promotion?.status !== 'draft') };
  }
  if(banners.docked)banners.docked={...banners.docked,slides:banners.docked.enabled?banners.docked.slides.filter(s=>s.promotion?.status==='published'):[]};
  return { ...config, banners };
}