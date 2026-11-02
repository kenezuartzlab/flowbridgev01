import { createFileRoute } from '@tanstack/react-router';
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
    return new Response(JSON.stringify({error:'Vault V2 is view-only. Financial activation and cutover require separate authorization.'}),{status:409,headers:{'Content-Type':'application/json'}});
  },
}}});