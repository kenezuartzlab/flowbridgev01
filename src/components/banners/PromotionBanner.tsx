import type { CSSProperties } from 'react';
import type { BannerSlide,BannerSurfaceKey } from '@/lib/config/appConfig';
import { safePromotionImage,safePromotionLink,promotionPresentation } from '@/lib/banners/promotionPolicy';
import { trackBannerClick } from '@/lib/banners/analytics';

export function PromotionBanner({slide,surface}:{slide:BannerSlide;surface?:BannerSurfaceKey}) {
  const p=slide.promotion??{};
  const view=promotionPresentation(slide);
  const image=safePromotionImage(slide.imageUrl??'')?slide.imageUrl:null;
  const mobile=safePromotionImage(p.mobileImageUrl??'')?p.mobileImageUrl:null;
  const href=slide.href&&safePromotionLink(slide.href)?slide.href:null;
  const hasCopy=view.showTitle||view.showBody&&!!slide.body||view.showCta&&!!href;
  const style={
    '--promotion-bg':p.backgroundColor??'var(--fb-banner-swap-from)', '--promotion-fg':p.textColor??'var(--fb-banner-swap-foreground)',
    '--promotion-alpha':(p.overlayAlpha??65)/100,'--promotion-radius':`${p.radius??8}px`,
    '--promotion-focal':`${p.focalX??50}% ${p.focalY??50}%`,'--promotion-mobile-focal':`${p.mobileFocalX??p.focalX??50}% ${p.mobileFocalY??p.focalY??50}%`,
    '--promotion-duration':`${p.transitionMs??500}ms`,'--promotion-speed':`${p.speedSeconds??15}s`,
  } as CSSProperties;
  const art=(extension=false)=><picture className={extension?'promotion-extension':'promotion-art'} aria-hidden="true"><source media="(max-width: 640px)" srcSet={mobile||image||undefined}/>{(image||mobile)&&<img src={image||mobile||undefined} alt="" loading="lazy" decoding="async" draggable={false} className={extension||view.fit==='cover'?'object-cover':'object-contain'}/>}</picture>;
  const content=<>
    {view.modern&&view.fit==='contain'&&art(true)}{art()}
    {!view.modern&&<div className="promotion-overlay"/>}
    {view.modern&&view.sponsored&&<span className="promotion-disclosure">Sponsored</span>}
    {hasCopy&&<div className={`promotion-copy-position promotion-align-${view.textAlign} promotion-position-${view.textPosition}`}>
      <div className={`promotion-copy promotion-motion-${p.motion??'static'}`} data-direction={p.direction??'left'}>
        {!view.modern&&view.sponsored&&<span className="text-xs font-medium">Sponsored</span>}
        {view.showTitle&&<h3>{slide.title}</h3>}
        {view.showBody&&slide.body&&<p>{slide.body}</p>}
        {view.showCta&&href&&<span className="promotion-cta">{p.ctaLabel||'Learn more'} <span aria-hidden="true">→</span></span>}
      </div>
    </div>}
  </>;
  const cls=`promotion-banner ${view.modern?'promotion-modern':`promotion-format-${p.format??'compact'}`} promotion-scheme-${view.scheme} ${view.sponsored?'promotion-sponsored':''} relative block w-full overflow-hidden`;
  // The artwork remains a named banner link when labels are hidden; no invisible CTA is rendered.
  const shared={className:cls,style,'aria-label':slide.title};
  return href ? <a {...shared} href={href} target={href.startsWith('https:')?'_blank':undefined} rel="noopener noreferrer" onClick={()=>surface&&trackBannerClick(surface,slide.id)}>{content}</a>:<section {...shared}>{content}</section>;
}
