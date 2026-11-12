import { z } from 'zod';
import { COMPACT_AD_PAGE_IDS, COMPACT_AD_PAGES } from './compactAdPages';

export function safePromotionLink(value:string) {
  if (!value) return true;
  if (/[\s\\<>\u0000-\u001f]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password; } catch { return false; }
}
export function safePromotionImage(value:string) {
  return !value || (/^\/(?:api\/banner-image\/|__l5e\/assets-v1\/|assets\/)[a-zA-Z0-9._\/-]+$/.test(value) && !value.includes('..'));
}
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const promotionSchema=z.object({
  presentationVersion:z.literal(2).optional(),
  textScheme:z.enum(['auto','light','dark']).optional(),
  backgroundMode:z.enum(['auto','light','dark','custom','transparent']).optional(),
  homeRatio:z.enum(['6:1','3:1','16:9','1:1','4:5','9:16']).optional(),
  disclosureLabel:z.string().trim().min(2).max(32).regex(/^(Sponsored|Ad|Promoted)(?: · [\p{L}\p{N} .&-]{1,20})?$/u,'Start with Sponsored, Ad or Promoted; optional attribution follows ·').optional(),
  disclosureX:z.enum(['left','center','right']).optional(),disclosureY:z.enum(['top','middle','bottom']).optional(),
  disclosureSize:z.number().int().min(8).max(16).optional(),disclosureInset:z.number().int().min(0).max(16).optional(),
  disclosureTheme:z.enum(['light','dark','transparent','custom']).optional(),
  disclosureBackground:color.optional(),disclosureForeground:color.optional(),disclosureOpacity:z.number().int().min(0).max(100).optional(),
  showTitle:z.boolean().optional(),showBody:z.boolean().optional(),showCta:z.boolean().optional(),
  textAlign:z.enum(['left','center','right']).optional(),textPosition:z.enum(['top','middle','bottom']).optional(),
  ctaLabel:z.string().trim().max(40).optional(), sponsored:z.boolean().optional(),
  status:z.enum(['draft','published']).optional(),priority:z.number().int().min(-100).max(100).optional(),
  mobileImageUrl:z.string().max(500).refine(safePromotionImage).optional(),
  focalX:z.number().min(0).max(100).optional(),focalY:z.number().min(0).max(100).optional(),
  mobileFocalX:z.number().min(0).max(100).optional(),mobileFocalY:z.number().min(0).max(100).optional(),
  fit:z.enum(['cover','contain']).optional(), format:z.enum(['compact','landscape','portrait']).optional(),
  backgroundColor:color.optional(),textColor:color.optional(),overlayAlpha:z.number().min(0).max(100).optional(),
  radius:z.number().min(0).max(8).optional(),motion:z.enum(['static','fade','slide','marquee','zoom']).optional(),
  direction:z.enum(['left','right']).optional(),speedSeconds:z.number().min(5).max(60).optional(),
  delayMs:z.number().min(1500).max(60000).optional(),transitionMs:z.number().min(0).max(2000).optional(),
});
export type PromotionOptions=z.infer<typeof promotionSchema>;
/** Only explicit editor interactions opt a slide into the compact presentation. Never called on reads. */
export function editedPromotion(slide:{layout?:string;promotion?:PromotionOptions}):PromotionOptions {
  const p=slide.promotion??{};
  if(p.presentationVersion===2)return p;
  const imageOnly=slide.layout==='full';
  return {...p,presentationVersion:2,fit:'contain',textScheme:'auto',showTitle:!imageOnly,showBody:!imageOnly,showCta:!imageOnly,textAlign:'left',textPosition:'middle'};
}
export function promotionPresentation(slide:{layout?:string;promotion?:PromotionOptions}) {
  const p=slide.promotion??{};
  const modern=p.presentationVersion===2;
  const scheme=p.textScheme==='auto'||!p.textScheme
    ? contrastRatio(p.backgroundColor??'#18252d','#ffffff')>=contrastRatio(p.backgroundColor??'#18252d','#111111')?'light':'dark'
    : p.textScheme;
  return {modern,scheme,fit:p.fit??(modern?'contain':'cover'),showTitle:modern?p.showTitle??slide.layout!=='full':true,
    showBody:modern?p.showBody??slide.layout!=='full':true,showCta:modern?p.showCta??slide.layout!=='full':true,
    textAlign:p.textAlign??'left',textPosition:p.textPosition??'middle',sponsored:p.sponsored===true};
}
export function contrastRatio(background:string,foreground:string) {
  function luminance(hex:string) { const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045 ? c/12.92:((c+0.055)/1.055)**2.4); return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2]; }
  if(!color.safeParse(background).success||!color.safeParse(foreground).success) return 0;
  const a=luminance(background),b=luminance(foreground);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
export function disclosureColors(p:PromotionOptions) {
  const custom=p.disclosureTheme==='custom'&&contrastRatio(p.disclosureBackground??'',p.disclosureForeground??'')>=4.5;
  return custom ? {bg:p.disclosureBackground,fg:p.disclosureForeground} : p.disclosureTheme==='light'
    ? {bg:'var(--fb-promotion-light-scrim)',fg:'var(--fb-promotion-dark-ink)'}
    : {bg:'var(--fb-promotion-dark-scrim)',fg:'var(--fb-promotion-light-ink)'};
}
export function promotionVisibility(slide:{isActive?:boolean;promotion?:PromotionOptions;schedule?:{startAt?:string|null;endAt?:string|null;days?:number[]|null}|null},now=new Date()) {
  if(slide.promotion?.status==='draft')return 'Draft';
  if(slide.isActive===false)return 'Paused';
  if(slide.schedule?.endAt&&now.getTime()>Date.parse(slide.schedule.endAt))return 'Expired';
  if(slide.schedule?.startAt&&now.getTime()<Date.parse(slide.schedule.startAt))return 'Scheduled';
  if(slide.schedule?.days?.length&&!slide.schedule.days.includes(now.getDay()))return 'Scheduled';
  return 'Live now';
}
export const promotionSlideSchema=z.object({
  id:z.string().trim().min(1).max(64).optional(),title:z.string().trim().min(1).max(80),body:z.string().trim().max(160).optional(),
  imageUrl:z.string().trim().max(500).nullable().optional(),href:z.string().trim().max(500).nullable().optional(),
  theme:z.enum(['swap','bridge']).optional(),isActive:z.boolean().optional(),layout:z.enum(['compact','logo','full']).optional(),
  schedule:z.object({startAt:z.string().datetime().nullable().optional(),endAt:z.string().datetime().nullable().optional(),days:z.array(z.number().int().min(0).max(6)).max(7).nullable().optional()}).nullable().optional(),
  promotion:promotionSchema.optional(),
}).superRefine((slide,ctx)=>{
  if (!safePromotionLink(slide.href??'')) ctx.addIssue({code:'custom',message:'Use an internal path or HTTPS link',path:['href']});
  if (slide.schedule?.startAt&&slide.schedule.endAt&&Date.parse(slide.schedule.endAt)<=Date.parse(slide.schedule.startAt)) ctx.addIssue({code:'custom',message:'End must follow start',path:['schedule']});
  if(slide.promotion?.motion==='marquee' && (slide.title.length+(slide.body?.length??0)>120)) ctx.addIssue({code:'custom',message:'Marquee text must be 120 characters or fewer',path:['promotion','motion']});
  const p=slide.promotion;
  if(p?.disclosureTheme==='custom'&&contrastRatio(p.disclosureBackground??'',p.disclosureForeground??'')<4.5)ctx.addIssue({code:'custom',message:'Disclosure colors need at least 4.5:1 contrast',path:['promotion','disclosureForeground']});
  if(p?.backgroundMode==='custom'&&contrastRatio(p.backgroundColor??'',p.textColor??'')<4.5)ctx.addIssue({code:'custom',message:'Custom text colors need at least 4.5:1 contrast',path:['promotion','textColor']});
});
export const compactPagePlacementSchema=z.object({
  enabled:z.boolean().default(false),creativeIds:z.array(z.string().trim().min(1).max(64)).max(12).default([]),
  startAt:z.string().datetime().nullable().default(null),endAt:z.string().datetime().nullable().default(null),
  dismissal:z.enum(['session','cooldown']).default('session'),dismissalScope:z.enum(['page','global']).default('page'),
  cooldownMinutes:z.number().int().min(1).max(10080).default(1440),autoHideSeconds:z.number().int().min(0).max(300).default(0),
  position:z.enum(['above-nav-center','above-nav-left','above-nav-right']).default('above-nav-center'),
}).superRefine((p,ctx)=>{if(p.startAt&&p.endAt&&Date.parse(p.endAt)<=Date.parse(p.startAt))ctx.addIssue({code:'custom',message:'End must follow start',path:['endAt']});});
export type CompactPagePlacement=z.infer<typeof compactPagePlacementSchema>;
export const dockedAdSchema=z.object({enabled:z.boolean().default(false),pages:z.partialRecord(z.enum(COMPACT_AD_PAGE_IDS),compactPagePlacementSchema).default({}),surfaces:z.array(z.enum(['home','swap','bridge','cabot','explore'])).max(5).default([]),slides:z.array(promotionSlideSchema).max(12).default([]),dismissal:z.enum(['session','cooldown']).default('session'),cooldownMinutes:z.number().int().min(1).max(10080).default(1440),autoHideSeconds:z.number().int().min(0).max(300).default(0)}).superRefine((ad,ctx)=>{
  for(const page of COMPACT_AD_PAGES){const p=ad.pages[page.id];if(!p)continue;if(p.enabled&&!page.eligible)ctx.addIssue({code:'custom',message:'Sensitive pages are excluded',path:['pages',page.id]});for(const id of p.creativeIds)if(!ad.slides.some(s=>s.id===id))ctx.addIssue({code:'custom',message:'Select an existing creative',path:['pages',page.id,'creativeIds']});}
  for(const [i,slide] of ad.slides.entries()){if(slide.promotion?.sponsored!==true||slide.promotion?.presentationVersion!==2||!slide.promotion?.status)ctx.addIssue({code:'custom',message:'Docked ads require versioned artwork, publication status and paid disclosure',path:['slides',i,'promotion']});if(!slide.imageUrl||!safePromotionImage(slide.imageUrl))ctx.addIssue({code:'custom',message:'Upload docked artwork before saving',path:['slides',i,'imageUrl']});}
});
export type DockedAdSettings=Omit<z.infer<typeof dockedAdSchema>,'slides'> & {slides:(z.infer<typeof promotionSlideSchema>&{id:string})[]};
export const promotionBannersSchema=z.object({cabot:z.object({intervalMs:z.number().min(1500).max(60000),slides:z.array(promotionSlideSchema).max(12)}),swap:z.object({intervalMs:z.number().min(1500).max(60000),slides:z.array(promotionSlideSchema).max(12)}),bridge:z.object({intervalMs:z.number().min(1500).max(60000),slides:z.array(promotionSlideSchema).max(12)}),home:z.object({intervalMs:z.number().min(1500).max(60000),slides:z.array(promotionSlideSchema).max(12)}),docked:dockedAdSchema.optional()});