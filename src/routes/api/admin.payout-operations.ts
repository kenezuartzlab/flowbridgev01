import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const Route=createFileRoute('/api/admin/payout-operations')({server:{handlers:{
 GET:async({request})=>{
  const {requireAdmin}=await import('@/lib/admin/adminGate.server');
  const gate=await requireAdmin(request); if(!gate.ok)return gate.response;
  try {
   const {buildRewardSolvencyReport}=await import('@/lib/rewards/rewardSolvency.server');
   const report=await buildRewardSolvencyReport();
   return Response.json({report,viewer:{role:gate.admin.role}}, {headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Payout checks unavailable. Re-check; signing stays disabled.'},{status:503});}
 },
 POST:async({request})=>{
  const {requireAdmin}=await import('@/lib/admin/adminGate.server');
  const gate=await requireAdmin(request); if(!gate.ok)return gate.response;
  const body=z.discriminatedUnion('action',[
   z.object({action:z.literal('prepare-renewal')}),
   z.object({action:z.literal('approve-renewal'),id:z.string().uuid(),fingerprint:z.string().regex(/^0x[0-9a-f]{64}$/i),confirm:z.literal(true)}),
  ]).safeParse(await request.json().catch(()=>null));
  if(!body.success)return Response.json({error:'Review the current proposal before approving.'},{status:400});
  try{
   const m=await import('@/lib/rewards/scheduleRenewal.server');
   if(body.data.action==='approve-renewal')return Response.json(await m.approveRenewal(gate.admin,body.data.id,body.data.fingerprint));
   const {buildRewardSolvencyReport}=await import('@/lib/rewards/rewardSolvency.server');
   const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
   const p=(await buildRewardSolvencyReport()).settlement.renewal;
   if(!p?.ready)return Response.json({error:'Schedule-only renewal is blocked. Re-check funding, allocation and publication state.'},{status:409});
   return Response.json({proposal:p,record:await m.recordRenewalProposal(supabaseAdmin,p,gate.admin)});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'Action unavailable; re-check.'},{status:409});}
 },
}}});