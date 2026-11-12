import { useEffect,useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouterState } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppConfig,type BannerSlide } from '@/lib/config/appConfig';
import { dismissalBlocks,dockedSurface,selectPageAd,dismissalKey } from '@/lib/banners/dockedAdPolicy';
import type { DockedAdSettings } from '@/lib/banners/promotionPolicy';
import { trackBannerImpression } from '@/lib/banners/analytics';
import { PromotionBanner } from './PromotionBanner';
import { compactAdPage } from '@/lib/banners/compactAdPages';
import { useTradeTab } from '@/lib/trade/tradeSession';

/** Same tiny creative for admin and visitors. Close is outside the link. */
export function DockedAdCreative({slide,onClose,surface}:{slide:BannerSlide;onClose:()=>void;surface?:'home'|'swap'|'bridge'|'cabot'}) {
  return <aside className="docked-ad-slot" aria-label="Sponsored placement">
    <PromotionBanner surface={surface} slide={{...slide,promotion:{...slide.promotion,presentationVersion:2,sponsored:true,fit:'contain',radius:4,disclosureLabel:'Ad',disclosureX:'left',disclosureY:'top',disclosureInset:4,showTitle:false,showBody:false,showCta:false,motion:'static'}}}/>
    <Button type="button" variant="ghost" size="icon" className="docked-ad-close" aria-label="Close ad" title="Close ad" onClick={onClose}><span className="docked-ad-close-mark"><X className="size-3"/></span></Button>
  </aside>;
}

export function DockedAd({settings:override,path:overridePath,preview=false,central=false}:{settings?:DockedAdSettings;path?:string;preview?:boolean;central?:boolean}) {
  const config=useAppConfig();
  const location=useRouterState({select:s=>s.location});
  const pathname=location.pathname;
  const [tab]=useTradeTab();
  const settings=override??config.banners.docked;
  const page=compactAdPage(overridePath??pathname,overridePath?'BOT/USDT':tab,location.hash);
  const path=page==='bridge'?'/bridge':page==='cabot'?'/cabot':page==='swap'?'/trade':pathname;
  const placement=page?settings?.pages?.[page]:undefined;
  const storageKey=page?dismissalKey(page,placement?.dismissalScope??'page'):null;
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{if(central)setMounted(true);},[central]);
  const [readyKey,setReadyKey]=useState<string|null>(null),[blockedKey,setBlockedKey]=useState<string|null>(null),[keyboard,setKeyboard]=useState(false),[now,setNow]=useState(()=>Date.now());
  const ready=preview||!!storageKey&&readyKey===storageKey;
  useEffect(()=>{
    const refresh=()=>{
      setNow(Date.now());
      if(!placement||!storageKey){setReadyKey(null);return;}
      try {
        const globalKey='fb-compact-ad-v2:global';
        const globalBlocked=sessionStorage.getItem(globalKey)==='1'||Number(localStorage.getItem(globalKey)??0)>Date.now();
        const raw=localStorage.getItem(storageKey);const closedAt=raw===null?null:Number(raw);
        const pageBlocked=placement.dismissalScope==='page'&&dismissalBlocks(placement,{session:sessionStorage.getItem(storageKey)==='1',closedAt:closedAt!==null&&Number.isFinite(closedAt)?closedAt:null},Date.now());
        setBlockedKey(globalBlocked||pageBlocked?storageKey:null);
      }catch{setBlockedKey(storageKey);}
      setReadyKey(storageKey);
    };
    if(preview){setReadyKey(storageKey);setBlockedKey(null);return;}
    refresh();const timer=setInterval(refresh,1000);window.addEventListener('storage',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('storage',refresh);};
  },[placement,storageKey,preview]);
  useEffect(()=>{
    const check=()=>{const el=document.activeElement;const editing=el instanceof HTMLElement&&(el.matches('input,textarea,select')||el.isContentEditable);setKeyboard(editing||!!document.querySelector('[role=dialog],[role=alertdialog],[aria-modal=true],.transaction-modal-layer')||!!window.visualViewport&&window.visualViewport.height<window.innerHeight*.75);};
    const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state','aria-modal','role']});document.addEventListener('focusin',check);document.addEventListener('focusout',check);window.visualViewport?.addEventListener('resize',check);check();
    return()=>{observer.disconnect();document.removeEventListener('focusin',check);document.removeEventListener('focusout',check);window.visualViewport?.removeEventListener('resize',check);};
  },[]);
  const blocked=storageKey!==null&&blockedKey===storageKey;
  const slide=preview&&!blocked?settings?.slides[0]??null:selectPageAd(settings,page,blocked,new Date(now));
  const close=()=>{if(!storageKey||!placement)return;setBlockedKey(storageKey);if(preview)return;try{
    if(placement.dismissalScope==='global'){
      if(placement.dismissal==='session')sessionStorage.setItem(storageKey,'1');
      else localStorage.setItem(storageKey,String(Date.now()+placement.cooldownMinutes*60000));
    }else{sessionStorage.setItem(storageKey,'1');localStorage.setItem(storageKey,String(Date.now()));}
  }catch{/* closed for this mount even if storage is unavailable */}};
  useEffect(()=>{
    if(!slide||!ready||keyboard||preview)return;
    const surface=dockedSurface(path);trackBannerImpression(!surface||surface==='explore'?'home':surface,slide.id);
  },[slide?.id,ready,keyboard,preview,path]);
  useEffect(()=>{
    if(!slide||!ready||keyboard||preview||!placement?.autoHideSeconds)return;
    const timer=setTimeout(close,placement.autoHideSeconds*1000);return()=>clearTimeout(timer);
  },[slide?.id,ready,keyboard,preview,placement?.autoHideSeconds,storageKey,page]);
  const visible=ready&&!keyboard&&!!slide;
  // Reserve bottom content space only while the fixed dock is visible; collapses on close.
  useEffect(()=>{
    if(!central)return;
    const root=document.documentElement;
    if(!visible){root.style.removeProperty('--compact-ad-reserve');return;}
    const measure=()=>{
      const nav=document.querySelector('nav[aria-label="Main navigation"]');
      const mobile=nav instanceof HTMLElement&&getComputedStyle(nav).display!=="none";
      if(mobile){const top=nav.getBoundingClientRect().top;if(top>0)root.style.setProperty('--fb-bottom-nav-offset',`${Math.max(0,window.innerHeight-top)}px`);}
      const dock=document.querySelector('.compact-ad-dock');
      const art=dock?.querySelector('.promotion-banner');
      root.style.setProperty('--compact-ad-reserve',`${dock?dock.getBoundingClientRect().height:0}px`);
    };
    const ro=new ResizeObserver(measure);let watched:Element|null=null;
    const attach=()=>{const nav=document.querySelector('nav[aria-label="Main navigation"]');if(nav&&nav!==watched){if(watched)ro.unobserve(watched);watched=nav;ro.observe(nav);}measure();};
    attach();const mo=new MutationObserver(attach);mo.observe(document.body,{childList:true,subtree:true});const tick=setInterval(measure,500);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
    return()=>{clearInterval(tick);ro.disconnect();mo.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('scroll',measure);root.style.removeProperty('--compact-ad-reserve');root.style.removeProperty('--fb-bottom-nav-offset');};
  },[central,visible,slide?.id]);
  if(!visible||!slide)return null;
  const surface=dockedSurface(path);
  const creative=<div data-compact-page={page} className={`${central?'compact-ad-dock ':''}compact-position-${placement?.position??'above-nav-center'}`}><DockedAdCreative slide={slide} onClose={close} surface={preview?undefined:!surface||surface==='explore'?'home':surface}/></div>;
  if(central)return mounted?createPortal(creative,document.body):null;
  return creative;
}