import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { getTechSession, normalizeTechId, sameOrigin } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 30 * 1024;
const MAX_REQUEST_BYTES = 512 * 1024;
const PAGE_SIZE = 25;
const statuses = new Set(["all", "pending", "approved", "rejected"]);

function validJpeg(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.type === "image/jpeg" && file.size >= 500 && file.size <= MAX_IMAGE_BYTES;
}

function validJpegBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 500 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
}

function photoId(now: number): string {
  return String(9_999_999_999_999 - now).padStart(13, "0") + "-" + crypto.randomUUID() + ".jpg";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  if (!env.DB || !env.BUCKET) return Response.json({ error: "QC submissions are unavailable. Try again later." }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return Response.json({ error: "The images are too large. Retake them at a lower resolution." }, { status: 413 });
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return Response.json({ error: "Invalid submission" }, { status: 415 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "Could not read the submission. Try again." }, { status: 400 }); }
  const techId = normalizeTechId(form.get("techId"));
  const jobNumber = String(form.get("jobNumber") ?? "").trim();
  const requestedId = String(form.get("submissionId") ?? "");
  const screenshot = form.get("screenshot");
  const photos = form.getAll("photos");
  if (!techId) return Response.json({ error: "Enter a valid Tech ID." }, { status: 400 });
  const authenticatedTechId = await getTechSession(request, env.DB);
  if (!authenticatedTechId || authenticatedTechId !== techId) return Response.json({ error: "Sign in with this Tech ID and PIN before submitting." }, { status: 401 });
  const removal = await env.DB.prepare("SELECT state FROM technician_removals WHERE tech_id = ?").bind(techId).first();
  if (removal) return Response.json({ error: "This Tech ID is no longer available. Contact your supervisor." }, { status: 403 });
  if (!/^\d{1,6}$/.test(jobNumber)) return Response.json({ error: "Enter a job number using 1 to 6 digits." }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/.test(requestedId)) return Response.json({ error: "Invalid submission ID." }, { status: 400 });
  if ((screenshot instanceof File && screenshot.size > MAX_IMAGE_BYTES) || photos.some((photo) => photo instanceof File && photo.size > MAX_IMAGE_BYTES)) return Response.json({ error: "Each picture must be 30 KB or smaller." }, { status: 413 });
  if (!validJpeg(screenshot)) return Response.json({ error: "Choose one valid account screenshot." }, { status: 400 });
  if (photos.length < 2 || photos.length > 7 || !photos.every(validJpeg)) return Response.json({ error: "Take at least 2 live QC photos. Check the QC requirements for your job." }, { status: 400 });
  const images = [screenshot, ...photos] as File[];
  if (images.reduce((total, image) => total + image.size, 0) > MAX_REQUEST_BYTES) return Response.json({ error: "The images are too large." }, { status: 413 });

  const prior = await env.DB.prepare("SELECT tech_id AS techId, job_number AS jobNumber FROM qc_submissions WHERE id = ?").bind(requestedId).first<{ techId: string; jobNumber: string }>();
  if (prior) return prior.techId === techId && prior.jobNumber === jobNumber ? Response.json({ id: requestedId, status: "pending" }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Submission ID already used" }, { status: 409 });
  const now = Date.now();
  const submissionId = requestedId;
  const ids = images.map(() => photoId(now));
  const uploaded: string[] = [];
  try {
    for (let index = 0; index < images.length; index++) {
      const bytes = new Uint8Array(await images[index].arrayBuffer());
      if (!validJpegBytes(bytes)) throw new Error("invalid-image");
      const key = "captures/" + ids[index];
      await env.BUCKET.put(key, bytes, {
        httpMetadata: { contentType: "image/jpeg" },
        customMetadata: { techId, submissionId, kind: index === 0 ? "account-screenshot" : "live-photo", submittedAt: new Date(now).toISOString() },
      });
      uploaded.push(key);
    }
    const inserted = await env.DB.prepare(
      "INSERT INTO qc_submissions (id, tech_id, job_number, screenshot_id, photo_ids, status, submitted_at) SELECT ?, ?, ?, ?, ?, 'pending', ? WHERE NOT EXISTS (SELECT 1 FROM technician_removals WHERE tech_id = ?)"
    ).bind(submissionId, techId, jobNumber, ids[0], JSON.stringify(ids.slice(1)), now, techId).run();
    if (!inserted.meta.changes) throw new Error("removed-technician");
    return Response.json({ id: submissionId, status: "pending" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QC submission failed", error);
    await Promise.allSettled(uploaded.map((key) => env.BUCKET!.delete(key)));
    return Response.json({ error: error instanceof Error && error.message === "invalid-image" ? "One of the images is invalid. Choose the screenshot again and retake the photos." : error instanceof Error && error.message === "removed-technician" ? "This Tech ID is no longer available. Contact your supervisor." : "Could not save this QC. Your images are still on this page; try again." }, { status: error instanceof Error && error.message === "removed-technician" ? 403 : 503 });
  }
}

export async function GET(request: Request) {
  if (!isOwner(await getChatGPTUser())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "QC submissions are unavailable" }, { status: 503 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending";
  if (!statuses.has(status)) return Response.json({ error: "Invalid status" }, { status: 400 });
  const pageSize = url.searchParams.get("pageSize") === "100" ? 100 : PAGE_SIZE;
  const start = Number(url.searchParams.get("start"));
  const end = Number(url.searchParams.get("end"));
  const hasRange = url.searchParams.has("start") || url.searchParams.has("end");
  if (hasRange && (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > 370 * 86400000)) return Response.json({ error: "Invalid date range" }, { status: 400 });
  const cursor = url.searchParams.get("cursor");
  const match = cursor?.match(/^(\d{1,16}):([0-9a-f-]{36})$/);
  if (cursor && !match) return Response.json({ error: "Invalid page" }, { status: 400 });
  try {
    const conditions: string[] = [];
    const bindings: Array<string | number> = [];
    if (status !== "all") { conditions.push("status = ?"); bindings.push(status); }
    if (hasRange) { conditions.push("submitted_at >= ? AND submitted_at < ?"); bindings.push(start, end); }
    if (match) { conditions.push("(submitted_at < ? OR (submitted_at = ? AND id < ?))"); bindings.push(Number(match[1]), Number(match[1]), match[2]); }
    const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
    const query = env.DB.prepare("SELECT id, tech_id AS techId, job_number AS jobNumber, screenshot_id AS screenshotId, photo_ids AS photoIds, status, submitted_at AS submittedAt, reviewed_at AS reviewedAt, review_note AS reviewNote, trust_upload_status AS trustUploadStatus, trust_uploaded_at AS trustUploadedAt, trust_external_reference AS trustExternalReference, trust_upload_error AS trustUploadError FROM qc_submissions" + where + " ORDER BY submitted_at DESC, id DESC LIMIT ?").bind(...bindings, pageSize + 1);
    const [result, totals] = await Promise.all([
      query.all(),
      env.DB.prepare("SELECT status, trust_upload_status AS trustUploadStatus, COUNT(*) AS total FROM qc_submissions" + (hasRange ? " WHERE submitted_at >= ? AND submitted_at < ?" : "") + " GROUP BY status, trust_upload_status").bind(...(hasRange ? [start, end] : [])).all<{ status: string; trustUploadStatus: string; total: number }>(),
    ]);
    const counts = { pending: 0, approved: 0, uploaded: 0, rejected: 0 };
    for (const row of totals.results) {
      if (row.status === "pending" || row.status === "approved" || row.status === "rejected") counts[row.status] += row.total;
      if (row.status === "approved" && row.trustUploadStatus === "uploaded") counts.uploaded += row.total;
    }
    const rows = result.results as Array<{ id: string; techId: string; screenshotId: string; photoIds: string; status: string; submittedAt: number; reviewedAt: number | null }>;
    const page = rows.slice(0, pageSize);
    const last = page.at(-1);
    return Response.json({ submissions: page.map((row) => ({ ...row, photoIds: JSON.parse(row.photoIds) as string[] })), nextCursor: rows.length > pageSize && last ? `${last.submittedAt}:${last.id}` : null, counts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("QC list failed", error);
    return Response.json({ error: "Could not load QC submissions" }, { status: 503 });
  }
}
