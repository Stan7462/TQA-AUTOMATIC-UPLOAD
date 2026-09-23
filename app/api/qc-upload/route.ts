import { env } from "@/lib/local-env";
import { getTechSession, normalizeTechId, sameOrigin } from "@/lib/tech-auth";
import { normalizeQcLocation } from "@/lib/qc-location";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";

const MAX_SCREENSHOT_BYTES = 250 * 1024;
const MAX_LIVE_PHOTO_BYTES = 200 * 1024;
const MAX_BODY_BYTES = 512 * 1024;
const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;

type UploadBody = {
  action?: unknown;
  techId?: unknown;
  jobNumber?: unknown;
  submissionId?: unknown;
  redoSourceId?: unknown;
  redoChanged?: unknown;
  slot?: unknown;
  image?: unknown;
  photoCount?: unknown;
  location?: unknown;
};

function validJpeg(bytes: Uint8Array, maxBytes: number): boolean {
  return bytes.length >= 500 && bytes.length <= maxBytes && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
}

function photoId(now: number): string {
  return String(9_999_999_999_999 - now).padStart(13, "0") + "-" + crypto.randomUUID() + ".jpg";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (!env.DB || !env.BUCKET) return Response.json({ error: "QC uploads are unavailable. Try again later." }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return Response.json({ error: "The picture is too large." }, { status: 413 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "Invalid upload." }, { status: 415 });

  const body = await request.json().catch(() => null) as UploadBody | null;
  const techId = normalizeTechId(body?.techId);
  const jobNumber = typeof body?.jobNumber === "string" ? body.jobNumber.trim() : "";
  const submissionId = body?.submissionId;
  const redoSourceId = body?.redoSourceId == null ? null : body.redoSourceId;
  if (!techId || !/^\d{1,6}$/.test(jobNumber) || typeof submissionId !== "string" || !/^[0-9a-f-]{36}$/.test(submissionId)) {
    return Response.json({ error: "Enter a job number using 1 to 6 digits." }, { status: 400 });
  }
  if (redoSourceId !== null && (typeof redoSourceId !== "string" || !/^[0-9a-f-]{36}$/.test(redoSourceId) || redoSourceId === submissionId)) return Response.json({ error: "This rejected QC cannot be redone." }, { status: 400 });
  if (redoSourceId && body?.action === "finalize" && body.redoChanged !== true) return Response.json({ error: "Change the job number or at least one picture before resubmitting this QC." }, { status: 409 });
  const authenticatedTechId = await getTechSession(request, env.DB);
  if (authenticatedTechId !== techId) return Response.json({ error: "Sign in with this Tech ID and PIN before submitting." }, { status: 401 });
  const removal = await env.DB.prepare("SELECT state FROM technician_removals WHERE tech_id = ?").bind(techId).first();
  if (removal) return Response.json({ error: "This Tech ID is no longer available. Contact your supervisor." }, { status: 403 });
  const prior = await env.DB.prepare("SELECT tech_id AS techId, job_number AS jobNumber FROM qc_submissions WHERE id = ?").bind(submissionId).first<{ techId: string; jobNumber: string }>();
  if (prior) return prior.techId === techId && prior.jobNumber === jobNumber
    ? Response.json({ complete: true }, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "Submission ID already used." }, { status: 409 });

  if (body?.action === "photo") {
    if (!Number.isInteger(body.slot) || (body.slot as number) < 0 || (body.slot as number) > 7 || typeof body.image !== "string" || body.image.length > 350_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) {
      return Response.json({ error: "The picture could not be read. Retake it and try again." }, { status: 400 });
    }
    const bytes = Buffer.from(body.image, "base64");
    const maxBytes = body.slot === 0 ? MAX_SCREENSHOT_BYTES : MAX_LIVE_PHOTO_BYTES;
    if (!validJpeg(bytes, maxBytes)) return Response.json({ error: `The picture must be a valid JPEG no larger than ${body.slot === 0 ? 250 : 200} KB.` }, { status: 400 });
    try {
      const now = Date.now();
      await env.DB.prepare("DELETE FROM qc_upload_photos WHERE created_at < ?").bind(now - DRAFT_LIFETIME_MS).run();
      await env.DB.prepare("INSERT INTO qc_upload_photos (submission_id, tech_id, slot, image, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(submission_id, tech_id, slot) DO UPDATE SET image = excluded.image, created_at = excluded.created_at")
        .bind(submissionId, techId, body.slot as number, bytes, now).run();
      return Response.json({ slot: body.slot }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("QC picture upload failed", error);
      return Response.json({ error: "Could not save this picture on the laptop. Try again." }, { status: 503 });
    }
  }

  if (body?.action !== "finalize" || !Number.isInteger(body.photoCount) || (body.photoCount as number) < 2 || (body.photoCount as number) > 7) {
    return Response.json({ error: "Take at least 2 live QC photos. Check the QC requirements for your job." }, { status: 400 });
  }
  const photoCount = body.photoCount as number;
  const location = normalizeQcLocation(body.location) ?? { status: "unavailable" as const, capturedAt: Date.now() };
  const currentMonth = fiscalMonthBounds(fiscalMonthKey());
  const redoSource = redoSourceId ? await env.DB.prepare("SELECT id, screenshot_id AS screenshotId, photo_ids AS photoIds FROM qc_submissions WHERE id = ? AND tech_id = ? AND status = 'rejected' AND submitted_at >= ? AND submitted_at < ?").bind(redoSourceId, techId, currentMonth.start, currentMonth.end).first<{ id: string; screenshotId: string; photoIds: string }>() : null;
  if (redoSourceId && !redoSource) return Response.json({ error: "This rejected QC is no longer available to redo. Return to Rejected QCs and refresh the list." }, { status: 409 });
  const rows = await env.DB.prepare("SELECT slot, image FROM qc_upload_photos WHERE submission_id = ? AND tech_id = ? ORDER BY slot")
    .bind(submissionId, techId).all<{ slot: number; image: Uint8Array }>();
  const images = Array.from({ length: photoCount + 1 }, (_, slot) => rows.results.find((row) => row.slot === slot)?.image);
  if (images.some((image, index) => !image || !validJpeg(image, index === 0 ? MAX_SCREENSHOT_BYTES : MAX_LIVE_PHOTO_BYTES))) return Response.json({ error: "One or more pictures did not reach the server. Tap Submit again to resume." }, { status: 409 });

  const now = Date.now();
  const ids = images.map(() => photoId(now));
  const uploaded: string[] = [];
  try {
    for (let index = 0; index < images.length; index++) {
      const key = "captures/" + ids[index];
      await env.BUCKET.put(key, images[index]!, {
        httpMetadata: { contentType: "image/jpeg" },
        customMetadata: { techId, submissionId, kind: index === 0 ? "account-screenshot" : "live-photo", submittedAt: new Date(now).toISOString() },
      });
      uploaded.push(key);
    }
    const savedId = submissionId;
    if (redoSource) {
      const updated = await env.DB.prepare("UPDATE qc_submissions SET id = ?, job_number = ?, screenshot_id = ?, photo_ids = ?, status = 'pending', submitted_at = ?, reviewed_at = NULL, review_note = NULL, trust_upload_status = 'ready', trust_uploaded_at = NULL, trust_external_reference = NULL, trust_upload_error = NULL, trust_upload_attempts = 0, trust_last_attempt_at = NULL, trust_uploaded_by_key_id = NULL, location_status = ?, location_latitude = ?, location_longitude = ?, location_accuracy = ?, location_captured_at = ? WHERE id = ? AND tech_id = ? AND status = 'rejected' AND submitted_at >= ? AND submitted_at < ?")
        .bind(submissionId, jobNumber, ids[0], JSON.stringify(ids.slice(1)), now, location.status, location.status === "verified" ? location.latitude : null, location.status === "verified" ? location.longitude : null, location.status === "verified" ? location.accuracy : null, location.capturedAt, redoSource.id, techId, currentMonth.start, currentMonth.end).run();
      if (!updated.meta.changes) throw new Error("redo-source-unavailable");
      const oldPhotoIds = JSON.parse(redoSource.photoIds) as unknown;
      const oldKeys = [redoSource.screenshotId, ...(Array.isArray(oldPhotoIds) ? oldPhotoIds.filter((id): id is string => typeof id === "string") : [])].map((id) => `captures/${id}`);
      await Promise.allSettled(oldKeys.map((key) => env.BUCKET.delete(key)));
    } else {
      const inserted = await env.DB.prepare("INSERT INTO qc_submissions (id, tech_id, job_number, screenshot_id, photo_ids, status, submitted_at, location_status, location_latitude, location_longitude, location_accuracy, location_captured_at) SELECT ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM technician_removals WHERE tech_id = ?)")
        .bind(submissionId, techId, jobNumber, ids[0], JSON.stringify(ids.slice(1)), now, location.status, location.status === "verified" ? location.latitude : null, location.status === "verified" ? location.longitude : null, location.status === "verified" ? location.accuracy : null, location.capturedAt, techId).run();
      if (!inserted.meta.changes) throw new Error("removed-technician");
    }
    try { await env.DB.prepare("DELETE FROM qc_upload_photos WHERE submission_id = ? AND tech_id = ?").bind(submissionId, techId).run(); }
    catch (error) { console.error("QC staging cleanup failed", error); }
    return Response.json({ id: savedId, status: "pending" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QC finalization failed", error);
    await Promise.allSettled(uploaded.map((key) => env.BUCKET.delete(key)));
    return Response.json({ error: error instanceof Error && error.message === "removed-technician" ? "This Tech ID is no longer available. Contact your supervisor." : error instanceof Error && error.message === "redo-source-unavailable" ? "This rejected QC is no longer available to redo. Return to Rejected QCs and refresh the list." : "Could not finish saving this QC. Tap Submit again to retry." }, { status: error instanceof Error && error.message === "removed-technician" ? 403 : error instanceof Error && error.message === "redo-source-unavailable" ? 409 : 503 });
  }
}
