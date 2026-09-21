import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { ADMIN_TECH_ID, hashPin, newPin, normalizeTechId, randomHex, sameOrigin } from "@/lib/tech-auth";
import { decryptPin, encryptPin } from "@/lib/pin-vault";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isOwner(await getChatGPTUser())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { start, end } = fiscalMonthBounds(fiscalMonthKey());
    const result = await env.DB.prepare("SELECT t.tech_id AS techId, COALESCE(q.total, 0) AS qcCount, 1 AS hasPin, t.pin_ciphertext AS pinCiphertext, COALESCE(r.state, 'active') AS state FROM technicians t LEFT JOIN (SELECT tech_id, COUNT(*) AS total FROM qc_submissions WHERE submitted_at >= ? AND submitted_at < ? GROUP BY tech_id) q ON q.tech_id = t.tech_id LEFT JOIN technician_removals r ON r.tech_id = t.tech_id WHERE t.active = 1 AND (r.state IS NULL OR r.state = 'deleting') ORDER BY t.tech_id").bind(start, end).all<{ techId: string; qcCount: number; hasPin: number; pinCiphertext: string | null; state: string }>();
    const technicians = await Promise.all(result.results.map(async ({ pinCiphertext, ...tech }) => ({ ...tech, isAdmin: tech.techId === ADMIN_TECH_ID, pin: pinCiphertext ? await decryptPin(pinCiphertext, env.PIN_ENCRYPTION_KEY) : null })));
    return Response.json({ technicians }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Technician list failed", error);
    return Response.json({ error: "Could not load technician PINs. Try again shortly." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!isOwner(await getChatGPTUser())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const body = await request.json().catch(() => null) as { techId?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  if (!techId) return Response.json({ error: "Enter a valid Tech ID." }, { status: 400 });
  if (techId === ADMIN_TECH_ID && process.env.TQA_ADMIN_PIN) return Response.json({ error: "The admin PIN is managed by the deployment environment." }, { status: 409 });
  const removal = await env.DB.prepare("SELECT state FROM technician_removals WHERE tech_id = ?").bind(techId).first<{ state: string }>();
  if (removal?.state === "deleting") return Response.json({ error: "Finish removing this technician before re-adding them." }, { status: 409 });
  try {
    const pin = newPin();
    const salt = randomHex(16);
    const [hash, pinCiphertext] = await Promise.all([hashPin(pin, salt), encryptPin(pin, env.PIN_ENCRYPTION_KEY)]);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO technicians (tech_id, pin_salt, pin_hash, pin_ciphertext, active, failed_attempts, locked_until, created_at) VALUES (?, ?, ?, ?, 1, 0, 0, ?) ON CONFLICT(tech_id) DO UPDATE SET pin_salt=excluded.pin_salt, pin_hash=excluded.pin_hash, pin_ciphertext=excluded.pin_ciphertext, active=1, failed_attempts=0, locked_until=0").bind(techId, salt, hash, pinCiphertext, now),
      env.DB.prepare("DELETE FROM tech_sessions WHERE tech_id = ?").bind(techId),
      env.DB.prepare("DELETE FROM technician_removals WHERE tech_id = ?").bind(techId),
    ]);
    return Response.json({ techId, pin }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Technician PIN issuance failed", error);
    return Response.json({ error: "Could not issue PIN. Try again shortly." }, { status: 503 });
  }
}
