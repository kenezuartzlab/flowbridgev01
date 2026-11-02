import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v.toLowerCase() as `0x${string}`);
const hash=z.string().regex(/^0x[0-9a-f]{64}$/).transform(v=>v as `0x${string}`);
const command=z.discriminatedUnion('action',[
  z.object({action:z.literal('authorize_future_cutover'),address,codeHash:hash,publisher:address,cutoverAt:z.iso.datetime()}),
  z.object({action:z.literal('prepare')}),
  z.object({action:z.literal('verify_credit'),batchId:hash,txHash:hash}),
]);
export const Route = createFileRoute('/api/admin/rewards-vault-v2')({server:{handlers:{
  GET:async({request})=>{
    const {requireAdmin}=await import('@/lib/admin/adminGate.server');
    const {jsonResponse}=await import('@/lib/api-auth.server');
    const gate=await requireAdmin(request);if(!gate.ok)return gate.response;
    if(gate.admin.role!=='super_admin')return jsonResponse({error:'Super Admin only.'},403);
    try{const {vaultV2OpsStatus}=await import('@/lib/rewards/vaultV2.server');return jsonResponse(await vaultV2OpsStatus());}
    catch{return jsonResponse({error:'Vault V2 status unavailable. No financial action was performed.'},503);}
  },
  POST:async({request})=>{
    const {requireAdmin}=await import('@/lib/admin/adminGate.server');const gate=await requireAdmin(request);if(!gate.ok)return gate.response;
    const {jsonResponse}=await import('@/lib/api-auth.server');
    if(gate.admin.role!=='super_admin')return jsonResponse({error:'Super Admin only.'},403);
    try{
      const input=command.parse(await request.json());
      if(input.action==='authorize_future_cutover'){
        const {authorizeVaultCutover}=await import('@/lib/rewards/vaultV2Activation.server');
        return jsonResponse(await authorizeVaultCutover(gate.admin,input));
      }
      const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
      if(input.action==='prepare'){
        const {reserveVaultV2Awards}=await import('@/lib/rewards/vaultV2Allocator.server');
        return jsonResponse({batch:await reserveVaultV2Awards(db)});
      }
      const {ingestVaultV2Credit}=await import('@/lib/rewards/vaultV2Ingestion.server');
      return jsonResponse(await ingestVaultV2Credit(db,input.batchId,input.txHash));
    }catch{return jsonResponse({error:'Vault action rejected. Deployment, funding, cutover and exact evidence gates must pass. No transaction was signed or sent.'},409);}
  },
}}});