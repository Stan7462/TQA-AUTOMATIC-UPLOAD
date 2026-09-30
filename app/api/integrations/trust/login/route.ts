import { env } from "@/lib/local-env";
import { ADMIN_SESSION_LIFETIME_SECONDS, equalHex, hashPin, hashToken, normalizeTechId, randomHex } from "@/lib/tech-auth";
import { getRequestTenant } from "@/lib/tenant";
import { trustError, trustNoStore } from "@/lib/trust-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return trustError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
  const tenant = await getRequestTenant(request, env.DB);
  if (!tenant) return trustError(404, "TENANT_NOT_FOUND", "This TQA domain is not configured.");
  const body = await request.json().catch(() => null) as { techId?: unknown; pin?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  const pin = body?.pin;
  if (!techId || typeof pin !== "string" || !/^\d{5}$/.test(pin)) return trustError(400, "INVALID_LOGIN", "Enter the admin Tech ID and 5-digit PIN.");

  const row = await env.DB.prepare("SELECT pin_salt AS salt, pin_hash AS hash, active, is_admin AS isAdmin, locked_until AS lockedUntil FROM technicians WHERE tenant_id = ? AND tech_id = ?")
    .bind(tenant.id, techId).first<{ salt: string; hash: string; active: number; isAdmin: number; lockedUntil: number }>();
  const invalid = () => trustError(401, "INVALID_LOGIN", "Invalid admin Tech ID or PIN, or access is temporarily locked.");
  const now = Date.now();
  if (!row || !row.active || !row.isAdmin || row.lockedUntil > now) return invalid();
  if (row.lockedUntil > 0) await env.DB.prepare("UPDATE technicians SET failed_attempts = 0, locked_until = 0 WHERE tenant_id = ? AND tech_id = ? AND locked_until > 0 AND locked_until <= ?").bind(tenant.id, techId, now).run();
  const reserved = await env.DB.prepare("UPDATE technicians SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts >= 4 THEN ? ELSE locked_until END WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1 AND is_admin = 1 AND locked_until <= ? AND failed_attempts < 5")
    .bind(now + 15 * 60_000, tenant.id, techId, row.hash, now).run();
  if (!reserved.meta.changes || !equalHex(await hashPin(pin, row.salt), row.hash)) return invalid();

  const token = randomHex(32);
  const expiresAt = now + ADMIN_SESSION_LIFETIME_SECONDS * 1000;
  const saved = await env.DB.batch([
    env.DB.prepare("UPDATE technicians SET failed_attempts = 0, locked_until = 0 WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1 AND is_admin = 1").bind(tenant.id, techId, row.hash),
    env.DB.prepare("INSERT INTO tech_sessions (token_hash, tenant_id, tech_id, expires_at, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM technicians WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1 AND is_admin = 1)").bind(await hashToken(token), tenant.id, techId, expiresAt, now, tenant.id, techId, row.hash),
  ]);
  if (!saved[1].meta.changes) return invalid();
  return Response.json({ sessionToken: token, expiresAt, techId, tenant: { id: tenant.id, name: tenant.name } }, { headers: trustNoStore });
}
