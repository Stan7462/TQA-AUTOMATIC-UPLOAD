import { env } from "@/lib/local-env";
import { getTechSessionContext, normalizeTechId, sameOrigin } from "@/lib/tech-auth";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getTechSessionContext(request, env.DB);
  if (!user?.isAdmin || user.mustSetup) return Response.json({ error: "Forbidden" }, { status: 403 });
  const watches = await env.DB.prepare("SELECT tech_id AS techId FROM push_watches WHERE tenant_id = ? AND supervisor_id = ?").bind(user.tenantId, user.techId).all<{ techId: string }>();
  return Response.json({ techIds: watches.results.map(row => row.techId) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const user = await getTechSessionContext(request, env.DB);
  if (!user?.isAdmin || user.mustSetup) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { techId?: unknown; enabled?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  if (!techId || typeof body?.enabled !== "boolean") return Response.json({ error: "Invalid technician notification setting." }, { status: 400 });
  const tech = await env.DB.prepare("SELECT 1 FROM technicians WHERE tenant_id = ? AND tech_id = ? AND is_admin = 0").bind(user.tenantId, techId).first();
  if (!tech) return Response.json({ error: "Technician not found." }, { status: 404 });
  if (body.enabled) await env.DB.prepare("INSERT OR IGNORE INTO push_watches(tenant_id, supervisor_id, tech_id, enabled_at) VALUES (?, ?, ?, ?)").bind(user.tenantId, user.techId, techId, Date.now()).run();
  else await env.DB.prepare("DELETE FROM push_watches WHERE tenant_id = ? AND supervisor_id = ? AND tech_id = ?").bind(user.tenantId, user.techId, techId).run();
  return Response.json({ ok: true });
}
