import type { BannerSlide } from '@/lib/config/appConfig';
import { promotionVisibility, type DockedAdSettings } from './promotionPolicy';
import { COMPACT_AD_PAGES,compactAdPage, type CompactAdPageId } from './compactAdPages';

export function dockedSurface(path:string):DockedAdSettings['surfaces'][number]|null {
  if(path==='/'||path==='/home')return 'home';
  if(path==='/trade')return 'swap';
  if(path==='/bridge')return 'bridge';
  if(path==='/cabot')return 'cabot';
  if(path==='/discover'||path==='/markets')return 'explore';
  return null;
}
export function dismissalBlocks(settings:Pick<DockedAdSettings,'dismissal'|'cooldownMinutes'>,record:{session:boolean;closedAt:number|null},now:number) {
  return settings.dismissal==='session'?record.session:record.closedAt!==null&&now<record.closedAt+settings.cooldownMinutes*60000;
}
export function selectDockedAd(settings:DockedAdSettings|undefined,path:string,blocked:boolean,now=new Date()):BannerSlide|null {
  return selectPageAd(settings,compactAdPage(path),blocked,now);
}
export function selectPageAd(settings:DockedAdSettings|undefined,page:CompactAdPageId|null,blocked:boolean,now=new Date()):BannerSlide|null {
  if(!settings?.enabled||!page||blocked||!COMPACT_AD_PAGES.some(p=>p.id===page&&p.eligible))return null;
  const p=settings.pages?.[page];
  if(!p?.enabled||promotionVisibility({schedule:p},now)!=='Live now')return null;
  return p.creativeIds.map(id=>settings.slides.find(s=>s.id===id)).filter((s):s is BannerSlide=>!!s&&s.promotion?.status==='published'&&s.promotion?.sponsored===true&&promotionVisibility(s,now)==='Live now')[0]??null;
}
export function dismissalKey(page:CompactAdPageId,scope:'page'|'global'){return `fb-compact-ad-v2:${scope==='global'?'global':page}`;}