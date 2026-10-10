import { env } from "@/lib/local-env";
import { getCookie, getTechSessionContext, hashToken, TECH_COOKIE, TECH_SESSION_LIFETIME_SECONDS, techCookie } from "@/lib/tech-auth";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const token = getCookie(request, TECH_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return Response.json({ error: "Sign in with your Tech ID and PIN." }, { status: 401 });
  const now = Date.now();
  const session = await getTechSessionContext(request, env.DB);
  if (!session) return Response.json({ error: "Sign in with your Tech ID and PIN." }, { status: 401 });
  const { techId, tenantId } = session;
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (session.mustSetup) return Response.json({ techId, isAdmin: true, requiresAdminSetup: true, tenant: { id: tenantId, name: session.tenantName } }, { headers });
  if (!session.isAdmin && session.expiresAt - now < TECH_SESSION_LIFETIME_SECONDS * 500) {
    await env.DB.prepare("UPDATE tech_sessions SET expires_at = ? WHERE token_hash = ? AND tenant_id = ? AND tech_id = ?")
      .bind(now + TECH_SESSION_LIFETIME_SECONDS * 1000, await hashToken(token), tenantId, techId).run();
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    const secure = forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
    headers["Set-Cookie"] = techCookie(token, secure);
  }
  const url = new URL(request.url);
  const fallback = fiscalMonthBounds(fiscalMonthKey());
  const start = url.searchParams.has("start") ? Number(url.searchParams.get("start")) : fallback.start;
  const end = url.searchParams.has("end") ? Number(url.searchParams.get("end")) : fallback.end;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > 32 * 86_400_000) return Response.json({ error: "Invalid fiscal month" }, { status: 400 });
  const [totals, urgent] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS captured, COALESCE(SUM(CASE WHEN status = 'approved' AND trust_upload_status = 'uploaded' THEN 1 ELSE 0 END), 0) AS uploaded, COALESCE(SUM(CASE WHEN (status = 'rejected' OR (attempt_number > 1 AND status = 'approved' AND trust_upload_status <> 'uploaded')) THEN 1 ELSE 0 END), 0) AS rejected FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? AND submitted_at >= ? AND submitted_at < ?")
      .bind(tenantId, techId, start, end).first<{ captured: number; uploaded: number; rejected: number }>(),
    env.DB.prepare("SELECT MIN(correction_deadline_at) AS rejectedDeadlineAt FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? AND status = 'rejected' AND correction_pending = 0 AND submitted_at >= ? AND submitted_at < ?")
      .bind(tenantId, techId, start, end).first<{ rejectedDeadlineAt: number | null }>(),
  ]);
  const counts = { captured: totals?.captured ?? 0, uploaded: totals?.uploaded ?? 0, rejected: totals?.rejected ?? 0 };
  const urgentRejectedAt = urgent?.rejectedDeadlineAt ?? null;
  if (url.searchParams.get("count") === "1") {
    return Response.json({ techId, isAdmin: session.isAdmin, tenant: { id: tenantId, name: session.tenantName }, ...counts, urgentRejectedAt }, { headers });
  }
  const requestedView = url.searchParams.get("view");
  const view = requestedView === "captured" || requestedView === "uploaded" ? requestedView : "rejected";
  const condition = view === "uploaded" ? "AND status = 'approved' AND trust_upload_status = 'uploaded'" : view === "rejected" ? "AND (status = 'rejected' OR (attempt_number > 1 AND status = 'approved' AND trust_upload_status <> 'uploaded'))" : "";
  const rows = await env.DB.prepare(`SELECT id, job_number AS jobNumber, address, screenshot_id AS screenshotId, photo_ids AS photoIds, submitted_at AS submittedAt, reviewed_at AS reviewedAt, correction_deadline_at AS correctionDeadlineAt, review_note AS reviewNote, status, trust_upload_status AS trustUploadStatus, attempt_number AS attemptNumber, correction_pending AS correctionPending FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? AND submitted_at >= ? AND submitted_at < ? ${condition} ORDER BY submitted_at DESC LIMIT 200`).bind(tenantId, techId, start, end).all<{ id: string; jobNumber: string; screenshotId: string; photoIds: string; submittedAt: number; reviewedAt: number | null; correctionDeadlineAt: number | null; reviewNote: string | null; status: string; trustUploadStatus: string; attemptNumber: number; correctionPending: number }>();
  return Response.json({ techId, isAdmin: session.isAdmin, tenant: { id: tenantId, name: session.tenantName }, view, ...counts, urgentRejectedAt, submissions: rows.results.map((row) => ({ ...row, photoIds: JSON.parse(row.photoIds) as string[] })) }, { headers });
}
