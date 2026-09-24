import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { ADMIN_TECH_ID, normalizeTechId, sameOrigin } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ techId: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!isOwner(await getChatGPTUser())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Technician management is unavailable" }, { status: 503 });
  const techId = normalizeTechId((await context.params).techId);
  if (!techId) return Response.json({ error: "Invalid Tech ID" }, { status: 400 });
  if (techId === ADMIN_TECH_ID) return Response.json({ error: "The admin Tech ID cannot be disabled." }, { status: 403 });

  try {
    const existing = await env.DB.prepare("SELECT active FROM technicians WHERE tech_id = ?").bind(techId).first<{ active: number }>();
    if (!existing) return Response.json({ error: "Technician not found." }, { status: 404 });
    await env.DB.batch([
      env.DB.prepare("UPDATE technicians SET active = 0, failed_attempts = 0, locked_until = 0 WHERE tech_id = ?").bind(techId),
      env.DB.prepare("DELETE FROM tech_sessions WHERE tech_id = ?").bind(techId),
      env.DB.prepare("DELETE FROM qc_upload_photos WHERE tech_id = ?").bind(techId),
      env.DB.prepare("INSERT INTO technician_removals (tech_id, state, started_at) VALUES (?, 'disabled', ?) ON CONFLICT(tech_id) DO UPDATE SET state = 'disabled', started_at = excluded.started_at").bind(techId, Date.now()),
    ]);
    return Response.json({ techId, complete: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Technician disable failed", error);
    return Response.json({ error: "Could not disable this technician. Try again." }, { status: 503 });
  }
}
