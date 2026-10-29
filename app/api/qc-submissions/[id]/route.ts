import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { sameOrigin } from "@/lib/tech-auth";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";
import { normalizeCatalystFailures } from "@/lib/catalyst-qc";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const user = await getChatGPTUser();
  if (!isOwner(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "QC review is unavailable" }, { status: 503 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid QC" }, { status: 400 });
  let status: unknown;
  let reviewNote: unknown;
  let failureReasons: unknown;
  let rejectionUploadMode: unknown;
  try { const body = await request.json() as { status?: unknown; reviewNote?: unknown; failureReasons?: unknown; rejectionUploadMode?: unknown }; status = body.status; reviewNote = body.reviewNote; failureReasons = body.failureReasons; rejectionUploadMode = body.rejectionUploadMode; }
  catch { return Response.json({ error: "Invalid decision" }, { status: 400 }); }
  if (status !== "approved" && status !== "rejected") return Response.json({ error: "Choose approve or reject" }, { status: 400 });
  if (reviewNote !== undefined && reviewNote !== null && (typeof reviewNote !== "string" || reviewNote.trim().length > 1000)) return Response.json({ error: "Supervisor feedback must be text up to 1,000 characters." }, { status: 400 });
  if (rejectionUploadMode !== undefined && rejectionUploadMode !== 'catalyst' && rejectionUploadMode !== 'local') return Response.json({error:'Invalid rejection upload mode.'},{status:400});
  const localRejection = status === 'rejected' && rejectionUploadMode === 'local';
  const feedback = typeof reviewNote === "string" ? reviewNote.trim() || null : null;
  if (status === "rejected" && !localRejection && !feedback) return Response.json({ error: "Add a rejection note (up to 1,000 characters)." }, { status: 400 });
  const failures = status === "rejected" && !localRejection ? normalizeCatalystFailures(failureReasons) : [];
  if (status === "rejected" && !localRejection && !failures) return Response.json({ error: "Choose at least one Catalyst failure reason and only one reason per TQA category." }, { status: 400 });
  try {
    const reviewedAt = Date.now();
    const correctionDeadlineAt = status === "rejected" ? reviewedAt + 72 * 60 * 60 * 1000 : null;
    const range = fiscalMonthBounds(fiscalMonthKey());
    const current = await env.DB.prepare("SELECT COALESCE(root_submission_id, id) AS rootSubmissionId, attempt_number AS attemptNumber, correction_pending AS correctionPending, catalyst_observation_id AS catalystObservationId FROM qc_submissions WHERE tenant_id = ? AND id = ?").bind(user!.tenantId, id).first<{rootSubmissionId:string;attemptNumber:number;correctionPending:number;catalystObservationId:string|null}>();
    if (!current) return Response.json({error:'QC not found.'},{status:404});
    // Local rejections do not create a failed Catalyst observation. Only a
    // previously rejected Catalyst observation makes this a correction upload.
    const priorFailure = await env.DB.prepare("SELECT submission_id FROM qc_submission_attempts WHERE tenant_id = ? AND root_submission_id = ? AND status = 'rejected' AND rejection_upload_mode = 'catalyst' AND trust_upload_kind = 'observation' AND catalyst_failures IS NOT NULL LIMIT 1").bind(user!.tenantId,current.rootSubmissionId).first();
    const uploadKind = priorFailure ? "follow_up" : "observation";
    const uploadStatus = "ready";
    const result = await env.DB.prepare("UPDATE qc_submissions SET status = ?, correction_pending = 0, reviewed_at = ?, correction_deadline_at = ?, review_note = ?, rejection_upload_mode = ?, catalyst_failures = ?, trust_upload_kind = ?, trust_upload_status = ?, trust_uploaded_at = CASE WHEN ? = 'ready' THEN NULL ELSE trust_uploaded_at END, trust_upload_error = NULL, trust_upload_attempts = 0, trust_last_attempt_at = NULL, trust_uploaded_by_key_id = NULL WHERE tenant_id = ? AND id = ? AND submitted_at >= ? AND submitted_at < ? AND (status = 'pending' OR (status = 'rejected' AND correction_pending = 1))").bind(status, reviewedAt, correctionDeadlineAt, feedback, localRejection ? "local" : "catalyst", status === "rejected" && !localRejection ? JSON.stringify(failures) : null, uploadKind, uploadStatus, uploadStatus, user!.tenantId, id, range.start, range.end).run();
    if (!result.meta.changes) return Response.json({ error: "This QC is in view-only history." }, { status: 409 });
    return Response.json({ id, status, reviewedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QC decision failed", error);
    return Response.json({ error: "Could not save the decision" }, { status: 503 });
  }
}
