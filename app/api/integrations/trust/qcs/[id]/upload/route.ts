import { env } from "@/lib/local-env";
import { qcIdPattern, requireTrustKey, trustError, trustNoStore, trustQc, trustQcSelect, trustQcSource, trustQcEligible, type TrustQcRow } from "@/lib/trust-api";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

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
    const range = fiscalMonthBounds(fiscalMonthKey());
    const current = await env.DB.prepare(`SELECT ${trustQcSelect} FROM ${trustQcSource} WHERE tenant_id = ? AND id = ?`).bind(key.tenantId, id).first<TrustQcRow>();
    if (!current) return trustError(404, "NOT_FOUND", "QC not found.");
    if (current.submittedAt < range.start || current.submittedAt >= range.end) return trustError(409, "PREVIOUS_PERIOD", "This QC belongs to a previous fiscal month.");
    const eligible = await env.DB.prepare(`SELECT id FROM ${trustQcSource} WHERE tenant_id = ? AND id = ? AND ${trustQcEligible}`).bind(key.tenantId, id).first();
    if (!eligible) return trustError(409, "QC_NOT_READY", "This QC is not ready for Catalyst.");
    if (current.trustUploadStatus === "uploaded") {
      if (body.status !== "uploaded") return trustError(409, "ALREADY_UPLOADED", "QC is already marked uploaded.");
      return Response.json({ qc: trustQc(request, current), alreadyUploaded: true }, { headers: trustNoStore });
    }
    const firstFail = current.status === "rejected" && current.trustUploadKind === "observation";
    if (firstFail && body.status === "uploaded" && (typeof reference !== "string" || !/^\d+$/.test(reference.trim()))) return trustError(400, "INVALID_REFERENCE", "The first Fail upload must include its Catalyst observation ID.");
    const now = Date.now();
    const changes = [ ["qc_submissions", "id"], ["qc_submission_attempts", "submission_id"] ].map(([table, idColumn]) =>
      body.status === "uploaded"
        ? env.DB.prepare(`UPDATE ${table} SET trust_upload_status = 'uploaded', trust_uploaded_at = ?, trust_external_reference = ?, catalyst_observation_id = CASE WHEN trust_upload_kind = 'observation' THEN COALESCE(?, catalyst_observation_id) ELSE catalyst_observation_id END, trust_upload_error = NULL, trust_upload_attempts = trust_upload_attempts + 1, trust_last_attempt_at = ?, trust_uploaded_by_key_id = ? WHERE tenant_id = ? AND ${idColumn} = ? AND trust_upload_status IN ('ready', 'failed')`)
          .bind(now, typeof reference === "string" ? reference.trim() : null, typeof reference === "string" ? reference.trim() : null, now, key.id, key.tenantId, id)
        : env.DB.prepare(`UPDATE ${table} SET trust_upload_status = 'failed', trust_upload_error = ?, trust_upload_attempts = trust_upload_attempts + 1, trust_last_attempt_at = ? WHERE tenant_id = ? AND ${idColumn} = ? AND trust_upload_status IN ('ready', 'failed')`)
          .bind((errorMessage as string).trim(), now, key.tenantId, id));
    if (firstFail && body.status === "uploaded") {
      // Propagate the original observation ID even if a redo moved that Fail to history.
      for (const table of ["qc_submissions", "qc_submission_attempts"]) changes.push(env.DB.prepare(`UPDATE ${table} SET catalyst_observation_id = ? WHERE tenant_id = ? AND root_submission_id = ? AND catalyst_observation_id IS NULL`).bind((reference as string).trim(), key.tenantId, current.rootSubmissionId));
    }
    const results = await env.DB.batch(changes);
    const updated = await env.DB.prepare(`SELECT ${trustQcSelect} FROM ${trustQcSource} WHERE tenant_id = ? AND id = ?`).bind(key.tenantId, id).first<TrustQcRow>();
    if (!updated) return trustError(409, "QC_NOT_READY", "This QC is not ready for Catalyst.");
    const changed = results.slice(0, 2).some(result => result.meta.changes);
    if (!changed && updated.trustUploadStatus === "uploaded" && body.status === "failed") return trustError(409, "ALREADY_UPLOADED", "QC is already marked uploaded.");
    return Response.json({ qc: trustQc(request, updated), alreadyUploaded: !changed && updated.trustUploadStatus === "uploaded" }, { headers: trustNoStore });
  } catch (error) {
    console.error("Trust upload status update failed", error);
    return trustError(503, "UNAVAILABLE", "Could not update upload status.");
  }
}
