import { env } from "@/lib/local-env";
import { getCookie, getTechSessionContext, hashToken, TECH_COOKIE, TECH_SESSION_LIFETIME_SECONDS, techCookie } from "@/lib/tech-auth";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const token = getCookie(request, TECH_COOKIE);
  const now = Date.now();
  const session = await getTechSessionContext(request, env.DB);
  if (!session) return Response.json({ error: "Sign in with your Tech ID and PIN." }, { status: 401 });
  const { techId, tenantId } = session;
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (session.mustSetup) return Response.json({ techId, isAdmin: true, requiresAdminSetup: true, tenant: { id: tenantId, name: session.tenantName } }, { headers });
  if (token && !session.isAdmin && session.expiresAt - now < TECH_SESSION_LIFETIME_SECONDS * 500) {
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
  const [totals, urgent, feedback] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS allQcs, COALESCE(SUM(CASE WHEN status = 'pending' OR (status = 'rejected' AND correction_pending = 1) THEN 1 ELSE 0 END), 0) AS captured, COALESCE(SUM(CASE WHEN status = 'approved' AND trust_upload_status = 'uploaded' THEN 1 ELSE 0 END), 0) AS uploaded, COALESCE(SUM(CASE WHEN (status = 'rejected' OR (attempt_number > 1 AND status = 'approved' AND trust_upload_status <> 'uploaded')) THEN 1 ELSE 0 END), 0) AS rejected, COALESCE(SUM(CASE WHEN status = 'rejected' AND correction_pending = 0 THEN 1 ELSE 0 END), 0) AS needsCorrection FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? AND submitted_at >= ? AND submitted_at < ?")
      .bind(tenantId, techId, start, end).first<{ allQcs: number; captured: number; uploaded: number; rejected: number; needsCorrection: number }>(),
    env.DB.prepare("SELECT MIN(correction_deadline_at) AS rejectedDeadlineAt FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? AND status = 'rejected' AND correction_pending = 0 AND submitted_at >= ? AND submitted_at < ?")
      .bind(tenantId, techId, start, end).first<{ rejectedDeadlineAt: number | null }>(),
    env.DB.prepare("SELECT COUNT(*) AS unreadFeedback FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? AND status = 'approved' AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND LENGTH(TRIM(review_note)) > 0 AND feedback_acknowledged_at IS NULL").bind(tenantId,techId).first<{unreadFeedback:number}>(),
  ]);
  const counts = { unreadFeedback:Number(feedback?.unreadFeedback??0), allQcs: totals?.allQcs ?? 0, captured: totals?.captured ?? 0, uploaded: totals?.uploaded ?? 0, rejected: totals?.rejected ?? 0, needsCorrection: totals?.needsCorrection ?? 0 };
  const urgentRejectedAt = urgent?.rejectedDeadlineAt ?? null;
  if (url.searchParams.get("count") === "1") {
    return Response.json({ techId, isAdmin: session.isAdmin, tenant: { id: tenantId, name: session.tenantName }, ...counts, urgentRejectedAt }, { headers });
  }
  const requestedView = url.searchParams.get("view");
  const view = requestedView === "all" || requestedView === "captured" || requestedView === "uploaded" || requestedView === "notes" ? requestedView : "rejected";
  const selectedId=url.searchParams.get('qc');
  if(selectedId&&!/^[0-9a-f-]{36}$/.test(selectedId))return Response.json({error:'Invalid QC.'},{status:400,headers});
  const notes=view==='notes';
  const bindings:Array<string|number>=[tenantId,techId,...(notes?[]:[start,end]),...(notes&&selectedId?[selectedId]:[])];
  const condition = notes ? "AND status = 'approved' AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND LENGTH(TRIM(review_note)) > 0" : view === "uploaded" ? "AND status = 'approved' AND trust_upload_status = 'uploaded'" : view === "rejected" ? "AND (status = 'rejected' OR (attempt_number > 1 AND status = 'approved' AND trust_upload_status <> 'uploaded'))" : view === "captured" ? "AND (status = 'pending' OR (status = 'rejected' AND correction_pending = 1))" : "";
  const rows = await env.DB.prepare(`SELECT id, job_number AS jobNumber, address, screenshot_id AS screenshotId, photo_ids AS photoIds, submitted_at AS submittedAt, reviewed_at AS reviewedAt, correction_deadline_at AS correctionDeadlineAt, review_note AS reviewNote, feedback_acknowledged_at AS feedbackAcknowledgedAt, rejection_upload_mode AS rejectionUploadMode, status, trust_upload_status AS trustUploadStatus, attempt_number AS attemptNumber, correction_pending AS correctionPending FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? ${notes?'':'AND submitted_at >= ? AND submitted_at < ?'} ${notes&&selectedId?'AND id = ?':''} ${condition} ORDER BY ${notes?'CASE WHEN feedback_acknowledged_at IS NULL THEN 0 ELSE 1 END, reviewed_at DESC':'submitted_at DESC'} LIMIT 200`).bind(...bindings).all<{ id: string; jobNumber: string; screenshotId: string; photoIds: string; submittedAt: number; reviewedAt: number | null; correctionDeadlineAt: number | null; reviewNote: string | null; status: string; trustUploadStatus: string; attemptNumber: number; correctionPending: number }>();
  return Response.json({ techId, isAdmin: session.isAdmin, tenant: { id: tenantId, name: session.tenantName }, view, ...counts, urgentRejectedAt, submissions: rows.results.map((row) => ({ ...row, photoIds: JSON.parse(row.photoIds) as string[] })) }, { headers });
}
