import { env } from "@/lib/local-env";
import { credentialCandidates } from "@/lib/credential-auth";
import { ADMIN_SESSION_LIFETIME_SECONDS, hashToken, normalizeTechId, randomHex } from "@/lib/tech-auth";
import { trustError, trustNoStore } from "@/lib/trust-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return trustError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
  const body = await request.json().catch(() => null) as { techId?: unknown; password?: unknown; pin?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  const credential = body?.password ?? body?.pin;
  if (!techId || typeof credential !== "string" || credential.length < 5 || credential.length > 72) return trustError(400, "INVALID_LOGIN", "Enter the Admin ID and password.");

  const invalid = () => trustError(401, "INVALID_LOGIN", "Invalid Admin ID or password, or access is temporarily locked.");
  const { candidates, matches } = await credentialCandidates(env.DB, techId, credential, true);
  if (matches.length > 1) return trustError(409, "AMBIGUOUS_LOGIN", "These credentials match more than one company. Contact the platform owner before signing in.");
  if (matches.length === 0) {
    const now = Date.now();
    if (candidates.length === 1 && candidates[0].lockedUntil <= now) {
      await env.DB.prepare("UPDATE technicians SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts >= 4 THEN ? ELSE locked_until END WHERE tenant_id = ? AND tech_id = ? AND active = 1 AND is_admin = 1 AND locked_until <= ? AND failed_attempts < 5")
        .bind(now + 15 * 60_000, candidates[0].tenantId, techId, now).run();
    }
    return invalid();
  }

  const row = matches[0];
  if (row.mustSetup) return trustError(403, "ADMIN_SETUP_REQUIRED", "Finish setting up this company administrator in the TQA app before connecting the extension.");

  const now = Date.now();
  const token = randomHex(32);
  const expiresAt = now + ADMIN_SESSION_LIFETIME_SECONDS * 1000;
  const saved = await env.DB.batch([
    env.DB.prepare("UPDATE technicians SET failed_attempts = 0, locked_until = 0 WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1 AND is_admin = 1").bind(row.tenantId, techId, row.hash),
    env.DB.prepare("INSERT INTO tech_sessions (token_hash, tenant_id, tech_id, expires_at, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM technicians WHERE tenant_id = ? AND tech_id = ? AND pin_hash = ? AND active = 1 AND is_admin = 1)").bind(await hashToken(token), row.tenantId, techId, expiresAt, now, row.tenantId, techId, row.hash),
  ]);
  if (!saved[1].meta.changes) return invalid();
  return Response.json({ sessionToken: token, expiresAt, techId, tenant: { id: row.tenantId, name: row.tenantName } }, { headers: trustNoStore });
}
