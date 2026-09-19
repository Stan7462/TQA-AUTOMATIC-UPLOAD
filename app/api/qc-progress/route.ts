import { env } from "@/lib/local-env";
import { getTechSession, normalizeTechId } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.DB) return Response.json({ error: "QC progress is unavailable." }, { status: 503 });
  const url = new URL(request.url);
  const techId = normalizeTechId(url.searchParams.get("techId"));
  const start = Number(url.searchParams.get("start"));
  const end = Number(url.searchParams.get("end"));
  const now = Date.now();
  if (!techId || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || end - start > 32 * 86_400_000 || start > now + 86_400_000 || end < now - 86_400_000) {
    return Response.json({ error: "Invalid QC progress request." }, { status: 400 });
  }
  if (await getTechSession(request, env.DB) !== techId) return Response.json({ error: "Sign in to view your QC progress." }, { status: 401 });
  try {
    const result = await env.DB.prepare("SELECT COUNT(*) AS approved FROM qc_submissions WHERE tech_id = ? AND status = 'approved' AND submitted_at >= ? AND submitted_at < ?")
      .bind(techId, start, end).first<{ approved: number }>();
    return Response.json({ approved: result?.approved ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QC progress failed", error);
    return Response.json({ error: "Could not load QC progress." }, { status: 503 });
  }
}
