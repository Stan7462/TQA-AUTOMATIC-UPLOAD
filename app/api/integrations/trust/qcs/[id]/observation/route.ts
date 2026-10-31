import { env } from "@/lib/local-env";
import { requireCurrentExtension } from "@/lib/extension-version";
import { catalystIncludesScreenshot, qcIdPattern, requireTrustKey, trustError, trustNoStore, trustQc, trustQcSelect, trustQcSource, type TrustQcRow } from "@/lib/trust-api";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const key = await requireTrustKey(request);
  if (key instanceof Response) return key;
  const updateRequired = requireCurrentExtension(request);
  if (updateRequired) return updateRequired;
  const { id } = await context.params;
  if (!qcIdPattern.test(id)) return trustError(404, "NOT_FOUND", "QC not found.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return trustError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
  let body: { observationId?: unknown };
  try { body = await request.json(); } catch { return trustError(400, "INVALID_JSON", "Invalid JSON body."); }
  if (typeof body?.observationId !== "string" || !/^\d+$/.test(body.observationId) || body.observationId.length > 30) {
    return trustError(400, "INVALID_OBSERVATION_ID", "Enter the numeric Catalyst observation ID from the completed observation URL.");
  }
  try {
    const range = fiscalMonthBounds(fiscalMonthKey());
    const current = await env.DB.prepare("SELECT id, COALESCE(root_submission_id, id) AS rootSubmissionId, catalyst_observation_id AS catalystObservationId FROM qc_submissions WHERE tenant_id = ? AND id = ? AND status = 'approved' AND trust_upload_kind = 'follow_up' AND trust_upload_status IN ('ready', 'failed') AND submitted_at >= ? AND submitted_at < ?")
      .bind(key.tenantId, id, range.start, range.end).first<{ id: string; rootSubmissionId: string; catalystObservationId: string | null }>();
    if (!current) return trustError(409, "QC_NOT_READY", "This correction is not waiting for a Catalyst observation link.");
    if (current.catalystObservationId) {
      if (current.catalystObservationId !== body.observationId) return trustError(409, "OBSERVATION_CONFLICT", "This correction is already linked to a different Catalyst observation.");
    } else {
      const original = await env.DB.prepare("SELECT submission_id FROM qc_submission_attempts WHERE tenant_id = ? AND root_submission_id = ? AND status = 'rejected' AND rejection_upload_mode = 'catalyst' AND trust_upload_kind = 'observation' AND trust_upload_status = 'uploaded' AND catalyst_failures IS NOT NULL ORDER BY attempt_number LIMIT 1")
        .bind(key.tenantId, current.rootSubmissionId).first<{ submission_id: string }>();
      if (!original) return trustError(409, "ORIGINAL_FAIL_NOT_UPLOADED", "The original failed QC is not confirmed as uploaded to Catalyst.");
      await env.DB.batch([
        env.DB.prepare("UPDATE qc_submissions SET catalyst_observation_id = ? WHERE tenant_id = ? AND root_submission_id = ? AND catalyst_observation_id IS NULL").bind(body.observationId, key.tenantId, current.rootSubmissionId),
        env.DB.prepare("UPDATE qc_submission_attempts SET catalyst_observation_id = ?, trust_external_reference = CASE WHEN trust_upload_kind = 'observation' AND trust_upload_status = 'uploaded' THEN ? ELSE trust_external_reference END WHERE tenant_id = ? AND root_submission_id = ? AND catalyst_observation_id IS NULL").bind(body.observationId, body.observationId, key.tenantId, current.rootSubmissionId),
      ]);
    }
    const includeScreenshot = await catalystIncludesScreenshot(key.tenantId);
    const linked = await env.DB.prepare(`SELECT ${trustQcSelect} FROM ${trustQcSource} WHERE tenant_id = ? AND id = ?`).bind(key.tenantId, id).first<TrustQcRow>();
    if (!linked?.catalystObservationId) return trustError(503, "LINK_FAILED", "Could not link the Catalyst observation.");
    return Response.json({ qc: trustQc(request, linked, includeScreenshot), alreadyLinked: Boolean(current.catalystObservationId) }, { headers: trustNoStore });
  } catch (error) {
    console.error("Catalyst observation link failed", error);
    return trustError(503, "UNAVAILABLE", "Could not link the Catalyst observation.");
  }
}
