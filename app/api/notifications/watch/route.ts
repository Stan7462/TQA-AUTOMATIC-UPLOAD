import { env } from "@/lib/local-env";
import { getTechSessionContext, normalizeTechId, sameOrigin } from "@/lib/tech-auth";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getTechSessionContext(request, env.DB);
  if (!user?.isAdmin || user.mustSetup) return Response.json({ error: "Forbidden" }, { status: 403 });
  const watches = await env.DB.prepare("SELECT t.tech_id AS techId, COALESCE(w.upload_enabled,c.watch_upload_enabled,0) AS uploadEnabled, COALESCE(w.fixed_enabled,c.watch_fixed_enabled,0) AS fixedEnabled FROM technicians t LEFT JOIN push_company_preferences c ON c.tenant_id=t.tenant_id LEFT JOIN push_watches w ON w.tenant_id=t.tenant_id AND w.tech_id=t.tech_id AND w.supervisor_id=? WHERE t.tenant_id=? AND t.is_admin=0").bind(user.techId,user.tenantId).all<{techId:string;uploadEnabled:number;fixedEnabled:number}>();
  const defaults = await env.DB.prepare("SELECT watch_upload_enabled AS uploadEnabled,watch_fixed_enabled AS fixedEnabled FROM push_company_preferences WHERE tenant_id=?").bind(user.tenantId).first<{uploadEnabled:number;fixedEnabled:number}>();
  const overrides = await env.DB.prepare("SELECT upload_enabled AS uploadEnabled,fixed_enabled AS fixedEnabled FROM push_watches WHERE tenant_id=?").bind(user.tenantId).all<{uploadEnabled:number;fixedEnabled:number}>();
  const team={uploadEnabled:!!defaults?.uploadEnabled,fixedEnabled:!!defaults?.fixedEnabled,uploadMixed:overrides.results.some(w=>!!w.uploadEnabled!==!!defaults?.uploadEnabled),fixedMixed:overrides.results.some(w=>!!w.fixedEnabled!==!!defaults?.fixedEnabled)};
  return Response.json({techIds:watches.results.filter(w=>w.uploadEnabled).map(w=>w.techId),fixedIds:watches.results.filter(w=>w.fixedEnabled).map(w=>w.techId),team}, {headers:{"Cache-Control":"private, no-store"}});
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const user = await getTechSessionContext(request, env.DB);
  if (!user?.isAdmin || user.mustSetup) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { techId?: unknown; enabled?: unknown; fixedEnabled?: unknown; scope?: unknown; event?: unknown } | null;
  if(body?.scope==='team'){
    if(typeof body.enabled!=='boolean'||!['upload','fixed'].includes(String(body.event)))return Response.json({error:'Invalid team notification setting.'},{status:400});
    const enabled=Number(body.enabled),now=Date.now();
    const defaults=body.event==='upload'
      ? env.DB.prepare("INSERT INTO push_company_preferences(tenant_id,watch_upload_enabled,watch_upload_since) VALUES(?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET watch_upload_enabled=excluded.watch_upload_enabled,watch_upload_since=excluded.watch_upload_since").bind(user.tenantId,enabled,now)
      : env.DB.prepare("INSERT INTO push_company_preferences(tenant_id,watch_fixed_enabled,watch_fixed_since) VALUES(?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET watch_fixed_enabled=excluded.watch_fixed_enabled,watch_fixed_since=excluded.watch_fixed_since").bind(user.tenantId,enabled,now);
    const overrides=body.event==='upload'
      ? env.DB.prepare("UPDATE push_watches SET upload_enabled=? WHERE tenant_id=?").bind(enabled,user.tenantId)
      : env.DB.prepare("UPDATE push_watches SET fixed_enabled=? WHERE tenant_id=?").bind(enabled,user.tenantId);
    await env.DB.batch([defaults,overrides]);
    return Response.json({ok:true});
  }
  const techId = normalizeTechId(body?.techId);
  if (!techId || typeof body?.enabled !== "boolean") return Response.json({ error: "Invalid technician notification setting." }, { status: 400 });
  const tech = await env.DB.prepare("SELECT 1 FROM technicians WHERE tenant_id = ? AND tech_id = ? AND is_admin = 0").bind(user.tenantId, techId).first();
  if (!tech) return Response.json({ error: "Technician not found." }, { status: 404 });
  if (body.fixedEnabled !== undefined && typeof body.fixedEnabled !== "boolean") return Response.json({error:"Invalid fixed QC setting"},{status:400});
  const previous=await env.DB.prepare("SELECT fixed_enabled AS fixedEnabled FROM push_watches WHERE tenant_id=? AND supervisor_id=? AND tech_id=?").bind(user.tenantId,user.techId,techId).first<{fixedEnabled:number}>();
  const defaults=await env.DB.prepare("SELECT watch_fixed_enabled AS fixedEnabled FROM push_company_preferences WHERE tenant_id=?").bind(user.tenantId).first<{fixedEnabled:number}>();
  const fixed=body.fixedEnabled ?? Boolean(previous?.fixedEnabled ?? defaults?.fixedEnabled);
  if (body.enabled || fixed) await env.DB.prepare("INSERT INTO push_watches(tenant_id, supervisor_id, tech_id, enabled_at,upload_enabled,fixed_enabled) VALUES (?, ?, ?, ?,?,?) ON CONFLICT(tenant_id,supervisor_id,tech_id) DO UPDATE SET upload_enabled=excluded.upload_enabled,fixed_enabled=excluded.fixed_enabled,enabled_at=excluded.enabled_at").bind(user.tenantId, user.techId, techId, Date.now(),Number(body.enabled),Number(fixed)).run();
  else await env.DB.prepare("INSERT INTO push_watches(tenant_id,supervisor_id,tech_id,enabled_at,upload_enabled,fixed_enabled) VALUES(?,?,?,?,0,0) ON CONFLICT(tenant_id,supervisor_id,tech_id) DO UPDATE SET upload_enabled=0,fixed_enabled=0,enabled_at=excluded.enabled_at").bind(user.tenantId,user.techId,techId,Date.now()).run();
  return Response.json({ ok: true });
}
