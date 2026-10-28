import {superSameOrigin} from '@/lib/super-auth';
import {env} from '@/lib/local-env';
import {getSuperSession,auditSuper,superCookie,superHeaders} from '@/lib/super-auth';
export async function POST(request:Request){
 if(!superSameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 const session=await getSuperSession(request);
 if(session){await auditSuper(session.login,'super.sign_out',null);await env.DB.prepare('DELETE FROM super_admin_sessions WHERE token_hash=?').bind(session.tokenHash).run();}
 return new Response(null,{status:303,headers:{...superHeaders,Location:'/super-admin','Set-Cookie':superCookie(request,'',true)}});
}
