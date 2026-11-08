import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v.toLowerCase() as `0x${string}`);
const hash=z.string().regex(/^0x[0-9a-f]{64}$/).transform(v=>v as `0x${string}`);
const command=z.discriminatedUnion('action',[
  // Code hash and publisher are derived server-side from the frozen artifact; client values are stripped.
  z.object({action:z.literal('authorize_future_cutover'),address,cutoverAt:z.iso.datetime()}),
  z.object({action:z.literal('sync_settings'),address,owner:address,publisher:address,batchCapFlow:z.string().regex(/^\d{1,12}(\.\d{1,18})?$/),dailyCapFlow:z.string().regex(/^\d{1,12}(\.\d{1,18})?$/)}),
  z.object({action:z.literal('prepare'),after:z.uuid().optional()}),
  z.object({action:z.literal('stage_carryover'),snapshotHash:hash}),
  z.object({action:z.literal('confirm_carryover'),snapshotId:z.uuid(),snapshotHash:hash,verifiedPoints:z.number().int().nonnegative().max(100000000),goodwillBudget:z.number().int().nonnegative().max(100000000)}),
  z.object({action:z.literal('verify_credit'),batchId:hash,txHash:hash}),
  z.object({action:z.literal('review_batch'),batchId:hash}),
  z.object({action:z.literal('acquire_signing'),batchId:hash}),
  z.object({action:z.literal('attach_hash'),operationId:z.uuid(),txHash:hash}),
  z.object({action:z.literal('resume_signing'),operationId:z.uuid(),txHash:hash.optional()}),
  z.object({action:z.literal('wallet_rejected'),operationId:z.uuid()}),
]);
export const Route = createFileRoute('/api/admin/rewards-vault-v2')({server:{handlers:{
  GET:async({request})=>{
    const {requireAdmin}=await import('@/lib/admin/adminGate.server');
    const {jsonResponse}=await import('@/lib/api-auth.server');
    const gate=await requireAdmin(request);if(!gate.ok)return gate.response;
    try{const {vaultV2OpsStatus}=await import('@/lib/rewards/vaultV2.server');return jsonResponse(await vaultV2OpsStatus());}
    catch{return jsonResponse({error:'Vault V2 status unavailable. No financial action was performed.'},503);}
  },
  POST:async({request})=>{
    const {requireAdmin}=await import('@/lib/admin/adminGate.server');const gate=await requireAdmin(request);if(!gate.ok)return gate.response;
    const {jsonResponse}=await import('@/lib/api-auth.server');
    try{
      const input=command.parse(await request.json());
      if(['authorize_future_cutover','sync_settings','prepare','verify_credit','stage_carryover','confirm_carryover'].includes(input.action)&&gate.admin.role!=='super_admin')return jsonResponse({error:'Super Admin only.'},403);
      if(input.action==='authorize_future_cutover'){
        const {authorizeVaultCutover}=await import('@/lib/rewards/vaultV2Activation.server');
        return jsonResponse(await authorizeVaultCutover(gate.admin,input));
      }
      if(input.action==='sync_settings'){
        const {syncVaultSettings}=await import('@/lib/rewards/vaultV2Activation.server');
        try{const r=await syncVaultSettings(gate.admin,input);return jsonResponse(r,r.saved?200:409);}
        catch(e){return jsonResponse({saved:false,error:e instanceof Error&&e.message.startsWith('Resolve')?e.message:'Live on-chain check failed: the entered owner/publisher do not match the frozen vault on BOT Mainnet, or the vault is unfunded. Nothing was saved.'},409);}
      }
      const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
      if(input.action==='stage_carryover'||input.action==='confirm_carryover'){
        const legacy=await import('@/lib/rewards/legacyCarryover.server');
        return jsonResponse(input.action==='stage_carryover'?await legacy.stageLegacyCarryover(db,gate.admin,input.snapshotHash):await legacy.confirmLegacyCarryover(db,gate.admin,input));
      }
      if(input.action==='review_batch'||input.action==='acquire_signing'){
        const p=await import('@/lib/rewards/vaultV2Publisher.server');
        return jsonResponse(await (input.action==='review_batch'?p.reviewVaultPublisher:p.acquireVaultPublisher)(db,gate.admin,input.batchId));
      }
      if(input.action==='attach_hash'||input.action==='resume_signing'||input.action==='wallet_rejected'){
        const p=await import('@/lib/rewards/vaultV2Publisher.server');
        if(input.action==='attach_hash')return jsonResponse(await p.attachVaultPublisherHash(db,gate.admin,input.operationId,input.txHash));
        if(input.action==='wallet_rejected')return jsonResponse(await p.cancelVaultPublisher(db,gate.admin,input.operationId));
        return jsonResponse(await p.resumeVaultPublisher(db,gate.admin,input.operationId,input.txHash));
      }
      if(input.action==='prepare'){
        const {reserveVaultV2Awards}=await import('@/lib/rewards/vaultV2Allocator.server');
        const result=input.after?await reserveVaultV2Awards(db,input.after):await reserveVaultV2Awards(db);
        return jsonResponse(result&&'continuation' in result?{batch:null,continuation:result.continuation}:{batch:result});
      }
      const {ingestVaultV2Credit}=await import('@/lib/rewards/vaultV2Ingestion.server');
      return jsonResponse(await ingestVaultV2Credit(db,input.batchId,input.txHash));
    }catch{return jsonResponse({error:'Vault action could not complete. Check deployment, publisher, funding, cutover and exact evidence. Any unknown submission stays reserved; resume verification, never blindly resend.'},409);}
  },
}}});