import { env } from "@/lib/local-env";
import { getTechSessionContext, normalizeTechId, sameOrigin } from "@/lib/tech-auth";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getTechSessionContext(request, env.DB);
  if (!user?.isAdmin || user.mustSetup) return Response.json({ error: "Forbidden" }, { status: 403 });
  const watches = await env.DB.prepare("SELECT tech_id AS techId,upload_enabled AS uploadEnabled,fixed_enabled AS fixedEnabled FROM push_watches WHERE tenant_id = ? AND supervisor_id = ?").bind(user.tenantId, user.techId).all<{ techId: string; uploadEnabled: number; fixedEnabled: number }>();
  return Response.json({ techIds: watches.results.filter(row=>row.uploadEnabled).map(row => row.techId), fixedIds: watches.results.filter(row=>row.fixedEnabled).map(row=>row.techId) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const user = await getTechSessionContext(request, env.DB);
  if (!user?.isAdmin || user.mustSetup) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { techId?: unknown; enabled?: unknown; fixedEnabled?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  if (!techId || typeof body?.enabled !== "boolean") return Response.json({ error: "Invalid technician notification setting." }, { status: 400 });
  const tech = await env.DB.prepare("SELECT 1 FROM technicians WHERE tenant_id = ? AND tech_id = ? AND is_admin = 0").bind(user.tenantId, techId).first();
  if (!tech) return Response.json({ error: "Technician not found." }, { status: 404 });
  if (body.fixedEnabled !== undefined && typeof body.fixedEnabled !== "boolean") return Response.json({error:"Invalid fixed QC setting"},{status:400});
  const previous=await env.DB.prepare("SELECT fixed_enabled AS fixedEnabled FROM push_watches WHERE tenant_id=? AND supervisor_id=? AND tech_id=?").bind(user.tenantId,user.techId,techId).first<{fixedEnabled:number}>();
  const fixed=body.fixedEnabled ?? Boolean(previous?.fixedEnabled);
  if (body.enabled || fixed) await env.DB.prepare("INSERT INTO push_watches(tenant_id, supervisor_id, tech_id, enabled_at,upload_enabled,fixed_enabled) VALUES (?, ?, ?, ?,?,?) ON CONFLICT(tenant_id,supervisor_id,tech_id) DO UPDATE SET upload_enabled=excluded.upload_enabled,fixed_enabled=excluded.fixed_enabled,enabled_at=excluded.enabled_at").bind(user.tenantId, user.techId, techId, Date.now(),Number(body.enabled),Number(fixed)).run();
  else await env.DB.prepare("DELETE FROM push_watches WHERE tenant_id = ? AND supervisor_id = ? AND tech_id = ?").bind(user.tenantId, user.techId, techId).run();
  return Response.json({ ok: true });
}
