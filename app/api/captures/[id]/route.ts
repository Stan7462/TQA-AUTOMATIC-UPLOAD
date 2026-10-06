import { env } from "@/lib/local-env";
import { getTechSessionContext } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!env.BUCKET || !env.DB) return new Response("Photo storage is unavailable", { status: 503 });
  const { id } = await context.params;
  if (!/^\d{13}-[a-f0-9-]{36}\.jpg$/.test(id)) return new Response("Not found", { status: 404 });
  const session = await getTechSessionContext(request, env.DB);
  if (!session) return new Response("Forbidden", { status: 403 });
  const row = await env.DB.prepare("SELECT id FROM qc_submissions WHERE tenant_id = ? AND (? = 1 OR tech_id = ?) AND (screenshot_id = ? OR EXISTS (SELECT 1 FROM json_each(photo_ids) WHERE value = ?)) UNION ALL SELECT submission_id AS id FROM qc_submission_attempts WHERE tenant_id = ? AND (? = 1 OR tech_id = ?) AND (screenshot_id = ? OR EXISTS (SELECT 1 FROM json_each(photo_ids) WHERE value = ?)) LIMIT 1").bind(session.tenantId, session.isAdmin ? 1 : 0, session.techId, id, id, session.tenantId, session.isAdmin ? 1 : 0, session.techId, id, id).first();
  if (!row) return new Response("Forbidden", { status: 403 });
  try {
    const photo = await env.BUCKET.get("captures/" + id);
    if (!photo) return new Response("Not found", { status: 404 });
    return new Response(photo.body, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Photo is unavailable", { status: 503 });
  }
}
