import type { CSSProperties } from 'react';
import type { BannerSlide,BannerSurfaceKey } from '@/lib/config/appConfig';
import { safePromotionImage,safePromotionLink } from '@/lib/banners/promotionPolicy';
import { trackBannerClick } from '@/lib/banners/analytics';

export function PromotionBanner({slide,surface}:{slide:BannerSlide;surface?:BannerSurfaceKey}) {
  const p=slide.promotion??{};
  const image=safePromotionImage(slide.imageUrl??'')?slide.imageUrl:null;
  const mobile=safePromotionImage(p.mobileImageUrl??'')?p.mobileImageUrl:null;
  const style={
    '--promotion-bg':p.backgroundColor??'var(--fb-banner-swap-from)', '--promotion-fg':p.textColor??'var(--fb-banner-swap-foreground)',
    '--promotion-alpha':(p.overlayAlpha??65)/100,'--promotion-radius':`${p.radius??8}px`,
    '--promotion-focal':`${p.focalX??50}% ${p.focalY??50}%`,'--promotion-mobile-focal':`${p.mobileFocalX??p.focalX??50}% ${p.mobileFocalY??p.focalY??50}%`,
    '--promotion-duration':`${p.transitionMs??500}ms`,'--promotion-speed':`${p.speedSeconds??15}s`,
  } as CSSProperties;
  const content=<><picture className="promotion-art"><source media="(max-width: 640px)" srcSet={mobile||image||undefined}/>{(image||mobile)&&<img src={image||mobile||undefined} alt="" loading="lazy" decoding="async" className={p.fit==='contain'?'object-contain':'object-cover'}/>}</picture><div className="promotion-overlay"/>
    <div className={`promotion-copy promotion-motion-${p.motion??'static'}`} data-direction={p.direction??'left'}>
      {p.sponsored&&<span className="text-xs font-medium">Sponsored</span>}<h3 className="break-words text-base font-bold leading-snug sm:text-lg">{slide.title}</h3>
      {slide.body&&<p className="mt-1 break-words text-sm leading-relaxed">{slide.body}</p>}
      {slide.href&&<span className="mt-3 inline-flex items-center gap-2 text-sm font-bold">{p.ctaLabel||'Learn more'} <span aria-hidden>→</span></span>}
    </div></>;
  const cls=`promotion-banner promotion-format-${p.format??'compact'} relative block w-full overflow-hidden`;
  const href=safePromotionLink(slide.href??'')?slide.href:null;
  return href ? <a href={href} target={href.startsWith('https:')?'_blank':undefined} rel="noopener noreferrer" className={cls} style={style} onClick={()=>surface&&trackBannerClick(surface,slide.id)}>{content}</a>:<section className={cls} style={style}>{content}</section>;
}