import { BANNER_SURFACES, type AppConfig } from '@/lib/config/appConfig';

/** Public transport must omit drafts, not merely hide them in the renderer. */
export function publicPromotions(config: AppConfig): AppConfig {
  const banners = { ...config.banners };
  for (const key of BANNER_SURFACES) {
    banners[key] = { ...banners[key], slides: banners[key].slides.filter(slide => slide.promotion?.status !== 'draft') };
  }
  if(banners.docked){
    const slides=banners.docked.enabled?banners.docked.slides.filter(s=>s.promotion?.status==='published'):[];
    const pages={...banners.docked.pages};
    for(const key of Object.keys(pages) as (keyof typeof pages)[]){const p=pages[key];if(p)pages[key]={...p,creativeIds:p.creativeIds.filter(id=>slides.some(s=>s.id===id))};}
    banners.docked={...banners.docked,pages,slides};
  }
  return { ...config, banners };
}