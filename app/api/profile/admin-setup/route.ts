import { env } from "@/lib/local-env";
import { credentialFingerprint, encryptPin } from "@/lib/pin-vault";
import { ADMIN_SESSION_LIFETIME_SECONDS, getCookie, getTechSessionContext, hashPin, hashToken, normalizeAdminId, randomHex, sameOrigin, TECH_COOKIE, techCookie, validAdminPassword } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getTechSessionContext(request, env.DB);
  const currentToken = getCookie(request, TECH_COOKIE);
  if (!session?.isAdmin || !session.mustSetup || !currentToken) return Response.json({ error: "This setup session is no longer valid." }, { status: 401 });
  const body = await request.json().catch(() => null) as { adminId?: unknown; password?: unknown } | null;
  const adminId = normalizeAdminId(body?.adminId);
  const password = body?.password;
  if (!adminId) return Response.json({ error: "Use at least 4 letters, numbers, underscores, or hyphens for the Admin ID." }, { status: 400 });
  if (!validAdminPassword(password)) return Response.json({ error: "Use at least 8 characters with at least one letter and one number." }, { status: 400 });

  const fingerprint = await credentialFingerprint(password, env.PIN_ENCRYPTION_KEY);
  const [duplicateId, duplicatePassword] = await Promise.all([
    env.DB.prepare("SELECT 1 FROM technicians WHERE tech_id = ? AND NOT (tenant_id = ? AND tech_id = ?)").bind(adminId, session.tenantId, session.techId).first(),
    env.DB.prepare("SELECT 1 FROM technicians WHERE is_admin = 1 AND credential_fingerprint = ?").bind(fingerprint).first(),
  ]);
  if (duplicateId) return Response.json({ error: "This Admin ID is not available. Change it and try again." }, { status: 409 });
  if (duplicatePassword) return Response.json({ error: "This password is not available. Change it and try again." }, { status: 409 });

  const salt = randomHex(16);
  const now = Date.now();
  const newToken = randomHex(32);
  const [passwordHash, passwordCiphertext, newTokenHash] = await Promise.all([
    hashPin(password, salt), encryptPin(password, env.PIN_ENCRYPTION_KEY), hashToken(newToken),
  ]);
  try {
    const result = await env.DB.batch([
      env.DB.prepare("DELETE FROM tech_sessions WHERE tenant_id = ? AND tech_id = ?").bind(session.tenantId, session.techId),
      env.DB.prepare("UPDATE technicians SET tech_id = ?, pin_salt = ?, pin_hash = ?, pin_ciphertext = ?, credential_fingerprint = ?, must_change_credentials = 0, failed_attempts = 0, locked_until = 0 WHERE tenant_id = ? AND tech_id = ? AND is_admin = 1 AND must_change_credentials = 1").bind(adminId, salt, passwordHash, passwordCiphertext, fingerprint, session.tenantId, session.techId),
      env.DB.prepare("INSERT INTO tech_sessions(token_hash,tenant_id,tech_id,expires_at,created_at) VALUES(?,?,?,?,?)").bind(newTokenHash, session.tenantId, adminId, now + ADMIN_SESSION_LIFETIME_SECONDS * 1000, now),
    ]);
    if (!result[1].meta.changes) return Response.json({ error: "This company administrator was already configured." }, { status: 409 });
  } catch (error) {
    console.error("Company admin setup failed", error);
    return Response.json({ error: "This Admin ID or password cannot be created. Change it and try again." }, { status: 409 });
  }
  const secure = (request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "")) === "https";
  return Response.json({ adminId, tenant: { id: session.tenantId, name: session.tenantName } }, { headers: { "Set-Cookie": techCookie(newToken, secure, ADMIN_SESSION_LIFETIME_SECONDS), "Cache-Control": "no-store" } });
}
