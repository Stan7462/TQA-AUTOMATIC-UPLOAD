import {POST as companyLogin} from '@/app/api/profile/login/route';
import {POST as superLogin} from '@/app/api/super-admin/login/route';
import {getSuperSession,superCookie,superHeaders,superSameOrigin} from '@/lib/super-auth';
import {clearTechCookie,getTechSessionContext} from '@/lib/tech-auth';
import {env} from '@/lib/local-env';
export const dynamic='force-dynamic';
function destination(request:Request,role:string,mustSetup=false){
  if(role==='super_admin')return '/super-admin';
  if(mustSetup)return '/admin-setup';
  if(role==='technician')return '/capture';
  const requested=new URL(request.url).searchParams.get('return_to');
  return requested&&['/','/captures','/settings','/history','/extension','/notifications','/records/all','/records/approved','/records/needs-review'].includes(requested)?requested:'/';
}
export async function GET(request:Request){
  if(await getSuperSession(request))return Response.json({role:'super_admin',destination:'/super-admin'},{headers:superHeaders});
  const tech=await getTechSessionContext(request,env.DB);
  if(!tech)return Response.json({error:'Sign in required.'},{status:401,headers:superHeaders});
  const role=tech.isAdmin?'supervisor':'technician';
  return Response.json({role,destination:destination(request,role,tech.mustSetup)},{headers:superHeaders});
}
export async function POST(request:Request){
  if(!superSameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403,headers:superHeaders});
  const raw=await request.text();
  if(raw.length>4096)return Response.json({error:'Invalid sign-in request.'},{status:400,headers:superHeaders});
  let body:{login?:unknown;password?:unknown};try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid sign-in request.'},{status:400,headers:superHeaders});}
  if(!body||typeof body.login!=='string'||typeof body.password!=='string'||body.login.length>254||body.password.length>1024)return Response.json({error:'Enter your login ID and PIN or password.'},{status:400,headers:superHeaders});
  const login=body.login.trim(),password=body.password;
  function forwarded(payload:unknown){const headers=new Headers(request.headers);headers.set('content-type','application/json');headers.delete('content-length');return new Request(request.url,{method:'POST',headers,body:JSON.stringify(payload)});}
  let superFailure:Response|null=null;
  if(process.env.SUPER_LOGIN?.trim().toLowerCase()===login.toLowerCase()){
    const response=await superLogin(forwarded({login,password}));
    if(response.ok){
      const headers=new Headers(response.headers);
      const secure=(request.headers.get('x-forwarded-proto')||new URL(request.url).protocol.replace(':',''))==='https';
      headers.append('Set-Cookie',clearTechCookie(secure));
      return Response.json({role:'super_admin',destination:'/super-admin'},{headers});
    }
    if(response.status!==401)return response;
    superFailure=response;
  }
  const response=await companyLogin(forwarded({techId:login,pin:password}));
  if(!response.ok){
    if(superFailure)return Response.json({error:'Invalid login ID, PIN, or password, or access is temporarily locked.'},{status:401,headers:superHeaders});
    return response;
  }
  const data=await response.json() as {isAdmin:boolean;requiresAdminSetup:boolean};
  const role=data.isAdmin?'supervisor':'technician';
  const session=await getSuperSession(request);
  if(session)await env.DB.prepare('DELETE FROM super_admin_sessions WHERE token_hash=?').bind(session.tokenHash).run();
  const headers=new Headers(response.headers);headers.append('Set-Cookie',superCookie(request,'',true));
  return Response.json({role,destination:destination(request,role,data.requiresAdminSetup)},{headers});
}
