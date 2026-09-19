import { env } from "@/lib/local-env";
import { equalHex, hashPin, hashToken, normalizeTechId, randomHex, sameOrigin, techCookie } from "@/lib/tech-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const body = await request.json().catch(() => null) as { techId?: unknown; pin?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  const pin = body?.pin;
  if (!techId || typeof pin !== "string" || !/^(?:\d{5}|\d{8})$/.test(pin)) return Response.json({ error: "Enter your Tech ID and PIN." }, { status: 400 });
  const row = await env.DB.prepare("SELECT pin_salt AS salt, pin_hash AS hash, pin_ciphertext AS pinCiphertext, active, locked_until AS lockedUntil FROM technicians WHERE tech_id = ?").bind(techId).first<{ salt: string; hash: string; pinCiphertext: string | null; active: number; lockedUntil: number }>();
  const invalid = () => Response.json({ error: "Invalid Tech ID or PIN, or access is temporarily locked." }, { status: 401 });
  if (!row || !row.active || row.lockedUntil > Date.now() || pin.length !== (row.pinCiphertext ? 5 : 8)) return invalid();
  const now = Date.now();
  if (row.lockedUntil > 0) await env.DB.prepare("UPDATE technicians SET failed_attempts = 0, locked_until = 0 WHERE tech_id = ? AND locked_until > 0 AND locked_until <= ?").bind(techId, now).run();
  const reserved = await env.DB.prepare("UPDATE technicians SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts >= 4 THEN ? ELSE locked_until END WHERE tech_id = ? AND pin_hash = ? AND active = 1 AND locked_until <= ? AND failed_attempts < 5")
    .bind(now + 15 * 60_000, techId, row.hash, now).run();
  if (!reserved.meta.changes) return invalid();
  const candidate = await hashPin(pin, row.salt);
  if (!equalHex(candidate, row.hash)) return invalid();
  const token = randomHex(32);
  const saved = await env.DB.batch([
    env.DB.prepare("UPDATE technicians SET failed_attempts = 0, locked_until = 0 WHERE tech_id = ? AND pin_hash = ? AND active = 1").bind(techId, row.hash),
    env.DB.prepare("INSERT INTO tech_sessions (token_hash, tech_id, expires_at, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM technicians WHERE tech_id = ? AND pin_hash = ? AND active = 1)").bind(await hashToken(token), techId, now + 12 * 60 * 60_000, now, techId, row.hash),
  ]);
  if (!saved[1].meta.changes) return invalid();
  return Response.json({ techId }, { headers: { "Set-Cookie": techCookie(token, (request.headers.get("origin") || new URL(request.url).origin).startsWith("https:")), "Cache-Control": "no-store" } });
}
