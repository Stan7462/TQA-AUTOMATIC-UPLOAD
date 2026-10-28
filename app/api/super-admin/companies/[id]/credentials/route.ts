import {env} from '@/lib/local-env';
import {auditSuper,getSuperSession,superHeaders,superSameOrigin} from '@/lib/super-auth';
import {decryptPin} from '@/lib/pin-vault';
export const dynamic='force-dynamic';

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if(!superSameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403,headers:superHeaders});
  const session=await getSuperSession(request);
  if(!session)return Response.json({error:'Super admin sign-in required.'},{status:401,headers:superHeaders});
  const {id}=await context.params;
  const row=await env.DB.prepare(`SELECT t.name AS companyName,a.tech_id AS adminId,a.pin_ciphertext AS ciphertext,a.must_change_credentials AS setupPending
    FROM tenants t JOIN technicians a ON a.tenant_id=t.id AND a.is_admin=1 AND a.active=1
    WHERE t.id=? ORDER BY a.created_at,a.tech_id LIMIT 1`).bind(id).first<{companyName:string;adminId:string;ciphertext:string|null;setupPending:number}>();
  if(!row)return Response.json({error:'No active supervisor login is available for this company.'},{status:404,headers:superHeaders});
  if(!row.ciphertext)return Response.json({error:'This older supervisor password cannot be copied because no recoverable credential is stored.'},{status:409,headers:superHeaders});
  try{
    const password=await decryptPin(row.ciphertext,env.PIN_ENCRYPTION_KEY);
    await auditSuper(session.login,'company.copy_login',id,{adminId:row.adminId});
    return Response.json({companyName:row.companyName,adminId:row.adminId,password,setupPending:row.setupPending===1},{headers:superHeaders});
  }catch{
    return Response.json({error:'Could not copy this company login. Please try again.'},{status:503,headers:superHeaders});
  }
}
