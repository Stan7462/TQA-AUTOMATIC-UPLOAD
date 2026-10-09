import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { activityMonth, type CatalystUpload } from "@/lib/catalyst-activity";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!isOwner(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const month = activityMonth();
  try {
    const [roster, rows] = await Promise.all([
      env.DB.prepare("SELECT tech_id AS techId FROM technicians WHERE tenant_id = ? AND active = 1 AND is_admin = 0 ORDER BY tech_id").bind(user!.tenantId).all<{ techId: string }>(),
      env.DB.prepare("SELECT id, tech_id AS techId, job_number AS jobNumber, trust_uploaded_at AS uploadedAt FROM qc_submissions WHERE tenant_id = ? AND trust_upload_status = 'uploaded' AND trust_uploaded_at >= ? AND trust_uploaded_at < ? ORDER BY trust_uploaded_at, id").bind(user!.tenantId, month.start, month.end).all<CatalystUpload>(),
    ]);
    return Response.json({ ...month, uploads: rows.results, techIds: [...new Set([...roster.results.map(t => t.techId), ...rows.results.map(q => q.techId)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Catalyst activity failed", error);
    return Response.json({ error: "Could not load Catalyst activity." }, { status: 503 });
  }
}
