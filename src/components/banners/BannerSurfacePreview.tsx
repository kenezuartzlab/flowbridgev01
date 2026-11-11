import type { BannerSlide, BannerSurfaceKey } from '@/lib/config/appConfig';
import { BannerRotator } from './BannerRotator';
import { FeaturedBanner } from './FeaturedBanner';
import { TabBanner } from './TabBanner';

/** No analytics or publishing side effects: the exact live surface renderers. */
export function BannerSurfacePreview({slides,surface,intervalMs}:{slides:BannerSlide[];surface:BannerSurfaceKey;intervalMs:number}) {
  return <BannerRotator key={surface} slides={slides.map(slide=>surface==='home'
    ? <FeaturedBanner key={slide.id} slide={slide}/>
    : <TabBanner key={slide.id} slide={slide}/>)}
    intervalMs={intervalMs} delaysMs={slides.map(s=>s.promotion?.delayMs??intervalMs)}/>
}