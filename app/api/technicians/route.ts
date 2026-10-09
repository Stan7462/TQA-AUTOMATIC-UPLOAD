import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { hashPin, newPin, normalizeTechId, randomHex, sameOrigin } from "@/lib/tech-auth";
import { credentialFingerprint, decryptPin, encryptPin } from "@/lib/pin-vault";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";
import { uniqueTechnicianPin } from "@/lib/credential-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!isOwner(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { start, end } = fiscalMonthBounds(fiscalMonthKey());
    const result = await env.DB.prepare("SELECT t.tech_id AS techId, t.is_admin AS isAdmin, t.monthly_qc_goal AS monthlyGoal, COALESCE(q.total, 0) AS qcCount, 1 AS hasPin, t.pin_ciphertext AS pinCiphertext, CASE WHEN t.active = 1 THEN 'active' ELSE 'disabled' END AS state FROM technicians t LEFT JOIN (SELECT tech_id, COUNT(*) AS total FROM qc_submissions WHERE tenant_id = ? AND submitted_at >= ? AND submitted_at < ? GROUP BY tech_id) q ON q.tech_id = t.tech_id WHERE t.tenant_id = ? AND t.is_admin = 0 ORDER BY t.active DESC, t.tech_id").bind(user!.tenantId, start, end, user!.tenantId).all<{ techId: string; isAdmin: number; qcCount: number; hasPin: number; monthlyGoal: number | null; pinCiphertext: string | null; state: string }>();
    const technicians = await Promise.all(result.results.map(async ({ pinCiphertext, isAdmin, ...tech }) => ({ ...tech, isAdmin: isAdmin === 1, pin: pinCiphertext ? await decryptPin(pinCiphertext, env.PIN_ENCRYPTION_KEY) : null })));
    return Response.json({ technicians }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Technician list failed", error);
    return Response.json({ error: "Could not load technician PINs. Try again shortly." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const user = await getChatGPTUser();
  if (!isOwner(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Unavailable" }, { status: 503 });
  const body = await request.json().catch(() => null) as { techId?: unknown; resetExisting?: unknown } | null;
  const techId = normalizeTechId(body?.techId);
  const resetExisting = body?.resetExisting === true;
  if (!techId) return Response.json({ error: "Enter a valid Tech ID." }, { status: 400 });
  if (techId === user!.techId) return Response.json({ error: "The administrator login is managed separately." }, { status: 409 });
  try {
    const existing = await env.DB.prepare("SELECT is_admin AS isAdmin FROM technicians WHERE tenant_id = ? AND tech_id = ?").bind(user!.tenantId, techId).first<{ isAdmin: number }>();
    if (existing?.isAdmin === 1) return Response.json({ error: "The administrator login is managed separately." }, { status: 409 });
    if (existing && !resetExisting) return Response.json({ error: "This Tech ID already exists in your company." }, { status: 409 });
    if (!existing && resetExisting) return Response.json({ error: "This Tech ID was not found in your company." }, { status: 404 });

    const pin = await uniqueTechnicianPin(env.DB, techId, newPin);
    const salt = randomHex(16);
    const [hash, pinCiphertext, fingerprint] = await Promise.all([
      hashPin(pin, salt),
      encryptPin(pin, env.PIN_ENCRYPTION_KEY),
      credentialFingerprint(pin, env.PIN_ENCRYPTION_KEY),
    ]);
    const now = Date.now();
    const saveTechnician = resetExisting
      ? env.DB.prepare("UPDATE technicians SET pin_salt = ?, pin_hash = ?, pin_ciphertext = ?, credential_fingerprint = ?, active = 1, failed_attempts = 0, locked_until = 0 WHERE tenant_id = ? AND tech_id = ? AND is_admin = 0").bind(salt, hash, pinCiphertext, fingerprint, user!.tenantId, techId)
      : env.DB.prepare("INSERT INTO technicians (tenant_id, tech_id, pin_salt, pin_hash, pin_ciphertext, credential_fingerprint, active, is_admin, failed_attempts, locked_until, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?)").bind(user!.tenantId, techId, salt, hash, pinCiphertext, fingerprint, now);
    await env.DB.batch([
      saveTechnician,
      env.DB.prepare("DELETE FROM tech_sessions WHERE tenant_id = ? AND tech_id = ?").bind(user!.tenantId, techId),
      env.DB.prepare("DELETE FROM technician_removals WHERE tenant_id = ? AND tech_id = ?").bind(user!.tenantId, techId),
    ]);
    return Response.json({ techId, pin }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Technician PIN issuance failed", error);
    if (String(error).includes("LOGIN_ID_NOT_AVAILABLE")) {
      return Response.json({ error: "This Tech ID is not available. Change it and try again." }, { status: 409 });
    }
    if (String(error).includes("UNIQUE constraint failed: technicians.tenant_id, technicians.tech_id")) {
      return Response.json({ error: "This Tech ID already exists in your company." }, { status: 409 });
    }
    return Response.json({ error: "Could not issue PIN. Try again shortly." }, { status: 503 });
  }
}
