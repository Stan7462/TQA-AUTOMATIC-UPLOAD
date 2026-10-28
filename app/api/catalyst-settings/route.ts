import {isOwner} from '@/app/access';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {env} from '@/lib/local-env';
import {superSameOrigin} from '@/lib/super-auth';
import {catalystIncludesScreenshot} from '@/lib/trust-api';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){
  const user=await getChatGPTUser();
  if(!isOwner(user))return Response.json({error:'Supervisor access required.'},{status:403,headers});
  return Response.json({includeScreenshot:await catalystIncludesScreenshot(user!.tenantId)},{headers});
}
export async function PUT(request:Request){
  if(!superSameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403,headers});
  const user=await getChatGPTUser();
  if(!isOwner(user))return Response.json({error:'Supervisor access required.'},{status:403,headers});
  const body=await request.json().catch(()=>null) as {includeScreenshot?:unknown}|null;
  if(typeof body?.includeScreenshot!=='boolean')return Response.json({error:'Choose whether to include account screenshots.'},{status:400,headers});
  const result=await env.DB.prepare('UPDATE tenants SET catalyst_include_screenshot=? WHERE id=?').bind(body.includeScreenshot?1:0,user!.tenantId).run();
  if(!result.meta.changes)return Response.json({error:'Company not found.'},{status:404,headers});
  return Response.json({includeScreenshot:body.includeScreenshot},{headers});
}
