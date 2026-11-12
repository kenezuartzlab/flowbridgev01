import { useState } from 'react';
import { Plus,Trash2,RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BannerSlide } from '@/lib/config/appConfig';
import { dockedAdSchema,type DockedAdSettings } from '@/lib/banners/promotionPolicy';
import { uploadBannerImage } from '@/lib/admin/adminApi';
import { DockedAdCreative } from '@/components/banners/DockedAd';
import { PromotionOptionsEditor } from './PromotionOptionsEditor';

export function DockedAdEditor({value,onChange,wallet}:{value?:DockedAdSettings;onChange:(v:DockedAdSettings)=>void;wallet:string}) {
  const p:DockedAdSettings=value??{...dockedAdSchema.parse({}),slides:[]},[error,setError]=useState(''),[closed,setClosed]=useState(false),[device,setDevice]=useState('mobile');
  const patch=(v:Partial<DockedAdSettings>)=>onChange({...p,...v});
  const edit=(i:number,v:Partial<BannerSlide>)=>patch({slides:p.slides.map((s,n)=>n===i?{...s,...v}:s)});
  const input='w-full rounded-md border border-hairline bg-background px-2 py-2 text-sm';
  const first=[...p.slides].sort((a,b)=>(b.promotion?.priority??0)-(a.promotion?.priority??0))[0];
  return <section className="space-y-4 border-t border-hairline pt-4" aria-label="Docked ad management">
    <h3 className="font-bold">Compact docked ad</h3>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.enabled} onChange={e=>patch({enabled:e.target.checked})}/>Enable placement after saving</label>
    <div className="flex flex-wrap gap-3">{(['home','swap','bridge','cabot','explore'] as const).map(s=><label key={s} className="text-sm"><input type="checkbox" checked={p.surfaces.includes(s)} onChange={e=>patch({surfaces:e.target.checked?[...p.surfaces,s]:p.surfaces.filter(v=>v!==s)})}/> {s}</label>)}</div>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Dismissal<select className={input} value={p.dismissal} onChange={e=>patch({dismissal:e.target.value as DockedAdSettings['dismissal']})}><option value="session">Until next browser session</option><option value="cooldown">Cooldown</option></select></label>
      <label className="text-sm">Cooldown (minutes)<input type="number" className={input} min={1} max={10080} value={p.cooldownMinutes} onChange={e=>patch({cooldownMinutes:Number(e.target.value)})}/></label>
      <label className="text-sm">Auto disappear (seconds; 0 = off)<input type="number" className={input} min={0} max={300} value={p.autoHideSeconds} onChange={e=>patch({autoHideSeconds:Number(e.target.value)})}/></label>
    </div>
    <div className="flex gap-2"><Button variant="outline" onClick={()=>setDevice(device==='mobile'?'desktop':'mobile')}>{device==='mobile'?'Mobile preview':'Desktop preview'}</Button><Button variant="ghost" size="icon" title="Restore preview" aria-label="Restore ad preview" onClick={()=>setClosed(false)}><RefreshCw className="size-4"/></Button></div>
    <div className={`banner-admin-preview ${device==='mobile'?'banner-preview-mobile':'banner-preview-desktop'} mx-auto`}>{first&&!closed&&<DockedAdCreative slide={first} onClose={()=>setClosed(true)}/>}</div>
    {p.slides.map((slide,i)=><div key={slide.id} className="space-y-3 border-t border-hairline pt-3">
      <div className="flex items-center gap-2"><label className="min-w-0 flex-1 text-sm">Ad title<input className={input} value={slide.title} maxLength={80} onChange={e=>edit(i,{title:e.target.value})}/></label><Button variant="ghost" size="icon" aria-label="Remove docked ad" onClick={()=>patch({slides:p.slides.filter((_,n)=>n!==i)})}><Trash2 className="size-4"/></Button></div>
      <label className="block text-sm">Artwork<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{setError('');const r=await uploadBannerImage(wallet,file);edit(i,{imageUrl:r.url});}catch(err){setError(err instanceof Error?err.message:'Upload failed');}e.target.value='';}}/></label>
      <label className="block text-sm">Destination<input className={input} maxLength={500} value={slide.href??''} onChange={e=>edit(i,{href:e.target.value})}/></label>
      <div className="grid gap-3 sm:grid-cols-2">{(['startAt','endAt'] as const).map(k=><label key={k} className="text-sm">{k==='startAt'?'Start (UTC)':'End (UTC)'}<input type="datetime-local" className={input} value={slide.schedule?.[k]?.slice(0,16)??''} onChange={e=>edit(i,{schedule:{...slide.schedule,[k]:e.target.value?`${e.target.value}:00.000Z`:null}})}/></label>)}</div>
      <label className="text-sm"><input type="checkbox" checked={slide.isActive!==false} onChange={e=>edit(i,{isActive:e.target.checked})}/> Placement enabled</label>
      <PromotionOptionsEditor slide={slide} wallet={wallet} docked onChange={promotion=>edit(i,{promotion:{...promotion,sponsored:true}})}/>
    </div>)}
    <Button variant="outline" disabled={p.slides.length>=12} onClick={()=>patch({slides:[...p.slides,{id:`dock-${Date.now()}`,title:'New docked ad',imageUrl:'',href:'',layout:'full',isActive:true,promotion:{presentationVersion:2,status:'draft',sponsored:true,fit:'contain',showTitle:false,showBody:false,showCta:false,motion:'static'}}]})}><Plus className="size-4"/>Add draft ad</Button>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
  </section>;
}