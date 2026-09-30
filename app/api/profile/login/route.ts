import { env } from "@/lib/local-env";
import { credentialCandidates } from "@/lib/credential-auth";
import { ADMIN_SESSION_LIFETIME_SECONDS, hashToken, normalizeTechId, randomHex, sameOrigin, TECH_SESSION_LIFETIME_SECONDS, techCookie } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const body = await request.json().catch(() => null) as { techId?: unknown; pin?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  const credential = body?.pin;
  if (!techId || typeof credential !== "string" || credential.length < 5 || credential.length > 72) return Response.json({ error: "Enter your login ID and PIN or password." }, { status: 400 });

  const invalid = () => Response.json({ error: "Invalid login ID, PIN, or password, or access is temporarily locked." }, { status: 401 });
  const { candidates, matches } = await credentialCandidates(env.DB, techId, credential);
  if (matches.length > 1) return Response.json({ error: "These credentials match more than one company. Contact the platform owner before signing in." }, { status: 409 });
  if (matches.length === 0) {
    if (candidates.length === 1 && candidates[0].lockedUntil <= Date.now()) {
      await env.DB.prepare("UPDATE technicians SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts >= 4 THEN ? ELSE locked_until END WHERE tenant_id = ? AND tech_id = ? AND active = 1 AND locked_until <= ? AND failed_attempts < 5")
        .bind(Date.now() + 15 * 60_000, candidates[0].tenantId, techId, Date.now()).run();
    }
    return invalid();
  }

  const row = matches[0];
  if (!row.isAdmin && !/^\d{5}$/.test(credential)) return invalid();
  if (row.mustSetup === 1 && !/^\d{5}$/.test(credential)) return invalid();
  const now = Date.now();
  const token = randomHex(32);
  const sessionLifetime = row.isAdmin ? ADMIN_SESSION_LIFETIME_SECONDS : TECH_SESSION_LIFETIME_SECONDS;
  const saved = await env.DB.batch([
    env.DB.prepare("UPDATE technicians SET failed_attempts = 0, locked_until = 0 WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1").bind(row.tenantId, techId, row.hash),
    env.DB.prepare("INSERT INTO tech_sessions (token_hash, tenant_id, tech_id, expires_at, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM technicians WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1)").bind(await hashToken(token), row.tenantId, techId, now + sessionLifetime * 1000, now, row.tenantId, techId, row.hash),
  ]);
  if (!saved[1].meta.changes) return invalid();
  return Response.json({ techId, isAdmin: row.isAdmin === 1, requiresAdminSetup: row.mustSetup === 1, tenant: { id: row.tenantId, name: row.tenantName } }, { headers: { "Set-Cookie": techCookie(token, (request.headers.get("origin") || new URL(request.url).origin).startsWith("https:"), sessionLifetime), "Cache-Control": "no-store" } });
}
