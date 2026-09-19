import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { sameOrigin } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  if (!isOwner(await getChatGPTUser())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "QC review is unavailable" }, { status: 503 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid QC" }, { status: 400 });
  let status: unknown;
  let reviewNote: unknown;
  try { const body = await request.json() as { status?: unknown; reviewNote?: unknown }; status = body.status; reviewNote = body.reviewNote; }
  catch { return Response.json({ error: "Invalid decision" }, { status: 400 }); }
  if (status !== "approved" && status !== "rejected") return Response.json({ error: "Choose approve or reject" }, { status: 400 });
  if (status === "rejected" && (typeof reviewNote !== "string" || !reviewNote.trim() || reviewNote.trim().length > 1000)) return Response.json({ error: "Add a rejection note (up to 1,000 characters)." }, { status: 400 });
  try {
    const reviewedAt = Date.now();
    const result = await env.DB.prepare("UPDATE qc_submissions SET status = ?, reviewed_at = ?, review_note = ? WHERE id = ?").bind(status, reviewedAt, status === "rejected" ? (reviewNote as string).trim() : null, id).run();
    if (!result.meta.changes) return Response.json({ error: "QC not found" }, { status: 404 });
    return Response.json({ id, status, reviewedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QC decision failed", error);
    return Response.json({ error: "Could not save the decision" }, { status: 503 });
  }
}
