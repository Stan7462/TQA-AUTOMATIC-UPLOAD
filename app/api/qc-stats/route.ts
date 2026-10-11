import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!isOwner(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const url = new URL(request.url);
  const start = Number(url.searchParams.get("start"));
  const end = Number(url.searchParams.get("end"));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || end - start > 32 * 86400000) return Response.json({ error: "Invalid month" }, { status: 400 });
  const [roster, results, tenant, failures] = await Promise.all([
    env.DB.prepare("SELECT tech_id AS techId, monthly_qc_goal AS monthlyGoal FROM technicians WHERE tenant_id = ? AND active = 1 AND is_admin = 0 ORDER BY tech_id").bind(user!.tenantId).all<{ techId: string; monthlyGoal: number | null }>(),
    env.DB.prepare("SELECT tech_id AS techId, COUNT(*) AS submitted, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='approved' AND trust_upload_status='uploaded' THEN 1 ELSE 0 END) AS uploaded FROM qc_submissions WHERE tenant_id = ? AND submitted_at >= ? AND submitted_at < ? GROUP BY tech_id").bind(user!.tenantId, start, end).all<{ techId: string; submitted: number; approved: number; rejected: number; pending: number; uploaded: number }>(),
    env.DB.prepare("SELECT monthly_qc_goal AS monthlyGoal FROM tenants WHERE id = ?").bind(user!.tenantId).first<{ monthlyGoal: number }>(),
    env.DB.prepare(`SELECT tech_id AS techId, COUNT(DISTINCT COALESCE(root_submission_id, id)) AS failedUploaded FROM (SELECT id, tenant_id, root_submission_id, attempt_number, tech_id, status, trust_upload_status, submitted_at FROM qc_submissions UNION ALL SELECT submission_id AS id, tenant_id, root_submission_id, attempt_number, tech_id, status, trust_upload_status, submitted_at FROM qc_submission_attempts) AS failed_qcs WHERE tenant_id = ? AND attempt_number = 1 AND status = 'rejected' AND trust_upload_status = 'uploaded' AND submitted_at >= ? AND submitted_at < ? GROUP BY tech_id`).bind(user!.tenantId, start, end).all<{ techId: string; failedUploaded: number }>(),
  ]);
  const stats = new Map(results.results.map((row) => [row.techId, row]));
  for (const tech of roster.results) if (!stats.has(tech.techId)) stats.set(tech.techId, { techId: tech.techId, submitted: 0, approved: 0, rejected: 0, pending: 0, uploaded: 0 });
  const monthlyGoal = tenant && Number.isInteger(tenant.monthlyGoal) && tenant.monthlyGoal >= 1 && tenant.monthlyGoal <= 99 ? tenant.monthlyGoal : 5;
  for (const row of failures.results) if (!stats.has(row.techId)) stats.set(row.techId, { techId: row.techId, submitted: 0, approved: 0, rejected: 0, pending: 0, uploaded: 0 });
  const failedCounts = new Map(failures.results.map(row => [row.techId, Number(row.failedUploaded)]));
  const goals = new Map(roster.results.map(tech => [tech.techId, tech.monthlyGoal ?? monthlyGoal]));
  return Response.json({ technicians: [...stats.values()].map(stat => ({ ...stat, failedUploaded: failedCounts.get(stat.techId) ?? 0, monthlyGoal: goals.get(stat.techId) ?? monthlyGoal })).sort((a, b) => a.techId.localeCompare(b.techId, undefined, { numeric: true })), monthlyGoal }, { headers: { "Cache-Control": "private, no-store" } });
}
