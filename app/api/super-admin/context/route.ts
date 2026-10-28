import {superSameOrigin} from '@/lib/super-auth';
import {env} from '@/lib/local-env';
import {getSuperSession,auditSuper,superHeaders,SUPER_CONTEXT_LIFETIME} from '@/lib/super-auth';
export async function POST(request:Request){
 if(!superSameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 const session=await getSuperSession(request);if(!session)return Response.json({error:'Super admin sign-in required.'},{status:401,headers:superHeaders});
 const body=await request.json().catch(()=>null) as {tenantId?:unknown}|null;
 if(typeof body?.tenantId!=='string'||body.tenantId.length>80)return Response.json({error:'Choose a company.'},{status:400});
 const company=await env.DB.prepare('SELECT id,name FROM tenants WHERE id=?').bind(body.tenantId).first<{id:string;name:string}>();
 if(!company)return Response.json({error:'Company not found.'},{status:404});
 await env.DB.batch([
  env.DB.prepare('UPDATE super_admin_sessions SET selected_tenant_id=?,context_expires_at=? WHERE token_hash=?').bind(company.id,Date.now()+SUPER_CONTEXT_LIFETIME,session.tokenHash),
  env.DB.prepare('INSERT INTO super_admin_audit(id,actor,action,tenant_id,details,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),session.login,'company.enter',company.id,JSON.stringify({name:company.name}),Date.now()),
 ]);
 return Response.json({url:'/',name:company.name},{headers:superHeaders});
}
