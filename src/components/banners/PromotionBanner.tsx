import type { CSSProperties } from 'react';
import type { BannerSlide,BannerSurfaceKey } from '@/lib/config/appConfig';
import { safePromotionImage,safePromotionLink,promotionPresentation,disclosureColors,contrastRatio } from '@/lib/banners/promotionPolicy';
import { trackBannerClick } from '@/lib/banners/analytics';

export function PromotionBanner({slide,surface,home=false}:{slide:BannerSlide;surface?:BannerSurfaceKey;home?:boolean}) {
  const p=slide.promotion??{};
  const view=promotionPresentation(slide);
  const image=safePromotionImage(slide.imageUrl??'')?slide.imageUrl:null;
  const mobile=safePromotionImage(p.mobileImageUrl??'')?p.mobileImageUrl:null;
  const href=slide.href&&safePromotionLink(slide.href)?slide.href:null;
  const hasCopy=view.showTitle||view.showBody&&!!slide.body||view.showCta&&!!href;
  const disclosure=disclosureColors(p);
  const custom=p.backgroundMode==='custom'&&contrastRatio(p.backgroundColor??'',p.textColor??'')>=4.5;
  const style={
    '--promotion-bg':p.backgroundColor??'var(--fb-banner-swap-from)', '--promotion-fg':p.textColor??'var(--fb-banner-swap-foreground)',
    '--promotion-alpha':(p.overlayAlpha??65)/100,'--promotion-radius':`${p.radius??8}px`,
    '--promotion-focal':`${p.focalX??50}% ${p.focalY??50}%`,'--promotion-mobile-focal':`${p.mobileFocalX??p.focalX??50}% ${p.mobileFocalY??p.focalY??50}%`,
    '--promotion-duration':`${p.transitionMs??500}ms`,'--promotion-speed':`${p.speedSeconds??15}s`,
    '--promotion-home-ratio':(p.homeRatio??'6:1').replace(':',' / '),
    '--disclosure-bg':disclosure.bg,'--disclosure-fg':disclosure.fg,'--disclosure-size':`${p.disclosureSize??9}px`,'--disclosure-inset':`${p.disclosureInset??4}px`,
    '--disclosure-opacity':(p.disclosureOpacity??100)/100,
    '--promotion-copy-bg':custom?p.backgroundColor:p.backgroundMode==='light'?'var(--fb-promotion-light-scrim)':p.backgroundMode==='dark'?'var(--fb-promotion-dark-scrim)':view.scheme==='dark'?'var(--fb-promotion-light-scrim)':'var(--fb-promotion-dark-scrim)',
    '--promotion-copy-fg':custom?p.textColor:p.backgroundMode==='light'?'var(--fb-promotion-dark-ink)':p.backgroundMode==='dark'?'var(--fb-promotion-light-ink)':view.scheme==='dark'?'var(--fb-promotion-dark-ink)':'var(--fb-promotion-light-ink)',
  } as CSSProperties;
  const art=(extension=false)=><picture className={extension?'promotion-extension':'promotion-art'} aria-hidden="true"><source media="(max-width: 640px)" srcSet={mobile||image||undefined}/>{(image||mobile)&&<img src={image||mobile||undefined} alt="" loading="lazy" decoding="async" draggable={false} className={extension||view.fit==='cover'?'object-cover':'object-contain'}/>}</picture>;
  const content=<>
    {view.modern&&view.fit==='contain'&&art(true)}{art()}
    {!view.modern&&<div className="promotion-overlay"/>}
    {view.modern&&view.sponsored&&<span className={`promotion-disclosure disclosure-x-${p.disclosureX??'right'} disclosure-y-${p.disclosureY??'top'} disclosure-theme-${p.disclosureTheme??'dark'}`} aria-label={`Paid placement: ${p.disclosureLabel??'Sponsored'}`}><span>{p.disclosureLabel??'Sponsored'}</span></span>}
    {hasCopy&&<div className={`promotion-copy-position promotion-align-${view.textAlign} promotion-position-${view.textPosition}`}>
      <div className={`promotion-copy promotion-motion-${p.motion??'static'}`} data-direction={p.direction??'left'}>
        {!view.modern&&view.sponsored&&<span className="text-xs font-medium">Sponsored</span>}
        {view.showTitle&&<h3>{slide.title}</h3>}
        {view.showBody&&slide.body&&<p>{slide.body}</p>}
        {view.showCta&&href&&<span className="promotion-cta">{p.ctaLabel||'Learn more'} <span aria-hidden="true">→</span></span>}
      </div>
    </div>}
  </>;
  const cls=`promotion-banner ${view.modern?'promotion-modern':`promotion-format-${p.format??'compact'}`} ${view.modern&&home?'promotion-home':''} promotion-background-${p.backgroundMode??'auto'} promotion-scheme-${view.scheme} ${view.sponsored?`promotion-sponsored promotion-label-${p.disclosureY??'top'}`:''} relative block w-full overflow-hidden`;
  // The artwork remains a named banner link when labels are hidden; no invisible CTA is rendered.
  const shared={className:cls,style,'aria-label':view.sponsored?`${p.disclosureLabel??'Sponsored'}: ${slide.title}`:slide.title};
  return href ? <a {...shared} href={href} target={href.startsWith('https:')?'_blank':undefined} rel="noopener noreferrer" onClick={()=>surface&&trackBannerClick(surface,slide.id)}>{content}</a>:<section {...shared}>{content}</section>;
}
