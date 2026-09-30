import { env } from "@/lib/local-env";
import { ADMIN_SESSION_LIFETIME_SECONDS, equalHex, hashPin, hashToken, normalizeTechId, randomHex, sameOrigin, TECH_SESSION_LIFETIME_SECONDS, techCookie } from "@/lib/tech-auth";
import { getRequestTenant, tenantUnavailable } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const tenant = await getRequestTenant(request, env.DB);
  if (!tenant) return tenantUnavailable();
  const body = await request.json().catch(() => null) as { techId?: unknown; pin?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  const pin = body?.pin;
  if (!techId || typeof pin !== "string" || !/^(?:\d{5}|\d{8})$/.test(pin)) return Response.json({ error: "Enter your Tech ID and PIN." }, { status: 400 });
  const row = await env.DB.prepare("SELECT pin_salt AS salt, pin_hash AS hash, pin_ciphertext AS pinCiphertext, active, is_admin AS isAdmin, locked_until AS lockedUntil FROM technicians WHERE tenant_id = ? AND tech_id = ?").bind(tenant.id, techId).first<{ salt: string; hash: string; pinCiphertext: string | null; active: number; isAdmin: number; lockedUntil: number }>();
  const invalid = () => Response.json({ error: "Invalid Tech ID or PIN, or access is temporarily locked." }, { status: 401 });
  if (!row || !row.active || row.lockedUntil > Date.now() || pin.length !== (row.pinCiphertext ? 5 : 8)) return invalid();
  const now = Date.now();
  if (row.lockedUntil > 0) await env.DB.prepare("UPDATE technicians SET failed_attempts = 0, locked_until = 0 WHERE tenant_id = ? AND tech_id = ? AND locked_until > 0 AND locked_until <= ?").bind(tenant.id, techId, now).run();
  const reserved = await env.DB.prepare("UPDATE technicians SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts >= 4 THEN ? ELSE locked_until END WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1 AND locked_until <= ? AND failed_attempts < 5")
    .bind(now + 15 * 60_000, tenant.id, techId, row.hash, now).run();
  if (!reserved.meta.changes) return invalid();
  const candidate = await hashPin(pin, row.salt);
  if (!equalHex(candidate, row.hash)) return invalid();
  const token = randomHex(32);
  const sessionLifetime = row.isAdmin ? ADMIN_SESSION_LIFETIME_SECONDS : TECH_SESSION_LIFETIME_SECONDS;
  const saved = await env.DB.batch([
    env.DB.prepare("UPDATE technicians SET failed_attempts = 0, locked_until = 0 WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1").bind(tenant.id, techId, row.hash),
    env.DB.prepare("INSERT INTO tech_sessions (token_hash, tenant_id, tech_id, expires_at, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM technicians WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1)").bind(await hashToken(token), tenant.id, techId, now + sessionLifetime * 1000, now, tenant.id, techId, row.hash),
  ]);
  if (!saved[1].meta.changes) return invalid();
  return Response.json({ techId, isAdmin: row.isAdmin === 1, tenant: { id: tenant.id, name: tenant.name } }, { headers: { "Set-Cookie": techCookie(token, (request.headers.get("origin") || new URL(request.url).origin).startsWith("https:"), sessionLifetime), "Cache-Control": "no-store" } });
}
