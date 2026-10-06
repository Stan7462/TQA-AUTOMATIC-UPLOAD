import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isPlatformOwner } from "@/app/access";
import { sameOrigin } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

const companyIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
const photoIdPattern = /^\d{13}-[0-9a-f-]{36}\.jpg$/;

async function ownerRequest(request: Request, id: string): Promise<Response | null> {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (!isPlatformOwner(await getChatGPTUser())) return Response.json({ error: "Only the platform owner can manage companies." }, { status: 403 });
  if (!companyIdPattern.test(id) || id === "default") return Response.json({ error: "Invalid company." }, { status: 400 });
  return null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  const denied = await ownerRequest(request, id);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { active?: unknown } | null;
  if (typeof body?.active !== "boolean") return Response.json({ error: "Choose whether the company is active." }, { status: 400 });
  try {
    const result = await env.DB.prepare("UPDATE tenants SET active=? WHERE id=?").bind(body.active ? 1 : 0, id).run();
    if (!result.meta.changes) return Response.json({ error: "Company not found." }, { status: 404 });
    if (!body.active) await env.DB.prepare("DELETE FROM tech_sessions WHERE tenant_id=?").bind(id).run();
    return Response.json({ id, active: body.active }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Company update failed", error);
    return Response.json({ error: "Could not update the company." }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  const denied = await ownerRequest(request, id);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  const company = await env.DB.prepare("SELECT name FROM tenants WHERE id=?").bind(id).first<{ name: string }>();
  if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
  if (typeof body?.confirmation !== "string" || body.confirmation.trim() !== company.name) return Response.json({ error: "Type the complete company name to confirm deletion." }, { status: 400 });

  try {
    const [currentRows, attemptRows] = await Promise.all([
      env.DB.prepare("SELECT screenshot_id AS screenshotId, photo_ids AS photoIds FROM qc_submissions WHERE tenant_id=?").bind(id).all<{ screenshotId: string; photoIds: string }>(),
      env.DB.prepare("SELECT screenshot_id AS screenshotId, photo_ids AS photoIds FROM qc_submission_attempts WHERE tenant_id=?").bind(id).all<{ screenshotId: string; photoIds: string }>(),
    ]);
    const photoKeys = new Set<string>();
    for (const row of [...currentRows.results, ...attemptRows.results]) {
      const live = JSON.parse(row.photoIds) as unknown;
      const ids = [row.screenshotId, ...(Array.isArray(live) ? live : [])];
      if (!ids.every((value) => typeof value === "string" && photoIdPattern.test(value))) throw new Error("Company has invalid photo references");
      for (const photoId of ids as string[]) photoKeys.add(`captures/${photoId}`);
    }
    const keys = [...photoKeys];
    for (let index = 0; index < keys.length; index += 500) await env.BUCKET.delete(keys.slice(index, index + 500));

    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM qc_upload_photos WHERE tenant_id=?").bind(id),
      env.DB.prepare("DELETE FROM qc_submission_attempts WHERE tenant_id=?").bind(id),
      env.DB.prepare("DELETE FROM qc_submissions WHERE tenant_id=?").bind(id),
      env.DB.prepare("DELETE FROM trust_api_keys WHERE tenant_id=?").bind(id),
      env.DB.prepare("DELETE FROM technician_removals WHERE tenant_id=?").bind(id),
      env.DB.prepare("DELETE FROM tech_sessions WHERE tenant_id=?").bind(id),
      env.DB.prepare("DELETE FROM technicians WHERE tenant_id=?").bind(id),
      env.DB.prepare("DELETE FROM tenant_domains WHERE tenant_id=?").bind(id),
      env.DB.prepare("DELETE FROM tenants WHERE id=?").bind(id),
    ]);
    if (!results[8].meta.changes) return Response.json({ error: "Company not found." }, { status: 404 });
    return Response.json({ deleted: true, id, deletedPictures: keys.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Company deletion failed", error);
    return Response.json({ error: "Could not complete company deletion. Please try again." }, { status: 503 });
  }
}
