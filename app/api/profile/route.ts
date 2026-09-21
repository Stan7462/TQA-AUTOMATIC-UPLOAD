import { env } from "@/lib/local-env";
import { ADMIN_TECH_ID, getTechSession } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const techId = await getTechSession(request, env.DB);
  if (!techId) return Response.json({ error: "Sign in with your Tech ID and PIN." }, { status: 401 });
  const totals = await env.DB.prepare("SELECT COUNT(*) AS captured, COALESCE(SUM(CASE WHEN status = 'approved' AND trust_upload_status = 'uploaded' THEN 1 ELSE 0 END), 0) AS uploaded, COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected FROM qc_submissions WHERE tech_id = ?")
    .bind(techId).first<{ captured: number; uploaded: number; rejected: number }>();
  const counts = { captured: totals?.captured ?? 0, uploaded: totals?.uploaded ?? 0, rejected: totals?.rejected ?? 0 };
  if (new URL(request.url).searchParams.get("count") === "1") {
    return Response.json({ techId, isAdmin: techId === ADMIN_TECH_ID, ...counts }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const requestedView = new URL(request.url).searchParams.get("view");
  const view = requestedView === "captured" || requestedView === "uploaded" ? requestedView : "rejected";
  const condition = view === "uploaded" ? "AND status = 'approved' AND trust_upload_status = 'uploaded'" : view === "rejected" ? "AND status = 'rejected'" : "";
  const rows = await env.DB.prepare(`SELECT id, job_number AS jobNumber, screenshot_id AS screenshotId, photo_ids AS photoIds, submitted_at AS submittedAt, reviewed_at AS reviewedAt, review_note AS reviewNote, status, trust_upload_status AS trustUploadStatus FROM qc_submissions WHERE tech_id = ? ${condition} ORDER BY submitted_at DESC LIMIT 200`).bind(techId).all<{ id: string; jobNumber: string; screenshotId: string; photoIds: string; submittedAt: number; reviewedAt: number | null; reviewNote: string | null; status: string; trustUploadStatus: string }>();
  return Response.json({ techId, isAdmin: techId === ADMIN_TECH_ID, view, ...counts, submissions: rows.results.map((row) => ({ ...row, photoIds: JSON.parse(row.photoIds) as string[] })) }, { headers: { "Cache-Control": "private, no-store" } });
}
