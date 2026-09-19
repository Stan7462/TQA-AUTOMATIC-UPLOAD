import { env } from "@/lib/local-env";
import { photoIdPattern, requireTrustKey, trustError, trustNoStore } from "@/lib/trust-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const key = await requireTrustKey(request);
  if (key instanceof Response) return key;
  const { id } = await context.params;
  if (!photoIdPattern.test(id)) return trustError(404, "NOT_FOUND", "Approved QC photo not found.");
  try {
    const owner = await env.DB.prepare("SELECT id FROM qc_submissions WHERE status = 'approved' AND (screenshot_id = ? OR EXISTS (SELECT 1 FROM json_each(photo_ids) WHERE value = ?)) LIMIT 1").bind(id, id).first();
    if (!owner) return trustError(404, "NOT_FOUND", "Approved QC photo not found.");
    const photo = await env.BUCKET.get(`captures/${id}`);
    if (!photo) return trustError(404, "PHOTO_MISSING", "Approved QC photo is missing from storage.");
    return new Response(photo.body, { headers: { ...trustNoStore, "Content-Type": "image/jpeg" } });
  } catch (error) {
    console.error("Trust photo fetch failed", error);
    return trustError(503, "UNAVAILABLE", "Could not load approved QC photo.");
  }
}
