import { z } from 'zod';

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
export function contrastRatio(background:string,foreground:string) {
  function luminance(hex:string) { const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045 ? c/12.92:((c+0.055)/1.055)**2.4); return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2]; }
  if(!color.safeParse(background).success||!color.safeParse(foreground).success) return 0;
  const a=luminance(background),b=luminance(foreground);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
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
});
export const promotionBannersSchema=z.object({cabot:z.object({intervalMs:z.number().min(1500).max(60000),slides:z.array(promotionSlideSchema).max(12)}),swap:z.object({intervalMs:z.number().min(1500).max(60000),slides:z.array(promotionSlideSchema).max(12)}),bridge:z.object({intervalMs:z.number().min(1500).max(60000),slides:z.array(promotionSlideSchema).max(12)}),home:z.object({intervalMs:z.number().min(1500).max(60000),slides:z.array(promotionSlideSchema).max(12)})});