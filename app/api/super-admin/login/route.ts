import {superSameOrigin} from '@/lib/super-auth';
import {env} from '@/lib/local-env';
import {auditSuper,createSuperSession,superConfigured,superCookie,superCredentialsMatch,superHeaders} from '@/lib/super-auth';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  if(!superSameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
  if(!superConfigured())return Response.json({error:'Configure SUPER_LOGIN and SUPER_PASSWORD (at least 12 characters) in the server environment.'},{status:503,headers:superHeaders});
  if(Number(request.headers.get('content-length')??0)>4096)return Response.json({error:'Invalid sign-in request.'},{status:400});
  const raw=await request.text();if(raw.length>4096)return Response.json({error:'Invalid sign-in request.'},{status:400});
  let body:{login?:unknown;password?:unknown};try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid sign-in request.'},{status:400});}
  if(!body||typeof body.login!=='string'||typeof body.password!=='string'||body.login.length>254||body.password.length>1024)return Response.json({error:'Enter your super admin login and password.'},{status:400});
  const now=Date.now(),windowStart=now-15*60*1000;
  const limit=await env.DB.prepare("SELECT failures,window_start AS windowStart FROM super_admin_login_limits WHERE bucket='login'").first<{failures:number;windowStart:number}>();
  if(limit&&limit.windowStart>windowStart&&limit.failures>=10)return Response.json({error:'Too many sign-in attempts. Try again in 15 minutes.'},{status:429,headers:{...superHeaders,'Retry-After':'900'}});
  if(!superCredentialsMatch(body.login,body.password)){
    await env.DB.prepare("INSERT INTO super_admin_login_limits(bucket,failures,window_start) VALUES('login',1,?) ON CONFLICT(bucket) DO UPDATE SET failures=CASE WHEN super_admin_login_limits.window_start<=? THEN 1 ELSE super_admin_login_limits.failures+1 END, window_start=CASE WHEN super_admin_login_limits.window_start<=? THEN excluded.window_start ELSE super_admin_login_limits.window_start END").bind(now,windowStart,windowStart).run();
    return Response.json({error:'Invalid super admin login or password.'},{status:401,headers:superHeaders});
  }
  await env.DB.prepare("DELETE FROM super_admin_login_limits WHERE bucket='login'").run();
  const token=await createSuperSession();await auditSuper(process.env.SUPER_LOGIN!.trim(),'super.sign_in',null);
  return Response.json({ok:true},{headers:{...superHeaders,'Set-Cookie':superCookie(request,token)}});
}
