import { useEffect,useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppConfig,type BannerSlide } from '@/lib/config/appConfig';
import { dismissalBlocks,dockedSurface,selectDockedAd } from '@/lib/banners/dockedAdPolicy';
import type { DockedAdSettings } from '@/lib/banners/promotionPolicy';
import { trackBannerImpression } from '@/lib/banners/analytics';
import { PromotionBanner } from './PromotionBanner';
import { useTradeTab } from '@/lib/trade/tradeSession';

/** Same tiny creative for admin and visitors. Close is outside the link. */
export function DockedAdCreative({slide,onClose,surface}:{slide:BannerSlide;onClose:()=>void;surface?:'home'|'swap'|'bridge'|'cabot'}) {
  return <aside className="docked-ad-slot" aria-label="Sponsored placement">
    <PromotionBanner surface={surface} slide={{...slide,promotion:{...slide.promotion,presentationVersion:2,sponsored:true,fit:'contain',showTitle:false,showBody:false,showCta:false,motion:'static'}}}/>
    <Button type="button" variant="ghost" size="icon" className="docked-ad-close" aria-label="Close ad" title="Close ad" onClick={onClose}><X className="size-3"/></Button>
  </aside>;
}

export function DockedAd({settings:override,path:overridePath,preview=false}:{settings?:DockedAdSettings;path?:string;preview?:boolean}) {
  const config=useAppConfig();
  const pathname=useRouterState({select:s=>s.location.pathname});
  const [tab]=useTradeTab();
  const settings=override??config.banners.docked,path=overridePath??((pathname==='/'||pathname==='/trade')?(tab==='BRIDGE'?'/bridge':tab==='CA/BOT'?'/cabot':'/trade'):pathname);
  const [ready,setReady]=useState(false),[blocked,setBlocked]=useState(false),[keyboard,setKeyboard]=useState(false),[now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    const refresh=()=>{
      setNow(Date.now());
      if(!settings){setReady(true);return;}
      try {const raw=localStorage.getItem('fb-docked-ad-close');const closedAt=raw===null?null:Number(raw);setBlocked(dismissalBlocks(settings,{session:sessionStorage.getItem('fb-docked-ad-dismissed')==='1',closedAt:closedAt!==null&&Number.isFinite(closedAt)?closedAt:null},Date.now()));}catch{setBlocked(true);}
      setReady(true);
    };
    if(preview){setReady(true);setBlocked(false);return;}
    refresh();const timer=setInterval(refresh,1000);window.addEventListener('storage',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('storage',refresh);};
  },[settings,preview]);
  useEffect(()=>{
    const check=()=>{const el=document.activeElement;const editing=el instanceof HTMLElement&&(el.matches('input,textarea,select')||el.isContentEditable);setKeyboard(editing||!!window.visualViewport&&window.visualViewport.height<window.innerHeight*.75);};
    document.addEventListener('focusin',check);document.addEventListener('focusout',check);window.visualViewport?.addEventListener('resize',check);check();
    return()=>{document.removeEventListener('focusin',check);document.removeEventListener('focusout',check);window.visualViewport?.removeEventListener('resize',check);};
  },[]);
  const slide=preview&&!blocked?settings?.slides[0]??null:selectDockedAd(settings,path,blocked,new Date(now));
  const close=()=>{setBlocked(true);if(preview)return;try{sessionStorage.setItem('fb-docked-ad-dismissed','1');localStorage.setItem('fb-docked-ad-close',String(Date.now()));}catch{/* closed for this mount even if storage is unavailable */}};
  useEffect(()=>{
    if(!slide||!ready||keyboard||preview)return;
    const surface=dockedSurface(path);if(surface)trackBannerImpression(surface==='explore'?'home':surface,slide.id);
  },[slide?.id,ready,keyboard,preview,path]);
  useEffect(()=>{
    if(!slide||!ready||keyboard||preview||!settings?.autoHideSeconds)return;
    const timer=setTimeout(close,settings.autoHideSeconds*1000);return()=>clearTimeout(timer);
  },[slide?.id,ready,keyboard,preview,settings?.autoHideSeconds]);
  if(!ready||keyboard||!slide)return null;
  const surface=dockedSurface(path);
  return <DockedAdCreative slide={slide} onClose={close} surface={preview?undefined:surface==='explore'?'home':surface??undefined}/>;
}