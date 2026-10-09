import { env } from "@/lib/local-env";
import { getTechSessionContext, sameOrigin } from "@/lib/tech-auth";
import { updatePushDevice } from "@/lib/push-device.mjs";
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({error:"Invalid origin"},{status:403});
  const user=await getTechSessionContext(request,env.DB);
  if(!user||user.mustSetup)return Response.json({error:"Sign in first"},{status:401});
  const body=await request.json().catch(()=>null) as {status?: unknown; subscriptionId?: unknown; activate?: unknown}|null;
  if(!body||!["connected","not_subscribed","blocked","unsupported"].includes(String(body.status)))return Response.json({error:"Invalid status"},{status:400});
  const subscriptionId = typeof body.subscriptionId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.subscriptionId) ? body.subscriptionId : null;
  if (body.activate === true && (!subscriptionId || body.status !== "connected")) return Response.json({error:"This phone has not finished subscribing. Try again."},{status:400});
  const active = await updatePushDevice(env.DB,user,{status:String(body.status),subscriptionId,activate:body.activate === true});
  return Response.json({ok:true,active}, {headers:{"Cache-Control":"private, no-store"}});
}
