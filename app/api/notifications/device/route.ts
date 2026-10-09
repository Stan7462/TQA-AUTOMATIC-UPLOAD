import { env } from "@/lib/local-env";
import { getTechSessionContext, sameOrigin } from "@/lib/tech-auth";
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({error:"Invalid origin"},{status:403});
  const user=await getTechSessionContext(request,env.DB);
  if(!user||user.mustSetup)return Response.json({error:"Sign in first"},{status:401});
  const body=await request.json().catch(()=>null) as {status?: unknown}|null;
  if(!body||!["connected","not_subscribed","blocked","unsupported"].includes(String(body.status)))return Response.json({error:"Invalid status"},{status:400});
  await env.DB.prepare("UPDATE push_accounts SET device_status=?,device_checked_at=? WHERE tenant_id=? AND tech_id=?").bind(String(body.status),Date.now(),user.tenantId,user.techId).run();
  return Response.json({ok:true});
}
