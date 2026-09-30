import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isPlatformOwner } from "@/app/access";
import { hashPin, newPin, randomHex, sameOrigin } from "@/lib/tech-auth";
import { decryptPin, encryptPin } from "@/lib/pin-vault";

export const dynamic = "force-dynamic";

const reserved = new Set(["admin", "api", "app", "default", "owner", "qc", "www"]);

function slugBase(name: string): string {
  const value = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30).replace(/-$/, "");
  return value && !reserved.has(value) ? value : `company-${randomHex(3)}`;
}

async function availableSlug(name: string): Promise<string> {
  const base = slugBase(name);
  for (let index = 1; index <= 99; index++) {
    const suffix = index === 1 ? "" : `-${index}`;
    const candidate = `${base.slice(0, 30 - suffix.length)}${suffix}`;
    if (!await env.DB.prepare("SELECT 1 FROM tenants WHERE id = ?").bind(candidate).first()) return candidate;
  }
  return `company-${randomHex(6)}`;
}

async function availableSetupId(): Promise<string> {
  for (let index = 0; index < 20; index++) {
    const candidate = `SETUP-${randomHex(4).toUpperCase()}`;
    if (!await env.DB.prepare("SELECT 1 FROM technicians WHERE tech_id = ?").bind(candidate).first()) return candidate;
  }
  throw new Error("Could not generate setup ID");
}

function loginUrl(request: Request): string {
  const url = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || url.host;
  return `${protocol}://${host}/login`;
}

type CompanyRow = { id: string; name: string; active: number; adminTechId: string | null; credentialCiphertext: string | null; setupPending: number | null; technicianCount: number; qcCount: number; uploadedQcCount: number };

export async function GET() {
  const user = await getChatGPTUser();
  if (!isPlatformOwner(user)) return Response.json({ error: "Only the platform owner can manage companies." }, { status: 403 });
  try {
    const result = await env.DB.prepare(`SELECT t.id,t.name,t.active,(SELECT tech_id FROM technicians WHERE tenant_id=t.id AND is_admin=1 LIMIT 1) AS adminTechId,(SELECT pin_ciphertext FROM technicians WHERE tenant_id=t.id AND is_admin=1 LIMIT 1) AS credentialCiphertext,(SELECT must_change_credentials FROM technicians WHERE tenant_id=t.id AND is_admin=1 LIMIT 1) AS setupPending,(SELECT COUNT(*) FROM technicians WHERE tenant_id=t.id AND is_admin=0) AS technicianCount,(SELECT COUNT(*) FROM qc_submissions WHERE tenant_id=t.id) AS qcCount,(SELECT COUNT(*) FROM qc_submissions WHERE tenant_id=t.id AND status='approved' AND trust_upload_status='uploaded') AS uploadedQcCount FROM tenants t WHERE t.id<>'default' ORDER BY t.active DESC,t.name COLLATE NOCASE`).all<CompanyRow>();
    const companies = await Promise.all(result.results.map(async ({ credentialCiphertext, setupPending, active, ...company }) => ({ ...company, active: active === 1, setupPending: setupPending === 1, credential: credentialCiphertext ? await decryptPin(credentialCiphertext, env.PIN_ENCRYPTION_KEY) : null })));
    return Response.json({ companies }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Company list failed", error);
    return Response.json({ error: "Could not load companies." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getChatGPTUser();
  if (!isPlatformOwner(user)) return Response.json({ error: "Only the platform owner can add companies." }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) return Response.json({ error: "Enter a company name between 2 and 80 characters." }, { status: 400 });
  const now = Date.now();
  try {
    const [slug, setupId] = await Promise.all([availableSlug(name), availableSetupId()]);
    const setupPin = newPin();
    const salt = randomHex(16);
    const [hash, pinCiphertext] = await Promise.all([hashPin(setupPin, salt), encryptPin(setupPin, env.PIN_ENCRYPTION_KEY)]);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants(id,name,active,created_at) VALUES(?,?,1,?)").bind(slug, name, now),
      env.DB.prepare("INSERT INTO technicians(tenant_id,tech_id,pin_salt,pin_hash,pin_ciphertext,active,is_admin,must_change_credentials,failed_attempts,locked_until,created_at) VALUES(?,?,?,?,?,1,1,1,0,0,?)").bind(slug, setupId, salt, hash, pinCiphertext, now),
    ]);
    return Response.json({ company: { id: slug, name, setupId, setupPin, loginUrl: loginUrl(request) } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Company creation failed", error);
    return Response.json({ error: "Could not create the company. Try a different company name." }, { status: 503 });
  }
}
