import {superSameOrigin} from '@/lib/super-auth';
import {env} from '@/lib/local-env';
import {getSuperSession,auditSuper,superHeaders} from '@/lib/super-auth';
export async function POST(request:Request){
 if(!superSameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 const session=await getSuperSession(request);if(!session)return Response.json({error:'Super admin sign-in required.'},{status:401});
 await auditSuper(session.login,'company.leave',session.selectedTenantId);
 await env.DB.prepare('UPDATE super_admin_sessions SET selected_tenant_id=NULL,context_expires_at=NULL WHERE token_hash=?').bind(session.tokenHash).run();
 return new Response(null,{status:303,headers:{...superHeaders,Location:'/super-admin'}});
}
