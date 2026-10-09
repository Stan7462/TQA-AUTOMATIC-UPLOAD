import { env } from "@/lib/local-env";
import { getTechSessionContext, normalizeTechId } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.DB) return Response.json({ error: "QC progress is unavailable." }, { status: 503 });
  const url = new URL(request.url);
  const techId = normalizeTechId(url.searchParams.get("techId"));
  const start = Number(url.searchParams.get("start"));
  const end = Number(url.searchParams.get("end"));
  const now = Date.now();
  if (!techId || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || end - start > 32 * 86_400_000 || start > now + 86_400_000 || end < now - 86_400_000) {
    return Response.json({ error: "Invalid QC progress request." }, { status: 400 });
  }
  const session = await getTechSessionContext(request, env.DB);
  if (session?.techId !== techId) return Response.json({ error: "Sign in to view your QC progress." }, { status: 401 });
  try {
    const [result, tenant] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS approved FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? AND status = 'approved' AND submitted_at >= ? AND submitted_at < ?")
        .bind(session.tenantId, techId, start, end).first<{ approved: number }>(),
      env.DB.prepare("SELECT COALESCE(t.monthly_qc_goal, n.monthly_qc_goal) AS monthlyGoal FROM technicians t JOIN tenants n ON n.id = t.tenant_id WHERE t.tenant_id = ? AND t.tech_id = ?").bind(session.tenantId, techId).first<{ monthlyGoal: number }>(),
    ]);
    const monthlyGoal = tenant && Number.isInteger(tenant.monthlyGoal) && tenant.monthlyGoal >= 1 && tenant.monthlyGoal <= 99 ? tenant.monthlyGoal : 5;
    return Response.json({ approved: result?.approved ?? 0, monthlyGoal }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QC progress failed", error);
    return Response.json({ error: "Could not load QC progress." }, { status: 503 });
  }
}
