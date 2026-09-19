import { env } from "@/lib/local-env";
import { hashToken } from "@/lib/tech-auth";

export type TrustKey = { id: string; label: string };
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
};

export const trustNoStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export const qcIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const photoIdPattern = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export function trustError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: trustNoStore });
}

export async function requireTrustKey(request: Request): Promise<TrustKey | Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (tqa_trust_[a-f0-9]{64})$/.exec(header);
  if (!match) return trustError(401, "UNAUTHORIZED", "Send the Trust API key as a Bearer token.");
  try {
    const hash = await hashToken(match[1]);
    const key = await env.DB.prepare("SELECT id, label, last_used_at AS lastUsedAt FROM trust_api_keys WHERE token_hash = ? AND revoked_at IS NULL").bind(hash).first<{ id: string; label: string; lastUsedAt: number | null }>();
    if (!key) return trustError(401, "UNAUTHORIZED", "API key is invalid or revoked.");
    if (!key.lastUsedAt || key.lastUsedAt < Date.now() - 300_000) {
      await env.DB.prepare("UPDATE trust_api_keys SET last_used_at = ? WHERE id = ? AND revoked_at IS NULL").bind(Date.now(), key.id).run();
    }
    return { id: key.id, label: key.label };
  } catch (error) {
    console.error("Trust API authentication failed", error);
    return trustError(503, "UNAVAILABLE", "Trust API is temporarily unavailable.");
  }
}

export function trustQc(request: Request, row: TrustQcRow) {
  const base = (process.env.TQA_PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
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
    reviewStatus: "approved" as const,
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

export const trustQcSelect = "id, tech_id AS techId, job_number AS jobNumber, screenshot_id AS screenshotId, photo_ids AS photoIds, submitted_at AS submittedAt, reviewed_at AS reviewedAt, trust_upload_status AS trustUploadStatus, trust_uploaded_at AS trustUploadedAt, trust_external_reference AS trustExternalReference, trust_upload_error AS trustUploadError, trust_upload_attempts AS trustUploadAttempts";
