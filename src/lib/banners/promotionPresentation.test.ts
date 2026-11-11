import {describe,it,expect} from 'vitest';
import {editedPromotion,promotionPresentation,promotionSchema,contrastRatio} from './promotionPolicy';
import {mergeBanners} from '@/lib/config/appConfig';
describe('versioned banner presentation',()=>{
  it('does not opt legacy settings into edited presentation on reads',()=>{
    const slide={id:'old',title:'Old',layout:'full' as const,promotion:{fit:'cover' as const,format:'portrait' as const}};
    const original=JSON.stringify(slide);
    const merged=mergeBanners({swap:{intervalMs:4000,slides:[slide]}}).swap.slides[0];
    expect(merged.promotion?.presentationVersion).toBeUndefined();
    expect(promotionPresentation(merged)).toMatchObject({modern:false,fit:'cover',showTitle:true,showBody:true,showCta:true});
    expect(JSON.stringify(slide)).toBe(original);
  });
  it('explicitly edited full artwork defaults to entire image and no duplicated text',()=>{
    const p=editedPromotion({layout:'full',promotion:{sponsored:true,status:'draft'}});
    expect(p).toMatchObject({presentationVersion:2,fit:'contain',showTitle:false,showBody:false,showCta:false,status:'draft'});
    expect(promotionPresentation({layout:'full',promotion:p}).sponsored).toBe(true);
  });
  it('normal and full layouts accept the same versioned options',()=>{
    for(const layout of ['compact','logo','full'])expect(promotionPresentation({layout,promotion:{presentationVersion:2,fit:'contain'}})).toMatchObject({modern:true,fit:'contain'});
  });
  it('retains each saved visibility and placement choice on later edits',()=>{
    const p=promotionSchema.parse({presentationVersion:2,showTitle:false,showBody:true,showCta:false,textAlign:'right',textPosition:'bottom',textScheme:'dark',fit:'cover'});
    expect(editedPromotion({layout:'full',promotion:p})).toEqual(p);
    expect(promotionPresentation({promotion:p})).toMatchObject({showTitle:false,showBody:true,showCta:false,textAlign:'right',textPosition:'bottom',scheme:'dark',fit:'cover'});
  });
  it('validates all new setting enums and boolean bounds',()=>{
    for(const p of [{presentationVersion:3},{textScheme:'red'},{showTitle:'false'},{showCta:1},{textAlign:'outside'},{textPosition:'above'}])expect(promotionSchema.safeParse(p).success).toBe(false);
  });
  it('uses readable light and dark scrim pairs',()=>{
    expect(contrastRatio('#18252d','#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff','#111111')).toBeGreaterThanOrEqual(4.5);
    expect(promotionPresentation({promotion:{backgroundColor:'#ffffff',textScheme:'auto'}}).scheme).toBe('dark');
    expect(promotionPresentation({promotion:{backgroundColor:'#18252d',textScheme:'auto'}}).scheme).toBe('light');
  });
});