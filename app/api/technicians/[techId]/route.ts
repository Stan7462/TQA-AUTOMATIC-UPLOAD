import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { ADMIN_TECH_ID, normalizeTechId, sameOrigin } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

type QcImages = { id: string; screenshotId: string; photoIds: string };

export async function DELETE(request: Request, context: { params: Promise<{ techId: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!isOwner(await getChatGPTUser())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB || !env.BUCKET) return Response.json({ error: "Technician removal is unavailable" }, { status: 503 });
  const techId = normalizeTechId((await context.params).techId);
  if (!techId) return Response.json({ error: "Invalid Tech ID" }, { status: 400 });
  if (techId === ADMIN_TECH_ID) return Response.json({ error: "The admin Tech ID cannot be removed." }, { status: 403 });

  try {
    await env.DB.prepare("INSERT OR IGNORE INTO technician_removals (tech_id, state, started_at) VALUES (?, 'deleting', ?)").bind(techId, Date.now()).run();
    const removal = await env.DB.prepare("SELECT state FROM technician_removals WHERE tech_id = ?").bind(techId).first<{ state: string }>();
    if (removal?.state === "removed") return Response.json({ techId, complete: true }, { headers: { "Cache-Control": "no-store" } });

    const result = await env.DB.prepare("SELECT id, screenshot_id AS screenshotId, photo_ids AS photoIds FROM qc_submissions WHERE tech_id = ? ORDER BY id LIMIT 50").bind(techId).all<QcImages>();
    const rows = result.results;
    if (rows.length) {
      const keys = rows.flatMap((row) => [row.screenshotId, ...(JSON.parse(row.photoIds) as string[])]).map((id) => "captures/" + id);
      if (keys.length) await env.BUCKET.delete(keys);
      const placeholders = rows.map(() => "?").join(",");
      await env.DB.prepare(`DELETE FROM qc_submissions WHERE tech_id = ? AND id IN (${placeholders})`).bind(techId, ...rows.map((row) => row.id)).run();
      return Response.json({ techId, complete: false }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }

    await env.DB.batch([
      env.DB.prepare("DELETE FROM qc_upload_photos WHERE tech_id = ?").bind(techId),
      env.DB.prepare("DELETE FROM tech_sessions WHERE tech_id = ?").bind(techId),
      env.DB.prepare("DELETE FROM technicians WHERE tech_id = ?").bind(techId),
      env.DB.prepare("UPDATE technician_removals SET state = 'removed' WHERE tech_id = ?").bind(techId),
    ]);
    return Response.json({ techId, complete: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Technician removal failed", error);
    return Response.json({ error: "Could not finish removing this technician. Retry to continue." }, { status: 503 });
  }
}
