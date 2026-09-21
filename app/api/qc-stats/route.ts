import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { ADMIN_TECH_ID } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isOwner(await getChatGPTUser())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const url = new URL(request.url);
  const start = Number(url.searchParams.get("start"));
  const end = Number(url.searchParams.get("end"));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || end - start > 32 * 86400000) return Response.json({ error: "Invalid month" }, { status: 400 });
  const [roster, results] = await Promise.all([
    env.DB.prepare("SELECT tech_id AS techId FROM technicians WHERE active = 1 AND tech_id != ? ORDER BY tech_id").bind(ADMIN_TECH_ID).all<{ techId: string }>(),
    env.DB.prepare("SELECT tech_id AS techId, COUNT(*) AS submitted, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='approved' AND trust_upload_status='uploaded' THEN 1 ELSE 0 END) AS uploaded FROM qc_submissions WHERE submitted_at >= ? AND submitted_at < ? AND tech_id != ? GROUP BY tech_id").bind(start, end, ADMIN_TECH_ID).all<{ techId: string; submitted: number; approved: number; rejected: number; pending: number; uploaded: number }>(),
  ]);
  const stats = new Map(results.results.map((row) => [row.techId, row]));
  for (const tech of roster.results) if (!stats.has(tech.techId)) stats.set(tech.techId, { techId: tech.techId, submitted: 0, approved: 0, rejected: 0, pending: 0, uploaded: 0 });
  return Response.json({ technicians: [...stats.values()].sort((a, b) => a.techId.localeCompare(b.techId, undefined, { numeric: true })) }, { headers: { "Cache-Control": "private, no-store" } });
}
