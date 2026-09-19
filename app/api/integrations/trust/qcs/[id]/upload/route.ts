import { env } from "@/lib/local-env";
import { qcIdPattern, requireTrustKey, trustError, trustNoStore, trustQc, trustQcSelect, type TrustQcRow } from "@/lib/trust-api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const key = await requireTrustKey(request);
  if (key instanceof Response) return key;
  const { id } = await context.params;
  if (!qcIdPattern.test(id)) return trustError(404, "NOT_FOUND", "QC not found.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return trustError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return trustError(413, "BODY_TOO_LARGE", "JSON body must be 4 KB or smaller.");
  const raw = await request.text();
  if (raw.length > 4096) return trustError(413, "BODY_TOO_LARGE", "JSON body must be 4 KB or smaller.");
  let body: { status?: unknown; externalReference?: unknown; errorMessage?: unknown };
  try { body = JSON.parse(raw); } catch { return trustError(400, "INVALID_JSON", "Invalid JSON body."); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return trustError(400, "INVALID_BODY", "Invalid upload result.");
  if (body.status !== "uploaded" && body.status !== "failed") return trustError(400, "INVALID_STATUS", "status must be uploaded or failed.");
  const reference = body.externalReference;
  const errorMessage = body.errorMessage;
  if (body.status === "uploaded" && reference !== undefined && (typeof reference !== "string" || !reference.trim() || reference.trim().length > 200)) return trustError(400, "INVALID_REFERENCE", "externalReference must be 1 to 200 characters.");
  if (body.status === "failed" && (typeof errorMessage !== "string" || !errorMessage.trim() || errorMessage.trim().length > 500)) return trustError(400, "INVALID_ERROR", "errorMessage must be 1 to 500 characters.");
  if (body.status === "uploaded" && errorMessage !== undefined || body.status === "failed" && reference !== undefined) return trustError(400, "INVALID_BODY", "Unexpected field for upload status.");
  try {
    const current = await env.DB.prepare("SELECT status, trust_upload_status AS trustUploadStatus FROM qc_submissions WHERE id = ?").bind(id).first<{ status: string; trustUploadStatus: string }>();
    if (!current) return trustError(404, "NOT_FOUND", "QC not found.");
    if (current.status !== "approved") return trustError(409, "QC_NOT_APPROVED", "Only approved QCs can be uploaded to Trust.");
    if (current.trustUploadStatus === "uploaded") {
      if (body.status !== "uploaded") return trustError(409, "ALREADY_UPLOADED", "QC is already marked uploaded.");
      const existing = await env.DB.prepare(`SELECT ${trustQcSelect} FROM qc_submissions WHERE id = ?`).bind(id).first<TrustQcRow>();
      return Response.json({ qc: trustQc(request, existing!), alreadyUploaded: true }, { headers: trustNoStore });
    }
    const now = Date.now();
    const changed = body.status === "uploaded"
      ? await env.DB.prepare("UPDATE qc_submissions SET trust_upload_status = 'uploaded', trust_uploaded_at = ?, trust_external_reference = ?, trust_upload_error = NULL, trust_upload_attempts = trust_upload_attempts + 1, trust_last_attempt_at = ?, trust_uploaded_by_key_id = ? WHERE id = ? AND status = 'approved' AND trust_upload_status IN ('ready', 'failed')").bind(now, typeof reference === "string" ? reference.trim() : null, now, key.id, id).run()
      : await env.DB.prepare("UPDATE qc_submissions SET trust_upload_status = 'failed', trust_upload_error = ?, trust_upload_attempts = trust_upload_attempts + 1, trust_last_attempt_at = ? WHERE id = ? AND status = 'approved' AND trust_upload_status IN ('ready', 'failed')").bind((errorMessage as string).trim(), now, id).run();
    const updated = await env.DB.prepare(`SELECT ${trustQcSelect} FROM qc_submissions WHERE id = ? AND status = 'approved'`).bind(id).first<TrustQcRow>();
    if (!updated) return trustError(409, "QC_NOT_APPROVED", "Only approved QCs can be uploaded to Trust.");
    if (!changed.meta.changes && updated.trustUploadStatus === "uploaded" && body.status === "failed") return trustError(409, "ALREADY_UPLOADED", "QC is already marked uploaded.");
    return Response.json({ qc: trustQc(request, updated), alreadyUploaded: !changed.meta.changes && updated.trustUploadStatus === "uploaded" }, { headers: trustNoStore });
  } catch (error) {
    console.error("Trust upload status update failed", error);
    return trustError(503, "UNAVAILABLE", "Could not update upload status.");
  }
}
