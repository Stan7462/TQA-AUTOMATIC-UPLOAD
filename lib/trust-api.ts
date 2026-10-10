import { env } from "@/lib/local-env";
import { getTechSessionFromCookie, hashToken, TECH_COOKIE } from "@/lib/tech-auth";

export type TrustKey = { id: string | null; label: string; tenantId: string };
export type TrustQcRow = {
  id: string;
  jobNumber: string;
  techId: string;
  screenshotId: string;
  photoIds: string;
  submittedAt: number;
  reviewedAt: number | null;
  trustUploadStatus: "ready" | "failed" | "uploaded";
  trustUploadedAt: number | null;
  trustExternalReference: string | null;
  trustUploadError: string | null;
  trustUploadAttempts: number;
  status: "approved" | "rejected";
  reviewNote: string | null;
  catalystFailures: string | null;
  trustUploadKind: "observation" | "follow_up";
  catalystObservationId: string | null;
};

export const trustNoStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export const qcIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const photoIdPattern = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export function trustError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: trustNoStore });
}

export async function requireTrustKey(request: Request): Promise<TrustKey | Response> {
  const header = request.headers.get("authorization") ?? "";
  const keyMatch = /^Bearer (tqa_trust_[a-f0-9]{64})$/.exec(header);
  const sessionMatch = /^Session ([a-f0-9]{64})$/.exec(header);
  if (!keyMatch && !sessionMatch) return trustError(401, "UNAUTHORIZED", "Sign in to TQA as an admin or send a Trust API key.");
  try {
    if (sessionMatch) {
      const session = await getTechSessionFromCookie(`${TECH_COOKIE}=${sessionMatch[1]}`, env.DB);
      return session?.isAdmin && !session.mustSetup
        ? { id: null, label: "Admin extension session", tenantId: session.tenantId }
        : trustError(401, "UNAUTHORIZED", "Sign in to TQA as an admin.");
    }
    const hash = await hashToken(keyMatch![1]);
    const key = await env.DB.prepare("SELECT k.id, k.label, k.tenant_id AS tenantId, k.last_used_at AS lastUsedAt FROM trust_api_keys k JOIN tenants t ON t.id = k.tenant_id WHERE k.token_hash = ? AND k.revoked_at IS NULL AND t.active = 1").bind(hash).first<{ id: string; label: string; tenantId: string; lastUsedAt: number | null }>();
    if (!key) return trustError(401, "UNAUTHORIZED", "API key is invalid or revoked.");
    if (!key.lastUsedAt || key.lastUsedAt < Date.now() - 300_000) {
      await env.DB.prepare("UPDATE trust_api_keys SET last_used_at = ? WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL").bind(Date.now(), key.tenantId, key.id).run();
    }
    return { id: key.id, label: key.label, tenantId: key.tenantId };
  } catch (error) {
    console.error("Trust API authentication failed", error);
    return trustError(503, "UNAVAILABLE", "Trust API is temporarily unavailable.");
  }
}

export function trustQc(request: Request, row: TrustQcRow) {
  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProtocol === "https" || forwardedProtocol === "http") requestUrl.protocol = `${forwardedProtocol}:`;
  const base = requestUrl.origin.replace(/\/$/, "");
  const ids = JSON.parse(row.photoIds) as unknown;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && photoIdPattern.test(id))) throw new Error("Invalid QC photos");
  const photos = [
    { id: row.screenshotId, kind: "account_screenshot" as const, order: 0 },
    ...ids.map((id, index) => ({ id: id as string, kind: "live_photo" as const, order: index + 1 })),
  ];
  if (!photoIdPattern.test(row.screenshotId)) throw new Error("Invalid QC screenshot");
  return {
    id: row.id,
    jobNumber: row.jobNumber,
    techId: row.techId,
    reviewStatus: row.status,
    workflow: row.trustUploadKind,
    outcome: row.status === "rejected" ? "fail" as const : "pass" as const,
    supervisorComment: row.reviewNote,
    failureReasons: row.catalystFailures ? JSON.parse(row.catalystFailures) : [],
    catalystObservationId: row.catalystObservationId,
    uploadStatus: row.trustUploadStatus,
    submittedAt: new Date(row.submittedAt).toISOString(),
    approvedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
    uploadedAt: row.trustUploadedAt ? new Date(row.trustUploadedAt).toISOString() : null,
    externalReference: row.trustExternalReference,
    lastUploadError: row.trustUploadError,
    uploadAttempts: row.trustUploadAttempts,
    photos: photos.map((photo) => ({ ...photo, contentType: "image/jpeg" as const, url: `${base}/api/integrations/trust/photos/${photo.id}` })),
  };
}

export const trustQcSelect = "id, tech_id AS techId, job_number AS jobNumber, screenshot_id AS screenshotId, photo_ids AS photoIds, status, review_note AS reviewNote, catalyst_failures AS catalystFailures, trust_upload_kind AS trustUploadKind, catalyst_observation_id AS catalystObservationId, submitted_at AS submittedAt, reviewed_at AS reviewedAt, trust_upload_status AS trustUploadStatus, trust_uploaded_at AS trustUploadedAt, trust_external_reference AS trustExternalReference, trust_upload_error AS trustUploadError, trust_upload_attempts AS trustUploadAttempts";
