import { isOwner } from "@/app/access";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { env } from "@/lib/local-env";
import { sameOrigin } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

const DEFAULT_MONTHLY_QC_GOAL = 5;

function isValidGoal(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!isOwner(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  try {
    const tenant = await env.DB.prepare("SELECT monthly_qc_goal AS monthlyGoal FROM tenants WHERE id = ?").bind(user!.tenantId).first<{ monthlyGoal: number }>();
    if (!tenant) return Response.json({ error: "Company settings were not found." }, { status: 404 });
    return Response.json({ monthlyGoal: isValidGoal(tenant.monthlyGoal) ? tenant.monthlyGoal : DEFAULT_MONTHLY_QC_GOAL }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Monthly QC goal read failed", error);
    return Response.json({ error: "Could not load the monthly QC goal." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getChatGPTUser();
  if (!isOwner(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const body = await request.json().catch(() => null) as { monthlyGoal?: unknown } | null;
  if (!isValidGoal(body?.monthlyGoal)) return Response.json({ error: "Set a whole number from 1 to 99 QCs." }, { status: 400 });
  try {
    const company = await env.DB.prepare("SELECT id FROM tenants WHERE id = ?").bind(user!.tenantId).first<{ id: string }>();
    if (!company) return Response.json({ error: "Company settings were not found." }, { status: 404 });
    await env.DB.prepare("UPDATE tenants SET monthly_qc_goal = ? WHERE id = ?").bind(body.monthlyGoal, user!.tenantId).run();
    return Response.json({ monthlyGoal: body.monthlyGoal }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Monthly QC goal update failed", error);
    return Response.json({ error: "Could not save the monthly QC goal." }, { status: 503 });
  }
}
