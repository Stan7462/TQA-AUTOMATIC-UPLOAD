import { env } from "@/lib/local-env";
import { getTechSessionContext, sameOrigin } from "@/lib/tech-auth";
import { pushConfig } from "@/lib/push-config.mjs";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const config = pushConfig();
  const session = await getTechSessionContext(request, env.DB);
  if (!session || session.mustSetup) return Response.json({ appId: config.appId, account: null }, { headers });
  await env.DB.prepare("INSERT OR IGNORE INTO push_accounts (tenant_id, tech_id, external_id) VALUES (?, ?, ?)").bind(session.tenantId, session.techId, crypto.randomUUID()).run();
  const account = await env.DB.prepare("SELECT p.external_id AS externalId, p.enabled,p.supervisor_summary AS supervisorSummary,p.escalation, COALESCE(c.rejected,1) AS rejected, COALESCE(c.deadline,1) AS deadline, COALESCE(c.overdue,1) AS overdue, COALESCE(c.monthly,1) AS monthly FROM push_accounts p LEFT JOIN push_company_preferences c ON c.tenant_id=p.tenant_id WHERE p.tenant_id = ? AND p.tech_id = ?").bind(session.tenantId, session.techId).first();
  return Response.json({ appId: config.appId, role: session.isAdmin ? "supervisor" : "technician", account, configured: Boolean(config.apiKey), sendingEnabled: config.sendingEnabled }, { headers });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const session = await getTechSessionContext(request, env.DB);
  if (!session || session.mustSetup) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null) as { enabled?: unknown; rejected?: unknown; deadline?: unknown; overdue?: unknown; monthly?: unknown; supervisorSummary?: unknown; escalation?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean") return Response.json({ error: "Invalid notification preferences." }, { status: 400 });
  if (!session.isAdmin && ["rejected", "deadline", "overdue", "monthly", "supervisorSummary", "escalation"].some(key => key in body)) return Response.json({ error: "Only supervisors can change alert types." }, { status: 403 });
  if (session.isAdmin && ["rejected", "deadline", "overdue", "monthly"].some(key => typeof body[key as keyof typeof body] !== "boolean")) return Response.json({ error: "Invalid notification preferences." }, { status: 400 });
  await env.DB.prepare("INSERT OR IGNORE INTO push_accounts (tenant_id, tech_id, external_id) VALUES (?, ?, ?)").bind(session.tenantId, session.techId, crypto.randomUUID()).run();
  await env.DB.prepare("UPDATE push_accounts SET enabled_at = CASE WHEN enabled = 0 AND ? = 1 THEN ? ELSE enabled_at END, enabled = ? WHERE tenant_id = ? AND tech_id = ?").bind(Number(body.enabled), Date.now(), Number(body.enabled), session.tenantId, session.techId).run();
  if (session.isAdmin) await env.DB.prepare("INSERT INTO push_company_preferences(tenant_id,rejected,deadline,overdue,monthly) VALUES(?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET rejected=excluded.rejected,deadline=excluded.deadline,overdue=excluded.overdue,monthly=excluded.monthly").bind(session.tenantId, Number(body.rejected), Number(body.deadline), Number(body.overdue), Number(body.monthly)).run();
  if (session.isAdmin) await env.DB.prepare("UPDATE push_accounts SET supervisor_summary=?,escalation=? WHERE tenant_id=? AND tech_id=?").bind(Number(body.supervisorSummary !== false),Number(body.escalation !== false),session.tenantId,session.techId).run();
  return Response.json({ ok: true }, { headers });
}
