import { useState } from 'react';
import { Plus,Trash2,RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BannerSlide } from '@/lib/config/appConfig';
import { dockedAdSchema,compactPagePlacementSchema,type CompactPagePlacement,type DockedAdSettings } from '@/lib/banners/promotionPolicy';
import { COMPACT_AD_PAGES,type CompactAdPageId } from '@/lib/banners/compactAdPages';
import { uploadBannerImage } from '@/lib/admin/adminApi';
import { DockedAdCreative } from '@/components/banners/DockedAd';
import { PromotionOptionsEditor } from './PromotionOptionsEditor';

export function DockedAdEditor({value,onChange,wallet}:{value?:DockedAdSettings;onChange:(v:DockedAdSettings)=>void;wallet:string}) {
  const p:DockedAdSettings=value??{...dockedAdSchema.parse({}),slides:[]},[error,setError]=useState(''),[closed,setClosed]=useState(false),[device,setDevice]=useState('mobile');
  const patch=(v:Partial<DockedAdSettings>)=>onChange({...p,...v});
  const edit=(i:number,v:Partial<BannerSlide>)=>patch({slides:p.slides.map((s,n)=>n===i?{...s,...v}:s)});
  const [selectedPage,setSelectedPage]=useState<CompactAdPageId>('home');
  const pageRule=p.pages?.[selectedPage]??compactPagePlacementSchema.parse({});
  const patchPage=(v:Partial<CompactPagePlacement>)=>patch({pages:{...p.pages,[selectedPage]:{...pageRule,...v}}});
  const input='w-full rounded-md border border-hairline bg-background px-2 py-2 text-sm';
  const first=[...p.slides].sort((a,b)=>(b.promotion?.priority??0)-(a.promotion?.priority??0))[0];
  return <section className="space-y-4 border-t border-hairline pt-4" aria-label="Docked ad management">
    <h3 className="font-bold">Compact Ad Placement Manager</h3>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.enabled} onChange={e=>patch({enabled:e.target.checked})}/>Global master switch</label>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{COMPACT_AD_PAGES.map(page=><label key={page.id} className="flex min-w-0 items-start gap-2 text-sm"><input type="checkbox" aria-label={`Enable compact ad: ${page.label}`} disabled={!page.eligible} checked={!!p.pages?.[page.id]?.enabled} onChange={e=>patch({pages:{...p.pages,[page.id]:{...(p.pages?.[page.id]??compactPagePlacementSchema.parse({})),enabled:e.target.checked}}})}/><span className="min-w-0 break-words">{page.label}<span className="block text-xs text-muted-foreground">{page.route}{!page.eligible?' · Excluded — sensitive':''}</span></span></label>)}</div>
    <label className="block text-sm">Page settings<select className={input} value={selectedPage} onChange={e=>{setSelectedPage(e.target.value as CompactAdPageId);setClosed(false);}}>{COMPACT_AD_PAGES.filter(s=>s.eligible).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Dismissal<select className={input} value={pageRule.dismissal} onChange={e=>patchPage({dismissal:e.target.value as CompactPagePlacement['dismissal']})}><option value="session">Until next browser session</option><option value="cooldown">Cooldown</option></select></label>
      <label className="text-sm">Dismissal scope<select className={input} value={pageRule.dismissalScope} onChange={e=>patchPage({dismissalScope:e.target.value as CompactPagePlacement['dismissalScope']})}><option value="page">This page only</option><option value="global">All pages</option></select></label>
      <label className="text-sm">Cooldown (minutes)<input type="number" className={input} min={1} max={10080} value={pageRule.cooldownMinutes} onChange={e=>patchPage({cooldownMinutes:Number(e.target.value)})}/></label>
      <label className="text-sm">Auto disappear (seconds; 0 = off)<input type="number" className={input} min={0} max={300} value={pageRule.autoHideSeconds} onChange={e=>patchPage({autoHideSeconds:Number(e.target.value)})}/></label>
      <label className="text-sm">Position<select className={input} value={pageRule.position} onChange={e=>patchPage({position:e.target.value as CompactPagePlacement['position']})}><option value="above-nav-center">Above navigation · Center</option><option value="above-nav-left">Above navigation · Left</option><option value="above-nav-right">Above navigation · Right</option></select></label>
      {(['startAt','endAt'] as const).map(k=><label key={k} className="text-sm">Page {k==='startAt'?'start':'end'} (UTC)<input type="datetime-local" className={input} value={pageRule[k]?.slice(0,16)??''} onChange={e=>patchPage({[k]:e.target.value?`${e.target.value}:00.000Z`:null})}/></label>)}
    </div>
    <fieldset className="space-y-2"><legend className="text-sm">Page creatives · first available in selected order</legend>{p.slides.map(s=><label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pageRule.creativeIds.includes(s.id)} onChange={e=>patchPage({creativeIds:e.target.checked?[...pageRule.creativeIds,s.id]:pageRule.creativeIds.filter(id=>id!==s.id)})}/>{s.title}<span className="text-muted-foreground">{pageRule.creativeIds.indexOf(s.id)>=0?`#${pageRule.creativeIds.indexOf(s.id)+1}`:''}</span></label>)}</fieldset>
    <div className="flex gap-2"><Button variant="outline" onClick={()=>setDevice(device==='mobile'?'desktop':'mobile')}>{device==='mobile'?'Mobile preview':'Desktop preview'}</Button><Button variant="ghost" size="icon" title="Restore preview" aria-label="Restore ad preview" onClick={()=>setClosed(false)}><RefreshCw className="size-4"/></Button></div>
    <div className={`banner-admin-preview ${device==='mobile'?'banner-preview-mobile':'banner-preview-desktop'} compact-position-${pageRule.position} mx-auto`}>{(p.slides.find(s=>s.id===pageRule.creativeIds[0])??first)&&!closed&&<DockedAdCreative slide={p.slides.find(s=>s.id===pageRule.creativeIds[0])??first} onClose={()=>setClosed(true)}/>}</div>
    {p.slides.map((slide,i)=><div key={slide.id} className="space-y-3 border-t border-hairline pt-3">
      <div className="flex items-center gap-2"><label className="min-w-0 flex-1 text-sm">Ad title<input className={input} value={slide.title} maxLength={80} onChange={e=>edit(i,{title:e.target.value})}/></label><Button variant="ghost" size="icon" aria-label="Remove docked ad" onClick={()=>{const pages={...p.pages};for(const key of Object.keys(pages) as CompactAdPageId[]){const v=pages[key];if(v)pages[key]={...v,creativeIds:v.creativeIds.filter(id=>id!==slide.id)};}patch({slides:p.slides.filter((_,n)=>n!==i),pages});}}><Trash2 className="size-4"/></Button></div>
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