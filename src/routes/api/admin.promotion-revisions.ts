import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
export const Route = createFileRoute('/api/admin/promotion-revisions')({server:{handlers:{
  GET:async({request})=>{
    const {requireAdmin}=await import('@/lib/admin/adminGate.server');const g=await requireAdmin(request);if(!g.ok)return g.response;
    if(g.admin.role!=='super_admin')return Response.json({error:'Super admin required'},{status:403});
    const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
    const {data,error}=await db.from('promotion_revisions').select('id,created_at').order('created_at',{ascending:false}).limit(30);
    return Response.json(error?{error:'History unavailable'}:{revisions:data},{status:error?503:200,headers:{'Cache-Control':'no-store'}});
  },
  POST:async({request})=>{
    const {requireAdmin}=await import('@/lib/admin/adminGate.server');const g=await requireAdmin(request);if(!g.ok)return g.response;
    if(g.admin.role!=='super_admin')return Response.json({error:'Super admin required'},{status:403});
    const p=z.object({id:z.string().uuid()}).safeParse(await request.json().catch(()=>null));if(!p.success)return Response.json({error:'Revision required'},{status:400});
    const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {data,error}=await db.from('promotion_revisions').select('value').eq('id',p.data.id).single();
    if(error||!data)return Response.json({error:'Revision unavailable'},{status:404});
    const {promotionBannersSchema}=await import('@/lib/banners/promotionPolicy');const valid=promotionBannersSchema.safeParse(data.value);
    if(!valid.success)return Response.json({error:'Historical revision requires safe-link review before restore'},{status:409});
    try{const {writeSetting}=await import('@/lib/appConfig.server');await writeSetting('banners',valid.data,g.admin);return Response.json({success:true});}catch{return Response.json({error:'Restore not saved'},{status:503});}
  }
}}});