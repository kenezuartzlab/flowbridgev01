import type { BannerSlide } from '@/lib/config/appConfig';
import { promotionVisibility, type DockedAdSettings } from './promotionPolicy';

export function dockedSurface(path:string):DockedAdSettings['surfaces'][number]|null {
  if(path==='/'||path==='/home')return 'home';
  if(path==='/trade')return 'swap';
  if(path==='/bridge')return 'bridge';
  if(path==='/cabot')return 'cabot';
  if(path==='/discover'||path==='/markets')return 'explore';
  return null;
}
export function dismissalBlocks(settings:DockedAdSettings,record:{session:boolean;closedAt:number|null},now:number) {
  return settings.dismissal==='session'?record.session:record.closedAt!==null&&now<record.closedAt+settings.cooldownMinutes*60000;
}
export function selectDockedAd(settings:DockedAdSettings|undefined,path:string,blocked:boolean,now=new Date()):BannerSlide|null {
  const surface=dockedSurface(path);
  if(!settings?.enabled||!surface||!settings.surfaces.includes(surface)||blocked)return null;
  return [...settings.slides].filter(s=>s.promotion?.status==='published'&&s.promotion?.sponsored===true&&promotionVisibility(s,now)==='Live now').sort((a,b)=>(b.promotion?.priority??0)-(a.promotion?.priority??0))[0]??null;
}