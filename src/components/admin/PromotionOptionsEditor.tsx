import type { BannerSlide } from '@/lib/config/appConfig';
import { editedPromotion,promotionPresentation,promotionVisibility,type PromotionOptions } from '@/lib/banners/promotionPolicy';
import { Button } from '@/components/ui/button';
import { uploadBannerImage } from '@/lib/admin/adminApi';
import { useState } from 'react';

export function PromotionOptionsEditor({slide,onChange,wallet,surface,docked=false}:{slide:BannerSlide;onChange:(p:PromotionOptions)=>void;wallet:string;surface?:string;docked?:boolean}) {
  const [error,setError]=useState('');const p=slide.promotion??{};const view=promotionPresentation(slide);const patch=(v:Partial<PromotionOptions>)=>onChange({...editedPromotion(slide),...v});
  const input='w-full min-w-0 rounded-md border border-hairline bg-background px-2 py-2 text-sm';
  const slider=(key:'focalX'|'focalY'|'mobileFocalX'|'mobileFocalY'|'overlayAlpha'|'radius',label:string,max=100)=><label className="block text-sm">{label} · {p[key]??(key==='radius'?8:50)}<input className="w-full" type="range" min={0} max={max} value={p[key]??(key==='radius'?8:50)} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>;
  return <details className="border-t border-hairline pt-3"><summary className="cursor-pointer text-sm font-bold">Promotion design & publishing</summary><div className="mt-3 space-y-3">
    {!slide.promotion&&<Button variant="outline" onClick={()=>patch({status:'draft',motion:'static'})}>Enable advanced promotion</Button>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Publication<select className={input} value={p.status??'published'} onChange={e=>patch({status:e.target.value as PromotionOptions['status']})}><option value="draft">Draft</option><option value="published">Published</option></select></label>
      <output className="self-center text-sm text-muted">{promotionVisibility(slide)} · derived visibility</output>
      <label className="text-sm">Priority<input className={input} type="number" min={-100} max={100} value={p.priority??0} onChange={e=>patch({priority:Number(e.target.value)})}/></label>
      <label className="text-sm">CTA label<input className={input} maxLength={40} value={p.ctaLabel??''} onChange={e=>patch({ctaLabel:e.target.value})}/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={docked} checked={docked||p.sponsored===true} onChange={e=>patch({sponsored:e.target.checked})}/>Paid promotion · disclosure required</label>
      {(p.sponsored||docked)&&<>
        <label className="text-sm">Disclosure wording<input className={input} maxLength={32} value={p.disclosureLabel??'Sponsored'} onChange={e=>patch({disclosureLabel:e.target.value})}/></label>
        <label className="text-sm">Disclosure horizontal<select className={input} value={p.disclosureX??'right'} onChange={e=>patch({disclosureX:e.target.value as PromotionOptions['disclosureX']})}>{['left','center','right'].map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="text-sm">Disclosure vertical<select className={input} value={p.disclosureY??'top'} onChange={e=>patch({disclosureY:e.target.value as PromotionOptions['disclosureY']})}>{['top','middle','bottom'].map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="text-sm">Disclosure theme<select className={input} value={p.disclosureTheme??'dark'} onChange={e=>patch({disclosureTheme:e.target.value as PromotionOptions['disclosureTheme']})}>{['light','dark','transparent','custom'].map(v=><option key={v} value={v}>{v==='transparent'?'Transparent / backed lettering':v}</option>)}</select></label>
        {(['disclosureSize','disclosureInset','disclosureOpacity'] as const).map((key,i)=><label key={key} className="text-sm">{['Disclosure size','Disclosure inset','Disclosure backing opacity'][i]}<input className="w-full" type="range" min={key==='disclosureSize'?8:0} max={key==='disclosureOpacity'?100:16} value={p[key]??(key==='disclosureSize'?9:key==='disclosureInset'?4:100)} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}
        {p.disclosureTheme==='custom'&&(['disclosureBackground','disclosureForeground'] as const).map(key=><label key={key} className="text-sm">{key==='disclosureBackground'?'Disclosure background':'Disclosure foreground'}<input type="color" className="block h-10 w-16" value={p[key]??(key==='disclosureBackground'?'#18252d':'#ffffff')} onChange={e=>patch({[key]:e.target.value})}/></label>)}
        <p className="text-xs text-muted sm:col-span-2">Sponsored, Ad or Promoted; optional attribution: Sponsored · Brand. Text keeps contrast backing over unknown artwork. Preview placement around printed text.</p>
      </>}
      {surface==='home'&&<label className="text-sm">Home artwork ratio<select className={input} value={p.homeRatio??'6:1'} onChange={e=>patch({homeRatio:e.target.value as PromotionOptions['homeRatio']})}>{['6:1','3:1','16:9','1:1','4:5','9:16'].map(v=><option key={v}>{v}</option>)}</select></label>}
      <label className="text-sm">Overlay background<select className={input} value={p.backgroundMode??'auto'} onChange={e=>patch({backgroundMode:e.target.value as PromotionOptions['backgroundMode']})}>{['auto','light','dark','custom','transparent'].map(v=><option key={v} value={v}>{v==='transparent'?'Transparent / no scrim (backed text)':v}</option>)}</select></label>
      {p.backgroundMode==='custom'&&<label className="text-sm">Text foreground<input type="color" className="block h-10 w-16" value={p.textColor??'#ffffff'} onChange={e=>patch({textColor:e.target.value})}/></label>}
      <label className="text-sm">Artwork fit<select className={input} value={view.fit} onChange={e=>patch({fit:e.target.value as PromotionOptions['fit']})}><option value="contain">Show entire image</option><option value="cover">Fill frame (crop)</option></select></label>
      <label className="text-sm">Text mode<select className={input} value={p.textScheme??'auto'} onChange={e=>patch({textScheme:e.target.value as PromotionOptions['textScheme']})}><option value="auto">Automatic contrast</option><option value="light">Light text</option><option value="dark">Dark text</option></select></label>
      <div className="flex flex-wrap gap-3">{(['showTitle','showBody','showCta'] as const).map((key,i)=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={view[key]} onChange={e=>patch({[key]:e.target.checked})}/>{['Show title','Show body','Show CTA'][i]}</label>)}</div>
      <label className="text-sm">Horizontal placement<select className={input} value={view.textAlign} onChange={e=>patch({textAlign:e.target.value as PromotionOptions['textAlign']})}>{['left','center','right'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label className="text-sm">Vertical placement<select className={input} value={view.textPosition} onChange={e=>patch({textPosition:e.target.value as PromotionOptions['textPosition']})}>{['top','middle','bottom'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      {slider('focalX','Desktop focal X')}{slider('focalY','Desktop focal Y')}{slider('mobileFocalX','Mobile focal X')}{slider('mobileFocalY','Mobile focal Y')}
      <label className="text-sm">Background<input className="block h-10 w-16" type="color" value={p.backgroundColor??'#18252d'} onChange={e=>patch({backgroundColor:e.target.value})}/></label>
      {!view.modern&&<label className="text-sm">Legacy text<input className="block h-10 w-16" type="color" value={p.textColor??'#ffffff'} onChange={e=>patch({textColor:e.target.value})}/></label>}
      {!view.modern&&slider('overlayAlpha','Legacy overlay opacity %')}{slider('radius','Corner radius',8)}
      <label className="text-sm">Motion<select className={input} value={p.motion??'static'} onChange={e=>patch({motion:e.target.value as PromotionOptions['motion']})}>{['static','fade','slide','marquee','zoom'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label className="text-sm">Direction<select className={input} value={p.direction??'left'} onChange={e=>patch({direction:e.target.value as PromotionOptions['direction']})}><option value="left">Left</option><option value="right">Right</option></select></label>
      <label className="text-sm">Motion speed (seconds)<input className={input} type="number" min={5} max={60} value={p.speedSeconds??15} onChange={e=>patch({speedSeconds:Number(e.target.value)})}/></label>
      <label className="text-sm">Slide delay (seconds)<input className={input} type="number" min={1.5} max={60} step={0.5} value={(p.delayMs??4000)/1000} onChange={e=>patch({delayMs:Number(e.target.value)*1000})}/></label>
      <label className="text-sm">Transition (milliseconds)<input className={input} type="number" min={0} max={2000} value={p.transitionMs??500} onChange={e=>patch({transitionMs:Number(e.target.value)})}/></label>
      <label className="text-sm">Mobile artwork<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setError('');try{const r=await uploadBannerImage(wallet,file);patch({mobileImageUrl:r.url});}catch(err){setError(err instanceof Error?err.message:'Upload failed');}e.target.value='';}}/></label>
    </div>
    <p className="text-xs text-muted">Trading tabs stay 6:1. Home supports tall and wide artwork up to 480px high. Drafts stay private; Published may be scheduled, paused or expired. Preview changes before saving.</p>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
  </div></details>;
}