import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { getTechSession } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!env.BUCKET || !env.DB) return new Response("Photo storage is unavailable", { status: 503 });
  const { id } = await context.params;
  if (!/^\d{13}-[a-f0-9-]{36}\.jpg$/.test(id)) return new Response("Not found", { status: 404 });
  if (!isOwner(await getChatGPTUser())) {
    const techId = await getTechSession(request, env.DB);
    if (!techId) return new Response("Forbidden", { status: 403 });
    const row = await env.DB.prepare("SELECT id FROM qc_submissions WHERE tech_id = ? AND status = 'rejected' AND (screenshot_id = ? OR EXISTS (SELECT 1 FROM json_each(photo_ids) WHERE value = ?)) LIMIT 1").bind(techId, id, id).first();
    if (!row) return new Response("Forbidden", { status: 403 });
  }
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
